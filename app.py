"""Gestión de Abonos — Streamlit application."""
from __future__ import annotations
from datetime import datetime
from zoneinfo import ZoneInfo
from io import BytesIO
import json
import os
import sqlite3
import streamlit as st
import pandas as pd
import db
import ocr

st.set_page_config(page_title='Gestión de Abonos',page_icon='💳',layout='wide',initial_sidebar_state='expanded')
st.markdown('''<style>
[data-testid="stAppViewContainer"]{background:#f3f6f8} [data-testid="stSidebar"]{background:#123951;color:white}
[data-testid="stSidebar"] *{color:#eaf4f6!important} [data-testid="stSidebar"] button{color:#213d50!important}
.block-container{padding-top:1.8rem;max-width:1450px}.hero{background:white;padding:22px 26px;border:1px solid #e1e9ed;border-radius:14px;margin-bottom:20px}.hero h1{font-size:1.75rem;margin:0;color:#203249}.hero p{color:#6c7e8b;margin:.4rem 0 0}.small{color:#728594;font-size:.9rem}
div[data-testid="stMetric"]{background:white;border:1px solid #e3ebef;border-radius:13px;padding:18px}div[data-testid="stVerticalBlockBorderWrapper"]>div{border-color:#e3ebef!important}
</style>''',unsafe_allow_html=True)

BANKS=['BCP','BBVA','Interbank','Scotiabank','BanBif','Otro']
LABELS={'bank':'Banco','operation_date':'Fecha','operation_time':'Hora','operation_number':'N° operación','amount':'Importe','currency':'Moneda','account':'Cuenta destino','payer':'Ordenante','reference':'Referencia'}

def header(title,subtitle=''):
    st.markdown(f'<div class="hero"><h1>{title}</h1><p>{subtitle}</p></div>',unsafe_allow_html=True)

def fmt_money(amount,currency='PEN'):
    return f"{'S/' if currency=='PEN' else 'US$'} {float(amount):,.2f}"

def fmt_time(value):
    try:return datetime.fromisoformat(value).astimezone(ZoneInfo('America/Lima')).strftime('%d/%m/%Y %H:%M')
    except Exception:return str(value or '—')

def safe(action):
    try:return action()
    except (ValueError,PermissionError,sqlite3.IntegrityError) as exc:
        st.error(str(exc));return None

def login():
    header('Gestión de Abonos','Accede con tu cuenta asignada.')
    if not db.bootstrap_ready():
        st.error('Falta configurar el administrador inicial. Define ADMIN_EMAIL y ADMIN_PASSWORD en .env y reinicia.');st.stop()
    with st.form('login'):
        email=st.text_input('Correo corporativo').strip().lower()
        password=st.text_input('Contraseña',type='password')
        submitted=st.form_submit_button('Ingresar',type='primary',width='stretch')
    if submitted:
        user=db.authenticate(email,password)
        if not user:st.error('Credenciales incorrectas o cuenta desactivada.')
        else:st.session_state.user=user;st.rerun()
    st.stop()

def current_user():
    if 'user' not in st.session_state:login()
    u=db.user_by_id(st.session_state.user['id'])
    if not u:st.session_state.pop('user',None);login()
    st.session_state.user=u
    return u

def choose_navigation(user):
    st.sidebar.markdown('## Gestión de Abonos')
    st.sidebar.caption(f"{user['name']} · {'Vendedor' if user['role']=='seller' else 'Gestión' if user['role']=='management' else 'Administrador'}")
    options=['Inicio','Nuevo abono','Mis abonos','Clientes'] if user['role']=='seller' else ['Inicio','Gestión de abonos','Clientes','Reportes']
    if user['role']=='admin':options.append('Usuarios')
    target=st.session_state.pop('navigate_to',None)
    if target in options:
        st.session_state.page=target
        st.session_state.nav_radio=target
    if st.session_state.get('page') not in options:st.session_state.page='Inicio'
    if st.session_state.get('nav_radio') not in options:st.session_state.nav_radio=st.session_state.page
    previous=st.session_state.page
    page=st.sidebar.radio('Navegación',options,key='nav_radio')
    if page!=previous and not target:
        st.session_state.pop('detail_id',None)
        st.session_state.pop('correct_id',None)
    st.session_state.page=page
    st.sidebar.divider()
    with st.sidebar.expander('Cambiar mi contraseña'):
        with st.form('change_password'):
            old=st.text_input('Contraseña actual',type='password')
            new=st.text_input('Nueva contraseña (mínimo 12 caracteres)',type='password')
            if st.form_submit_button('Actualizar'):
                try:db.change_password(user,old,new);st.success('Contraseña actualizada.')
                except ValueError as exc:st.error(str(exc))
    if st.sidebar.button('Cerrar sesión'):
        for key in list(st.session_state):del st.session_state[key]
        st.rerun()
    return page

def go(page,pid=None):
    st.session_state.navigate_to=page
    if pid is not None:st.session_state.detail_id=pid
    st.rerun()

def metrics(items):
    cols=st.columns(len(items))
    for col,(label,value) in zip(cols,items):col.metric(label,value)

def table_view(user,rows,management=False):
    if not rows:st.info('No se encontraron abonos.');return
    for r in rows:
        with st.container(border=True):
            cols=st.columns([1.5,2.7,1.2,1.5,1.1,1.1])
            cols[0].markdown(f"**{r['code']}**  \n{r['operation_date']}")
            cols[1].markdown(f"**{r['client_name']}**  \n{r['ruc']}")
            cols[2].markdown(f"{r['bank']}  \n{r['operation_number']}")
            cols[3].markdown(f"**{fmt_money(r['amount'],r['currency'])}**  \n{r['attachment_count']} archivo(s)")
            cols[4].badge(r['status'],color={'Enviado':'orange','Validado':'green','Observado':'red'}[r['status']])
            if cols[5].button('Revisar' if management and r['status']=='Enviado' else 'Ver detalle',key=f"row_{user['role']}_{r['id']}"):
                st.session_state.detail_id=r['id'];st.rerun()

def detail(user,pid):
    try:r=db.payment(user,pid)
    except PermissionError:
        st.error('No tienes acceso a este registro.');st.session_state.pop('detail_id',None);return
    if st.button('← Volver',key='back_detail'):
        st.session_state.pop('detail_id',None);st.rerun()
    header(f"{r['code']} · {r['status']}",f"{r['client_name']} · RUC {r['ruc']} · Registrado {fmt_time(r['created_at'])}")
    if r['status']=='Observado':st.error(f"Observación de Gestión: {r['observation']}")
    left,right=st.columns([1.15,1],gap='large')
    with left:
        st.subheader('Información del abono')
        data=[('Cliente',r['client_name']),('RUC',r['ruc']),('Banco',r['bank']),('Fecha',r['operation_date']),('Hora',r['operation_time'] or '—'),('N° operación',r['operation_number']),('Importe',fmt_money(r['amount'],r['currency'])),('Moneda',r['currency']),('Cuenta',r['account'] or '—'),('Ordenante',r['payer'] or '—'),('Referencia',r['reference'] or '—'),('Registrado por',r['seller_name']),('Revisado por',r['reviewer_name'] or '—')]
        for label,value in data:st.markdown(f'**{label}:** {value}')
        with st.expander('Lectura OCR original y cambios'):
            original=json.loads(r['ocr_original'] or '{}')
            if original:st.json(original)
            else:st.caption('No se detectaron datos automáticamente.')
    with right:
        st.subheader('Archivos adjuntos')
        items=db.attachments(user,pid)
        if not items:st.info('No hay archivos adjuntos.')
        for i,a in enumerate(items):
            with st.expander(f"{a['filename']} · {a['size']/1024:.0f} KB",expanded=i==0):
                blob=db.attachment(user,pid,a['id'])
                if a['mime'].startswith('image/'):
                    try:st.image(blob['content'],width='stretch')
                    except Exception:st.warning('No se pudo mostrar la vista previa. Descarga el archivo para revisarlo.')
                elif a['mime']=='application/pdf':st.pdf(blob['content'],height=480) if hasattr(st,'pdf') else st.caption('Descarga el PDF para revisarlo.')
                st.download_button('Descargar archivo',blob['content'],file_name=a['filename'],mime=a['mime'],key=f"download_{a['id']}")
        if user['role'] in ('management','admin') and r['status']=='Enviado':
            st.subheader('Gestión')
            c1,c2=st.columns(2)
            if c1.button('Validar abono',type='primary',width='stretch'):
                st.session_state.review_pending=(pid,'Validado');st.rerun()
            if c2.button('Marcar observado',width='stretch'):
                st.session_state.review_pending=(pid,'Observado');st.rerun()
        if user['role']=='seller' and r['status']=='Observado':
            if st.button('Corregir información',type='primary'):st.session_state.correct_id=pid;st.rerun()
    st.divider();st.subheader('Historial')
    for e in db.history(user,pid):
        detail_text=json.loads(e['details'] or '{}')
        st.markdown(f"**{e['action']}** · {e['actor_name']} · {fmt_time(e['created_at'])}  \n{e['previous_status'] or '—'} → {e['new_status'] or '—'}")
        if detail_text.get('observation'):st.caption(detail_text['observation'])
        if detail_text.get('before'):
            with st.expander('Ver campos corregidos'):st.json(detail_text)

@st.dialog('Confirmar decisión',dismissible=False)
def confirm_review(pid,status):
    user=st.session_state.user
    r=db.payment(user,pid)
    st.subheader('Validar abono' if status=='Validado' else 'Marcar como observado')
    st.write(f"{r['code']} · {r['client_name']} · {fmt_money(r['amount'],r['currency'])}")
    st.info('Comprueba los datos y todos los archivos antes de confirmar.' if status=='Validado' else 'El vendedor verá tu observación y podrá corregir el registro.')
    with st.form('review_dialog'):
        note=st.text_area('Observación'+(' (obligatoria)' if status=='Observado' else ' (opcional)'))
        cancel=st.form_submit_button('Cancelar')
        submitted=st.form_submit_button('Confirmar validación' if status=='Validado' else 'Enviar observación',type='primary')
        if cancel:st.session_state.pop('review_pending',None);st.rerun()
        if submitted:
            try:
                db.review(user,pid,status,note)
                st.session_state.pop('review_pending',None)
                st.session_state.detail_id=pid;st.rerun()
            except (ValueError,PermissionError) as exc:st.error(str(exc))

def correction(user,pid):
    r=db.payment(user,pid)
    if r['status']!='Observado':st.session_state.pop('correct_id',None);st.rerun()
    if st.button('← Cancelar corrección'):st.session_state.pop('correct_id',None);st.rerun()
    header(f"Corregir {r['code']}",r['observation'] or '')
    with st.form('correction'):
        b=st.selectbox('Banco',BANKS,index=BANKS.index(r['bank']) if r['bank'] in BANKS else 0)
        a,z=st.columns(2)
        date=a.date_input('Fecha de operación',value=datetime.fromisoformat(r['operation_date']).date())
        hour=z.text_input('Hora',value=r['operation_time'] or '')
        op=st.text_input('N° operación',value=r['operation_number'])
        amount=st.number_input('Importe',min_value=0.01,value=float(r['amount']),step=0.01)
        currency=st.selectbox('Moneda',['PEN','USD'],index=['PEN','USD'].index(r['currency']))
        account=st.text_input('Cuenta destino',value=r['account'] or '')
        payer=st.text_input('Ordenante',value=r['payer'] or '')
        reference=st.text_input('Referencia',value=r['reference'] or '')
        if st.form_submit_button('Reenviar para validación',type='primary'):
            updates=dict(bank=b,operation_date=date.isoformat(),operation_time=hour,operation_number=op.strip(),amount=amount,currency=currency,account=account,payer=payer,reference=reference)
            if not op.strip():st.error('Ingresa el número de operación.')
            else:
                try:db.correct(user,pid,updates);st.session_state.pop('correct_id',None);st.success('Corregido y reenviado.');st.rerun()
                except (ValueError,PermissionError) as e:st.error(str(e))

def upload_list():
    uploads=st.file_uploader('Voucher o comprobantes',type=['jpg','jpeg','png','pdf'],accept_multiple_files=True,help='Puedes cargar varios archivos; hasta 10 MB cada uno y 50 MB en total.')
    return uploads or []

def get_file_data(uploads):
    files=[]
    for up in uploads:
        content=up.getvalue()
        if len(content)>10*1024*1024:raise ValueError(f'{up.name} excede 10 MB.')
        mime=up.type
        if mime not in ('image/jpeg','image/png','application/pdf'):raise ValueError(f'Formato no permitido: {up.name}')
        try:
            if mime.startswith('image/'):
                from PIL import Image
                Image.open(BytesIO(content)).verify()
            else:
                import fitz
                document=fitz.open(stream=content,filetype='pdf')
                if document.page_count>5:raise ValueError('Máximo 5 páginas por PDF.')
                document.close()
        except ValueError:raise
        except Exception:raise ValueError(f'{up.name} no es un archivo válido o está dañado.')
        files.append({'name':up.name.rsplit('/',1)[-1].rsplit('\\',1)[-1][:120],'mime':mime,'content':content})
    if sum(len(f['content']) for f in files)>50*1024*1024:raise ValueError('El total de archivos supera 50 MB.')
    return files

def new_payment(user):
    header('Nuevo abono','Carga los vouchers, revisa la lectura y envía el registro a Gestión.')
    st.markdown('#### 1. Adjuntar archivos')
    uploads=upload_list()
    if uploads:
        st.caption(' · '.join(f'{f.name} ({f.size/1024:.0f} KB)' for f in uploads))
        if st.button('Leer archivos con OCR',type='primary'):
            try:
                files=get_file_data(uploads)
                with st.spinner('Leyendo vouchers...'):
                    detected,text,errors=ocr.extract([(f['name'],f['content']) for f in files])
                st.session_state.pop('draft',None)
                st.session_state.ocr_result=detected;st.session_state.ocr_text=text
                st.session_state.ocr_errors=errors
                st.session_state.ocr_signature=[(f['name'],len(f['content'])) for f in files]
                st.rerun()
            except ValueError as exc:st.error(str(exc))
    signature=[(f.name,f.size) for f in uploads]
    if not uploads or st.session_state.get('ocr_signature')!=signature:
        st.info('Adjunta los archivos y pulsa «Leer archivos con OCR» para continuar.');return
    detected=st.session_state.ocr_result
    for err in st.session_state.get('ocr_errors',[]):st.warning(err)
    st.markdown('#### 2. Revisar datos detectados')
    st.caption('La lectura puede cometer errores. Comprueba cada campo contra el voucher antes de enviarlo.')
    left,right=st.columns([1,1.15],gap='large')
    with left:
        for up in uploads:
            with st.expander(up.name,expanded=up==uploads[0]):
                if up.type.startswith('image/'):st.image(up.getvalue(),width='stretch')
                else:st.caption('PDF adjunto. Puedes abrirlo desde el archivo original antes de confirmar.')
    with right:
        all_clients=db.clients(user)
        if not all_clients:st.warning('No tienes clientes asignados. Gestión debe registrar y asignar uno antes de continuar.');return
        def found(k):return detected[k]['value']
        with st.form('payment_form'):
            bank=st.selectbox('Banco · '+detected['bank']['confidence'],BANKS,index=BANKS.index(found('bank')) if found('bank') in BANKS else 0)
            c1,c2=st.columns(2)
            try:initial_date=datetime.fromisoformat(found('date')).date()
            except ValueError:initial_date='today'
            op_date=c1.date_input('Fecha · '+detected['date']['confidence'],value=initial_date)
            op_time=c2.text_input('Hora · '+detected['time']['confidence'],value=found('time'))
            operation=st.text_input('N° operación · '+detected['operation']['confidence'],value=found('operation'))
            c1,c2=st.columns(2)
            amount=c1.number_input('Importe · '+detected['amount']['confidence'],min_value=0.0,value=float(found('amount') or 0),step=0.01,format='%.2f')
            currency=c2.selectbox('Moneda',['PEN','USD'],index=1 if found('currency')=='USD' else 0)
            account=st.text_input('Cuenta destino',value=found('account'))
            payer=st.text_input('Ordenante / pagador',value=found('payer'))
            reference=st.text_input('Referencia',value=found('reference'))
            chosen=st.selectbox('Cliente',all_clients,format_func=lambda x:f"{x['name']} · {x['ruc']}")
            reviewed=st.checkbox('He revisado los datos y todos los vouchers.')
            inspect=st.form_submit_button('Revisar antes de enviar',type='primary')
        if inspect:
            if not operation.strip() or amount<=0 or not reviewed:st.error('Completa número de operación e importe, y confirma la revisión.')
            else:
                st.session_state.draft=dict(bank=bank,operation_date=op_date.isoformat(),operation_time=op_time.strip(),operation_number=operation.strip(),amount=amount,currency=currency,account=account.strip(),payer=payer.strip(),reference=reference.strip(),client_id=chosen['id'],client_name=chosen['name'])
                st.rerun()
    draft=st.session_state.get('draft')
    if draft and st.session_state.get('ocr_signature')==signature:
        with st.container(border=True):
            st.subheader('3. Confirmar envío')
            st.write(f"**{draft['client_name']}** · {draft['bank']} · {draft['operation_date']} · Operación {draft['operation_number']} · {fmt_money(draft['amount'],draft['currency'])}")
            st.caption(f'{len(uploads)} archivo(s) adjunto(s)')
            matches=db.duplicates(user,draft)
            duplicate_confirmed=False
            if matches:
                st.warning(f"Posible duplicado: {', '.join(m['code'] for m in matches)}. Revisa el registro existente antes de continuar.")
                duplicate_confirmed=st.checkbox('Confirmo que este abono debe registrarse igualmente.',key='dup_ok')
            if st.button('Confirmar y enviar',type='primary',disabled=bool(matches) and not duplicate_confirmed):
                try:
                    files=get_file_data(uploads)
                    pid,code=db.create_payment(user,draft,files,detected,st.session_state.ocr_text,duplicate_confirmed)
                    for key in ('draft','ocr_result','ocr_text','ocr_signature','ocr_errors'):st.session_state.pop(key,None)
                    st.session_state.detail_id=pid;st.session_state.navigate_to='Mis abonos';st.success(f'{code} enviado a Gestión.');st.rerun()
                except (ValueError,PermissionError,sqlite3.Error) as exc:st.error(str(exc))

def home(user):
    rows=db.payments(user)
    if user['role']=='seller':
        header(f"Hola, {user['name'].split()[0]}",'Gestiona los abonos de tus clientes.')
        metrics([('Registrados',len(rows)),('Enviados',sum(r['status']=='Enviado' for r in rows)),('Validados',sum(r['status']=='Validado' for r in rows)),('Observados',sum(r['status']=='Observado' for r in rows))])
        if st.button('＋ Registrar nuevo abono',type='primary'):go('Nuevo abono')
        st.subheader('Abonos recientes');table_view(user,rows[:8])
    else:
        header('Gestión de Abonos','Revisa y valida los abonos del equipo comercial.')
        pending=sorted((r for r in rows if r['status']=='Enviado'),key=lambda r:r['created_at'])
        today=datetime.now(ZoneInfo('America/Lima')).date().isoformat()
        metrics([('Pendientes',len(pending)),('Validados hoy',sum(r['status']=='Validado' and (r['reviewed_at'] or '').startswith(today) for r in rows)),('Observados',sum(r['status']=='Observado' for r in rows)),('Monto pendiente (PEN)',fmt_money(sum(r['amount'] for r in pending if r['currency']=='PEN')))])
        st.subheader('Pendientes de revisión · más antiguos primero');table_view(user,pending[:20],True)

def listing(user,management=False):
    header('Gestión de abonos' if management else 'Mis abonos','Consulta registros, estados y archivos adjuntos.')
    c1,c2,c3=st.columns([2,1,1])
    search=c1.text_input('Buscar por código, cliente, RUC u operación')
    status=c2.selectbox('Estado',['Todos','Enviado','Validado','Observado'])
    bank=c3.selectbox('Banco',['Todos']+BANKS)
    rows=db.payments(user,search,'' if status=='Todos' else status)
    seller_names=sorted({r['seller_name'] for r in rows})
    client_names=sorted({r['client_name'] for r in rows})
    c1,c2,c3,c4=st.columns(4)
    seller=c1.selectbox('Vendedor',['Todos']+seller_names) if management else 'Todos'
    client=c2.selectbox('Cliente',['Todos']+client_names)
    currency=c3.selectbox('Moneda',['Todos','PEN','USD'])
    since=c4.date_input('Desde',value=None)
    c5,c6=st.columns([1,3]);until=c5.date_input('Hasta',value=None)
    rows=[r for r in rows if (bank=='Todos' or r['bank']==bank) and (seller=='Todos' or r['seller_name']==seller) and (client=='Todos' or r['client_name']==client) and (currency=='Todos' or r['currency']==currency) and (not since or r['operation_date']>=since.isoformat()) and (not until or r['operation_date']<=until.isoformat())]
    st.caption(f'{len(rows)} registro(s) · mostrando hasta 25 por página')
    pages=max(1,(len(rows)+24)//25)
    page_number=st.number_input('Página',min_value=1,max_value=pages,value=1,step=1) if pages>1 else 1
    table_view(user,rows[(page_number-1)*25:page_number*25],management)

def clients_view(user):
    header('Clientes','Perfiles y registros asociados.')
    search=st.text_input('Buscar por nombre o RUC',key='client_search')
    options=db.clients(user,search)
    if user['role'] in ('management','admin'):
        with st.expander('＋ Registrar cliente'):
            sellers=[u for u in db.users() if u['role']=='seller' and u['active']]
            if not sellers:st.info('Crea primero un usuario vendedor.')
            else:
                with st.form('create_client'):
                    name=st.text_input('Razón social');ruc=st.text_input('RUC',max_chars=11)
                    seller=st.selectbox('Vendedor asignado',sellers,format_func=lambda u:u['name'])
                    if st.form_submit_button('Guardar cliente',type='primary'):
                        if not name.strip():st.error('Ingresa la razón social.')
                        else:
                            try:db.create_client(user,name,ruc,seller['id']);st.success('Cliente registrado.');st.rerun()
                            except (ValueError,PermissionError,sqlite3.IntegrityError) as e:st.error(str(e))
    if not options:st.info('No hay clientes con ese criterio.');return
    selected=st.selectbox('Seleccionar cliente',options,format_func=lambda c:f"{c['name']} · {c['ruc']}")
    rows=db.payments(user,client_id=selected['id'])
    st.subheader(selected['name']);st.caption(f"RUC {selected['ruc']} · Vendedor {selected['seller_name']} · Activo")
    metrics([('Total abonado (PEN)',fmt_money(sum(r['amount'] for r in rows if r['currency']=='PEN'))),('Abonos',len(rows)),('Pendientes',sum(r['status']=='Enviado' for r in rows)),('Último abono',rows[0]['operation_date'] if rows else '—')])
    tab1,tab2=st.tabs(['Abonos','Información'])
    with tab1:table_view(user,rows)
    with tab2:st.write({'Razón social':selected['name'],'RUC':selected['ruc'],'Vendedor':selected['seller_name'],'Estado':'Activo'})

def reports(user):
    header('Reportes','Indicadores de los abonos registrados.')
    rows=db.payments(user)
    if not rows:st.info('Todavía no hay datos.');return
    df=pd.DataFrame(rows)
    c1,c2,c3=st.columns(3)
    currency=c1.selectbox('Moneda',['PEN','USD'])
    statuses=c2.multiselect('Estado',['Enviado','Validado','Observado'],default=['Enviado','Validado','Observado'])
    sellers=sorted(df['seller_name'].unique().tolist());seller=c3.selectbox('Vendedor',['Todos']+sellers)
    c1,c2,c3=st.columns(3)
    bank=c1.selectbox('Banco',['Todos']+sorted(df['bank'].unique().tolist()))
    client=c2.selectbox('Cliente',['Todos']+sorted(df['client_name'].unique().tolist()))
    since=c3.date_input('Desde',value=None)
    until=st.date_input('Hasta',value=None)
    df=df[(df.currency==currency)&df.status.isin(statuses)]
    if seller!='Todos':df=df[df.seller_name==seller]
    if bank!='Todos':df=df[df.bank==bank]
    if client!='Todos':df=df[df.client_name==client]
    if since:df=df[df.operation_date>=since.isoformat()]
    if until:df=df[df.operation_date<=until.isoformat()]
    if df.empty:st.info('No hay resultados para estos filtros.');return
    metrics([('Monto registrado',fmt_money(df.amount.sum(),currency)),('Monto validado',fmt_money(df[df.status=='Validado'].amount.sum(),currency)),('Monto pendiente',fmt_money(df[df.status=='Enviado'].amount.sum(),currency)),('Cantidad',len(df))])
    a,b=st.columns(2)
    with a:
        st.subheader('Monto por banco');st.bar_chart(df.groupby('bank').amount.sum())
        st.subheader('Monto por vendedor');st.bar_chart(df.groupby('seller_name').amount.sum())
    with b:
        st.subheader('Estados');st.bar_chart(df.groupby('status').size())
        st.subheader('Clientes con mayor monto');st.bar_chart(df.groupby('client_name').amount.sum().nlargest(10))
    st.subheader('Abonos por mes')
    monthly=df.assign(month=df.operation_date.str.slice(0,7)).groupby('month').size()
    st.line_chart(monthly)
    validated=df[df.status=='Validado'].copy()
    if not validated.empty:
        wait=(pd.to_datetime(validated.reviewed_at,utc=True)-pd.to_datetime(validated.created_at,utc=True)).dt.total_seconds()/3600
        st.metric('Tiempo promedio de validación',f'{wait.mean():.1f} h')
    st.metric('% observado',f"{100*(df.status=='Observado').mean():.1f}%")

def users_view(user):
    header('Usuarios','Crea cuentas y asigna roles.')
    with st.expander('＋ Crear usuario'):
        with st.form('create_user'):
            name=st.text_input('Nombre completo');email=st.text_input('Correo');role=st.selectbox('Rol',['seller','management','admin'],format_func=lambda r:{'seller':'Vendedor','management':'Gestión','admin':'Administrador'}[r]);password=st.text_input('Contraseña temporal (mínimo 12 caracteres)',type='password')
            if st.form_submit_button('Crear usuario',type='primary'):
                if not name.strip() or '@' not in email:st.error('Completa nombre y correo válido.')
                else:
                    try:db.create_user(user,name,email,role,password);st.success('Usuario creado. Entrégale su contraseña por un canal seguro.');st.rerun()
                    except (ValueError,sqlite3.IntegrityError) as e:st.error(str(e))
    st.dataframe(pd.DataFrame(db.users()).drop(columns=['id','created_at']),hide_index=True,width='stretch')
    with st.expander('Restablecer contraseña de usuario'):
        with st.form('reset_password'):
            selected=st.selectbox('Usuario',db.users(),format_func=lambda x:f"{x['name']} · {x['email']}")
            new=st.text_input('Nueva contraseña (mínimo 12 caracteres)',type='password')
            if st.form_submit_button('Restablecer'):
                try:db.reset_password(user,selected['id'],new);st.success('Contraseña restablecida. Comunícala por un canal seguro.')
                except (ValueError,PermissionError) as exc:st.error(str(exc))

def load_secrets():
    """Streamlit Community Cloud entrega la configuración en st.secrets; se copia al entorno para db.py."""
    try:
        for key in ('ADMIN_EMAIL','ADMIN_PASSWORD','APP_DATA_DIR'):
            if not os.getenv(key) and key in st.secrets:os.environ[key]=str(st.secrets[key])
    except Exception:pass

load_secrets()
try:db.initialize()
except ValueError as e:st.error(f'Configuración inicial: {e}');st.stop()
user=current_user()
page=choose_navigation(user)
if st.session_state.get('correct_id') and user['role']=='seller':correction(user,st.session_state.correct_id)
elif st.session_state.get('detail_id'):detail(user,st.session_state.detail_id)
elif page=='Inicio':home(user)
elif page=='Nuevo abono' and user['role']=='seller':new_payment(user)
elif page in ('Mis abonos','Gestión de abonos'):listing(user,page=='Gestión de abonos')
elif page=='Clientes':clients_view(user)
elif page=='Reportes' and user['role']!='seller':reports(user)
elif page=='Usuarios' and user['role']=='admin':users_view(user)
if st.session_state.get('review_pending') and user['role'] in ('management','admin'):
    confirm_review(*st.session_state.review_pending)
