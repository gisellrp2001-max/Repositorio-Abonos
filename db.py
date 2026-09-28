"""SQLite store. All writes are transactional; vouchers are kept as BLOBs."""
from __future__ import annotations
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
import os
import sqlite3
from security import encode, hash_password, verify_password

FIELDS = ('bank','operation_date','operation_time','operation_number','amount','currency','account','payer','reference','client_id')

def now():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')

def db_path():
    folder=Path(os.getenv('APP_DATA_DIR','./data')).resolve()
    folder.mkdir(parents=True,exist_ok=True)
    return folder/'abonos.sqlite3'

@contextmanager
def connect():
    conn=sqlite3.connect(db_path(),timeout=30)
    conn.row_factory=sqlite3.Row
    conn.execute('PRAGMA foreign_keys=ON')
    conn.execute('PRAGMA busy_timeout=30000')
    try:
        yield conn
        conn.commit()
    except BaseException:
        conn.rollback()
        raise
    finally:
        conn.close()

def initialize():
    with connect() as c:
        c.executescript('''
        CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('seller','management','admin')),password_hash TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS clients(id INTEGER PRIMARY KEY,name TEXT NOT NULL,ruc TEXT UNIQUE NOT NULL,assigned_user_id INTEGER REFERENCES users(id),active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS payments(id INTEGER PRIMARY KEY,code TEXT UNIQUE,client_id INTEGER NOT NULL REFERENCES clients(id),seller_id INTEGER NOT NULL REFERENCES users(id),bank TEXT NOT NULL,operation_date TEXT NOT NULL,operation_time TEXT,operation_number TEXT NOT NULL,amount REAL NOT NULL CHECK(amount>0),currency TEXT NOT NULL CHECK(currency IN ('PEN','USD')),account TEXT,payer TEXT,reference TEXT,status TEXT NOT NULL CHECK(status IN ('Enviado','Validado','Observado')),reviewer_id INTEGER REFERENCES users(id),observation TEXT,ocr_original TEXT NOT NULL DEFAULT '{}',ocr_text TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,updated_at TEXT NOT NULL,reviewed_at TEXT);
        CREATE INDEX IF NOT EXISTS ix_payments_status_created ON payments(status,created_at);
        CREATE INDEX IF NOT EXISTS ix_payments_client ON payments(client_id);
        CREATE INDEX IF NOT EXISTS ix_payments_seller ON payments(seller_id);
        CREATE INDEX IF NOT EXISTS ix_payments_duplicate ON payments(bank,operation_number,operation_date,client_id);
        CREATE TABLE IF NOT EXISTS attachments(id INTEGER PRIMARY KEY,payment_id INTEGER NOT NULL REFERENCES payments(id) ON DELETE CASCADE,filename TEXT NOT NULL,mime TEXT NOT NULL,size INTEGER NOT NULL,content BLOB NOT NULL);
        CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,payment_id INTEGER NOT NULL REFERENCES payments(id) ON DELETE CASCADE,actor_id INTEGER NOT NULL REFERENCES users(id),action TEXT NOT NULL,previous_status TEXT,new_status TEXT,details TEXT NOT NULL,created_at TEXT NOT NULL);
        ''')
        email=os.getenv('ADMIN_EMAIL','').strip().lower()
        password=os.getenv('ADMIN_PASSWORD','')
        if email and password and c.execute('SELECT COUNT(*) FROM users').fetchone()[0]==0:
            c.execute('INSERT INTO users(email,name,role,password_hash,created_at) VALUES(?,?,?,?,?)',(email,'Administrador','admin',hash_password(password),now()))

def bootstrap_ready():
    with connect() as c:
        return c.execute('SELECT COUNT(*) FROM users').fetchone()[0]>0

def authenticate(email,password):
    with connect() as c:
        row=c.execute('SELECT id,email,name,role,password_hash FROM users WHERE email=? AND active=1',(email.strip().lower(),)).fetchone()
        return {k:row[k] for k in ('id','email','name','role')} if row and verify_password(password,row['password_hash']) else None

def user_by_id(uid):
    with connect() as c:
        r=c.execute('SELECT id,email,name,role,active FROM users WHERE id=?',(uid,)).fetchone()
        return dict(r) if r and r['active'] else None

def users():
    with connect() as c:
        return [dict(r) for r in c.execute('SELECT id,email,name,role,active,created_at FROM users ORDER BY name')]

def create_user(actor,name,email,role,password):
    if actor['role']!='admin': raise PermissionError('Acceso restringido.')
    if role not in ('seller','management','admin'): raise ValueError('Rol inválido.')
    with connect() as c:
        c.execute('INSERT INTO users(email,name,role,password_hash,created_at) VALUES(?,?,?,?,?)',(email.strip().lower(),name.strip(),role,hash_password(password),now()))

def clients(user,search=''):
    with connect() as c:
        q='''SELECT c.*,u.name seller_name FROM clients c LEFT JOIN users u ON c.assigned_user_id=u.id WHERE c.active=1'''
        args=[]
        if user['role']=='seller': q+=' AND c.assigned_user_id=?';args.append(user['id'])
        if search: q+=' AND (c.name LIKE ? OR c.ruc LIKE ?)';args.extend([f'%{search}%',f'%{search}%'])
        q+=' ORDER BY c.name'
        return [dict(r) for r in c.execute(q,args)]

def create_client(actor,name,ruc,seller_id):
    if actor['role'] not in ('management','admin'):raise PermissionError('Acceso restringido.')
    if len(ruc)!=11 or not ruc.isdigit():raise ValueError('El RUC debe tener 11 dígitos.')
    with connect() as c:
        seller=c.execute("SELECT id FROM users WHERE id=? AND role='seller' AND active=1",(seller_id,)).fetchone()
        if not seller: raise ValueError('Selecciona un vendedor activo.')
        c.execute('INSERT INTO clients(name,ruc,assigned_user_id,created_at) VALUES(?,?,?,?)',(name.strip(),ruc,seller_id,now()))

def payments(user,search='',status='',client_id=None):
    with connect() as c:
        q='''SELECT p.*,c.name client_name,c.ruc,u.name seller_name,r.name reviewer_name,(SELECT COUNT(*) FROM attachments a WHERE a.payment_id=p.id) attachment_count FROM payments p JOIN clients c ON c.id=p.client_id JOIN users u ON u.id=p.seller_id LEFT JOIN users r ON r.id=p.reviewer_id WHERE 1=1'''
        args=[]
        if user['role']=='seller':q+=' AND p.seller_id=?';args.append(user['id'])
        if status:q+=' AND p.status=?';args.append(status)
        if client_id:q+=' AND p.client_id=?';args.append(client_id)
        if search:q+=' AND (p.code LIKE ? OR c.name LIKE ? OR c.ruc LIKE ? OR p.operation_number LIKE ?)';args.extend([f'%{search}%']*4)
        q+=' ORDER BY p.created_at DESC,p.id DESC LIMIT 1000'
        return [dict(r) for r in c.execute(q,args)]

def payment(user,pid):
    with connect() as c:
        r=c.execute('''SELECT p.*,c.name client_name,c.ruc,u.name seller_name,r.name reviewer_name FROM payments p JOIN clients c ON c.id=p.client_id JOIN users u ON u.id=p.seller_id LEFT JOIN users r ON r.id=p.reviewer_id WHERE p.id=?''',(pid,)).fetchone()
        if not r or user['role']=='seller' and r['seller_id']!=user['id']:raise PermissionError('Registro no disponible.')
        return dict(r)

def duplicates(user,data):
    with connect() as c:
        rows=c.execute('''SELECT p.id,p.code,p.amount,p.currency,p.status,c.name client_name FROM payments p JOIN clients c ON c.id=p.client_id WHERE p.bank=? AND p.operation_number=? AND p.operation_date=? AND p.client_id=? AND ABS(p.amount-?)<0.01 AND p.currency=? ORDER BY p.id DESC LIMIT 5''',(data['bank'],data['operation_number'],data['operation_date'],data['client_id'],data['amount'],data['currency'])).fetchall()
        return [dict(r) for r in rows if user['role']!='seller' or c_owner(user,r['id'])]

def c_owner(user,pid):
    with connect() as c:return bool(c.execute('SELECT 1 FROM payments WHERE id=? AND seller_id=?',(pid,user['id'])).fetchone())

def create_payment(user,data,files,ocr_original,ocr_text,duplicate_confirmed=False):
    if user['role']!='seller':raise PermissionError('Solo los vendedores registran abonos.')
    if not files:raise ValueError('Adjunta al menos un voucher.')
    if len(files)>20 or sum(len(f['content']) for f in files)>50*1024*1024:raise ValueError('Superaste el límite de archivos.')
    if any(f['mime'] not in ('image/jpeg','image/png','application/pdf') or len(f['content'])>10*1024*1024 for f in files):raise ValueError('Archivo inválido o mayor a 10 MB.')
    if not str(data.get('operation_number','')).strip() or float(data.get('amount',0))<=0:raise ValueError('Completa número de operación e importe.')
    if data.get('currency') not in ('PEN','USD'):raise ValueError('Moneda inválida.')
    with connect() as c:
        client=c.execute('SELECT id FROM clients WHERE id=? AND assigned_user_id=? AND active=1',(data['client_id'],user['id'])).fetchone()
        if not client:raise PermissionError('El cliente no está asignado a tu usuario.')
        collision=c.execute('''SELECT id FROM payments WHERE bank=? AND operation_number=? AND operation_date=? AND client_id=? AND ABS(amount-?)<0.01 AND currency=? LIMIT 1''',(data['bank'],data['operation_number'],data['operation_date'],data['client_id'],data['amount'],data['currency'])).fetchone()
        if collision and not duplicate_confirmed:raise ValueError('Posible duplicado. Confirma antes de enviar.')
        stamp=now()
        values=[data.get(k) for k in FIELDS]
        cur=c.execute(f"INSERT INTO payments({','.join(FIELDS)},seller_id,status,ocr_original,ocr_text,created_at,updated_at) VALUES({','.join(['?']*len(FIELDS))},?,?,?,?,?,?)",values+[user['id'],'Enviado',encode(ocr_original),ocr_text,stamp,stamp])
        pid=cur.lastrowid;code=f'AB-{datetime.now(timezone.utc).year}-{pid:06d}'
        c.execute('UPDATE payments SET code=? WHERE id=?',(code,pid))
        for f in files:c.execute('INSERT INTO attachments(payment_id,filename,mime,size,content) VALUES(?,?,?,?,?)',(pid,f['name'],f['mime'],len(f['content']),f['content']))
        c.execute('INSERT INTO audit(payment_id,actor_id,action,new_status,details,created_at) VALUES(?,?,?,?,?,?)',(pid,user['id'],'Registrado','Enviado',encode({'attachments':[f['name'] for f in files],'duplicate_confirmed':duplicate_confirmed}),stamp))
        return pid,code

def attachments(user,pid):
    payment(user,pid)
    with connect() as c:return [dict(r) for r in c.execute('SELECT id,filename,mime,size FROM attachments WHERE payment_id=? ORDER BY id',(pid,))]

def attachment(user,pid,aid):
    payment(user,pid)
    with connect() as c:
        r=c.execute('SELECT filename,mime,content FROM attachments WHERE id=? AND payment_id=?',(aid,pid)).fetchone()
        if not r:raise ValueError('Adjunto no encontrado.')
        return dict(r)

def history(user,pid):
    payment(user,pid)
    with connect() as c:return [dict(r) for r in c.execute('SELECT a.*,u.name actor_name FROM audit a JOIN users u ON u.id=a.actor_id WHERE a.payment_id=? ORDER BY a.id DESC',(pid,))]

def review(user,pid,status,observation):
    if user['role'] not in ('management','admin'):raise PermissionError('Acceso restringido.')
    if status not in ('Validado','Observado'):raise ValueError('Estado inválido.')
    if status=='Observado' and not observation.strip():raise ValueError('Escribe el motivo de la observación.')
    with connect() as c:
        r=c.execute('SELECT status FROM payments WHERE id=?',(pid,)).fetchone()
        if not r or r['status']!='Enviado':raise ValueError('Este registro ya fue procesado.')
        stamp=now()
        c.execute('UPDATE payments SET status=?,observation=?,reviewer_id=?,reviewed_at=?,updated_at=? WHERE id=?',(status,observation.strip(),user['id'],stamp,stamp,pid))
        c.execute('INSERT INTO audit(payment_id,actor_id,action,previous_status,new_status,details,created_at) VALUES(?,?,?,?,?,?,?)',(pid,user['id'],'Revisión',r['status'],status,encode({'observation':observation.strip()}),stamp))

def correct(user,pid,updates):
    if user['role']!='seller':raise PermissionError('Acceso restringido.')
    allowed=('bank','operation_date','operation_time','operation_number','amount','currency','account','payer','reference')
    with connect() as c:
        r=c.execute('SELECT * FROM payments WHERE id=? AND seller_id=?',(pid,user['id'])).fetchone()
        if not r or r['status']!='Observado':raise ValueError('Solo puedes corregir un abono observado propio.')
        before={k:r[k] for k in allowed if k in updates and str(r[k] or '')!=str(updates[k] or '')}
        if not before:raise ValueError('Modifica al menos un dato.')
        changes={k:updates[k] for k in before}
        stamp=now()
        c.execute(f"UPDATE payments SET {','.join(f'{k}=?' for k in changes)},status='Enviado',updated_at=? WHERE id=?",list(changes.values())+[stamp,pid])
        c.execute('INSERT INTO audit(payment_id,actor_id,action,previous_status,new_status,details,created_at) VALUES(?,?,?,?,?,?,?)',(pid,user['id'],'Corregido y reenviado','Observado','Enviado',encode({'before':before,'after':changes}),stamp))

def change_password(user,old_password,new_password):
    with connect() as c:
        r=c.execute('SELECT password_hash FROM users WHERE id=? AND active=1',(user['id'],)).fetchone()
        if not r or not verify_password(old_password,r['password_hash']):raise ValueError('La contraseña actual es incorrecta.')
        c.execute('UPDATE users SET password_hash=? WHERE id=?',(hash_password(new_password),user['id']))

def reset_password(actor,target_id,new_password):
    if actor['role']!='admin':raise PermissionError('Acceso restringido.')
    with connect() as c:
        if not c.execute('SELECT id FROM users WHERE id=?',(target_id,)).fetchone():raise ValueError('Usuario no encontrado.')
        c.execute('UPDATE users SET password_hash=? WHERE id=?',(hash_password(new_password),target_id))
