/* Servicios simulados para el modo demo: guardan los datos en el navegador (localStorage) en lugar de SharePoint. */
import { Abono, Cliente, Hist, Estado, Moneda, Extra, DEFAULT_MAPPING, pad2 } from '../src/webparts/gestionAbonos/model';
import { normalize, OcrResult } from '../src/webparts/gestionAbonos/services/OcrService';
// Mismas reglas que usa la función de Azure: la demo puede leer vouchers reales con Document Intelligence.
import * as reglas from '../../azure-function/src/docintel-reglas';

const KEY = 'gestion-abonos-demo-v1';
interface Store { abonos: Abono[]; clientes: Cliente[]; hist: Array<Hist & { abonoId: number }>; seq: number; files: Record<string, string>; }

export const USERS = {
  vendedor: { id: 7, name: 'Juan Pérez' },
  vendedor2: { id: 8, name: 'Carla Mendoza' },
  gestion: { id: 9, name: 'María López' }
};

function voucherSvg(a: { banco: string; fecha: string; operacion: string; importe: number | null; moneda: string; ordenante: string; referencia: string }): string {
  const amt = (a.moneda === 'USD' ? 'US$ ' : 'S/ ') + Number(a.importe || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });
  const f = a.fecha ? a.fecha.split('-').reverse().join('/') : '';
  const rows: Array<[string, string]> = [['Fecha', f], ['N° operación', a.operacion], ['Cta. destino', '193-1122334-0-45'], ['Ordenante', a.ordenante], ['Referencia', a.referencia]];
  const esc = (s: string): string => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="470" viewBox="0 0 360 470"><rect width="360" height="470" fill="#fff"/>
<text x="180" y="52" font-family="Arial" font-weight="800" font-size="26" text-anchor="middle" fill="#0F2A33">${esc(a.banco)}</text>
<text x="180" y="76" font-family="Arial" font-size="11" letter-spacing="2" text-anchor="middle" fill="#56626A">CONSTANCIA DE TRANSFERENCIA</text>
<line x1="24" x2="336" y1="96" y2="96" stroke="#C6CDD4" stroke-dasharray="4 3"/>
${rows.map((r, i) => `<text x="24" y="${128 + i * 30}" font-family="Consolas,monospace" font-size="13" fill="#2A2F36">${esc(r[0])}</text><text x="336" y="${128 + i * 30}" font-family="Consolas,monospace" font-size="13" text-anchor="end" fill="#2A2F36">${esc(r[1])}</text>`).join('')}
<line x1="24" x2="336" y1="286" y2="286" stroke="#C6CDD4" stroke-dasharray="4 3"/>
<text x="180" y="318" font-family="Arial" font-size="11" letter-spacing="2" text-anchor="middle" fill="#56626A">IMPORTE TRANSFERIDO</text>
<text x="180" y="352" font-family="Consolas,monospace" font-size="26" font-weight="700" text-anchor="middle" fill="#13191C">${esc(amt)}</text>
<line x1="24" x2="336" y1="380" y2="380" stroke="#C6CDD4" stroke-dasharray="4 3"/>
<text x="180" y="420" font-family="Arial" font-size="11" text-anchor="middle" fill="#56626A">Voucher de ejemplo (modo demo)</text></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

function seed(): Store {
  const now = Date.now(); const H = 3600e3; const D = 24 * H;
  const clientes: Cliente[] = [
    { id: 1, razon: 'Transportes ABC S.A.C.', ruc: '20123456789', vendedorId: 7, vendedorName: 'Juan Pérez', estado: 'Activo', created: now - 400 * D, authorName: 'Juan Pérez' },
    { id: 2, razon: 'Distribuidora Andina S.A.', ruc: '20548712361', vendedorId: 7, vendedorName: 'Juan Pérez', estado: 'Activo', created: now - 300 * D, authorName: 'Juan Pérez' },
    { id: 3, razon: 'Ferretería Central S.R.L.', ruc: '20487651239', vendedorId: 7, vendedorName: 'Juan Pérez', estado: 'Activo', created: now - 200 * D, authorName: 'Juan Pérez' },
    { id: 4, razon: 'Minera Pacífico S.A.C.', ruc: '20512398764', vendedorId: 8, vendedorName: 'Carla Mendoza', estado: 'Activo', created: now - 250 * D, authorName: 'Carla Mendoza' }
  ];
  type S = [string, string, string, string, number, Moneda, Estado, number, number, string];
  // [cliente, ruc, banco, operacion, importe, moneda, estado, horasAtras, autor, observacion]
  const rows: S[] = [
    ['Transportes ABC S.A.C.', '20123456789', 'BCP', '00887310', 5660, 'PEN', 'Enviado', 50, 7, ''],
    ['Ferretería Central S.R.L.', '20487651239', 'BBVA', '0117-554820', 4320.5, 'PEN', 'Enviado', 20, 7, ''],
    ['Distribuidora Andina S.A.', '20548712361', 'Interbank', '4471029', 7850, 'PEN', 'Observado', 70, 7, 'El importe registrado no coincide con el voucher. Favor revisar.'],
    ['Minera Pacífico S.A.C.', '20512398764', 'BCP', '00879214', 42600, 'PEN', 'Enviado', 74, 8, ''],
    ['Transportes ABC S.A.C.', '20123456789', 'BCP', '00864402', 12300, 'PEN', 'Validado', 220, 7, ''],
    ['Distribuidora Andina S.A.', '20548712361', 'Interbank', '4459871', 9780, 'PEN', 'Validado', 245, 7, ''],
    ['Minera Pacífico S.A.C.', '20512398764', 'BBVA', '0117-556102', 64200, 'PEN', 'Validado', 30, 8, ''],
    ['Ferretería Central S.R.L.', '20487651239', 'Scotiabank', '7730915', 3200, 'USD', 'Validado', 130, 7, '']
  ];
  const hist: Store['hist'] = [];
  const y = new Date().getFullYear();
  const abonos: Abono[] = rows.map((r, i) => {
    const id = 101 + i; const created = now - r[7] * H;
    const d = new Date(created - D);
    const fecha = d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    const author = r[8] === 7 ? 'Juan Pérez' : 'Carla Mendoza';
    const changed = r[6] !== 'Enviado' ? created + 5 * H : null;
    const extra: Extra = { ocr: null, origen: { banco: 'ocr', fecha: 'ocr', operacion: 'ocr', importe: r[6] === 'Observado' ? 'manual' : 'ocr', moneda: 'ocr' }, cliSug: true, segundos: 40 + i * 3, voucherName: `voucher_${i + 1}.jpg` };
    const a: Abono = {
      id, code: `AB-${y}-${('000000' + id).slice(-6)}`, clienteRazon: r[0], clienteRuc: r[1], banco: r[2], fecha, hora: '10:1' + i, operacion: r[3], importe: r[4], moneda: r[5],
      cuenta: '193-1122334-0-45', ordenante: r[0].toUpperCase().replace(/\./g, ''), referencia: 'FACT F001-00' + (4500 + i), estado: r[6], observacion: r[9],
      fechaEstado: changed || created, created, modified: changed || created, authorId: r[8], authorName: author,
      responsableName: changed ? 'María López' : '', voucherUrl: '', extra
    };
    a.voucherUrl = voucherSvg({ ...a, importe: r[6] === 'Observado' ? 7580 : a.importe });
    hist.push({ abonoId: id, id: hist.length + 1, tipo: 'registro', de: '', a: '', detalle: a.extra.voucherName || '', created, authorName: author });
    hist.push({ abonoId: id, id: hist.length + 1, tipo: 'ocr', de: '', a: '', detalle: '8 de 9 campos detectados', created, authorName: author });
    hist.push({ abonoId: id, id: hist.length + 1, tipo: 'estado', de: '', a: 'Enviado', detalle: '', created, authorName: author });
    if (changed) hist.push({ abonoId: id, id: hist.length + 1, tipo: 'estado', de: 'Enviado', a: r[6], detalle: r[9], created: changed, authorName: 'María López' });
    return a;
  });
  return { abonos, clientes, hist, seq: 200, files: {} };
}

function load(): Store {
  try { const s = localStorage.getItem(KEY); if (s) return JSON.parse(s) as Store; } catch (e) { /* sin almacenamiento */ }
  const s = seed(); save(s); return s;
}
function save(s: Store): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); }
  catch (e) { try { localStorage.setItem(KEY, JSON.stringify({ ...s, files: {} })); } catch (e2) { /* sin espacio */ } }
}
export function resetDemo(): void { try { localStorage.removeItem(KEY); } catch (e) { /* nada */ } }

const wait = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));
const blobToDataUrl = (b: Blob): Promise<string> => new Promise((resolve, reject) => { const fr = new FileReader(); fr.onload = () => resolve(String(fr.result)); fr.onerror = reject; fr.readAsDataURL(b); });

export class MockSp {
  public cfg = { listaAbonos: 'Abonos (demo)', listaClientes: 'Clientes (demo)', listaHistorial: 'Historial (demo)', biblioteca: 'Vouchers (demo)', grupoGestion: 'Gestión de Abonos', ocrUrl: '', ocrAppId: '', mapping: DEFAULT_MAPPING };
  public isSiteAdmin = false;
  private s: Store = load();
  constructor(public userId: number, private userName: string, private gestion: boolean) {}
  public async init(): Promise<unknown> {
    return { ok: true, listErrors: [], abonos: Object.keys(DEFAULT_MAPPING.abonos).map(k => ({ key: k, column: DEFAULT_MAPPING.abonos[k], found: true, type: 'demo' })), clientes: Object.keys(DEFAULT_MAPPING.clientes).map(k => ({ key: k, column: DEFAULT_MAPPING.clientes[k], found: true, type: 'demo' })), historial: true, biblioteca: true };
  }
  public async isGestion(): Promise<boolean> { return this.gestion; }
  public async loadAbonos(): Promise<Abono[]> { await wait(120); this.s = load(); return this.s.abonos.map(a => ({ ...a, voucherUrl: this.s.files[a.voucherUrl] || a.voucherUrl })).sort((a, b) => b.id - a.id); }
  public async loadClientes(): Promise<Cliente[]> { return this.s.clientes.slice(); }
  public async createAbono(v: Record<string, unknown>): Promise<{ id: number; code: string }> {
    await wait(300);
    this.s = load();
    const id = ++this.s.seq; const code = `AB-${new Date().getFullYear()}-${('000000' + id).slice(-6)}`; const now = Date.now();
    this.s.abonos.push({
      id, code, clienteRazon: String(v.clienteRazon), clienteRuc: String(v.clienteRuc), banco: String(v.banco || ''), fecha: String(v.fecha || ''), hora: String(v.hora || ''),
      operacion: String(v.operacion || ''), importe: v.importe === null || v.importe === undefined ? null : Number(v.importe), moneda: (v.moneda as Moneda) || 'PEN',
      cuenta: String(v.cuenta || ''), ordenante: String(v.ordenante || ''), referencia: String(v.referencia || ''), estado: 'Enviado', observacion: '',
      fechaEstado: now, created: now, modified: now, authorId: this.userId, authorName: this.userName, responsableName: '', voucherUrl: '', extra: (v.datosOcr as Extra) || {}
    });
    save(this.s);
    return { id, code };
  }
  public async updateAbono(id: number, v: Record<string, unknown>): Promise<void> {
    await wait(250);
    this.s = load();
    const a = this.s.abonos.filter(x => x.id === id)[0];
    if (!a) throw new Error('No existe el abono');
    const keys = ['banco', 'fecha', 'hora', 'operacion', 'moneda', 'cuenta', 'ordenante', 'referencia', 'estado', 'observacion'];
    keys.forEach(k => { if (v[k] !== undefined) (a as unknown as Record<string, unknown>)[k] = v[k]; });
    if (v.importe !== undefined) a.importe = v.importe === null ? null : Number(v.importe);
    if (v.fechaEstado !== undefined) a.fechaEstado = Number(v.fechaEstado);
    if (v.voucher !== undefined) a.voucherUrl = String(v.voucher);
    if (v.datosOcr !== undefined) a.extra = v.datosOcr as Extra;
    if (v.responsable !== undefined) a.responsableName = this.userName;
    a.modified = Date.now();
    save(this.s);
  }
  public async addHist(abonoId: number, code: string, tipo: string, de: string, a: string, detalle: string): Promise<void> {
    this.s = load();
    this.s.hist.push({ abonoId, id: this.s.hist.length + 1, tipo, de, a, detalle, created: Date.now(), authorName: this.userName });
    save(this.s);
  }
  public async loadHist(abonoId: number): Promise<Hist[]> { this.s = load(); return this.s.hist.filter(h => h.abonoId === abonoId); }
  public async createCliente(razon: string, ruc: string): Promise<void> {
    this.s = load();
    this.s.clientes.push({ id: ++this.s.seq, razon, ruc, vendedorId: this.userId, vendedorName: this.userName, estado: 'Activo', created: Date.now(), authorName: this.userName });
    save(this.s);
  }
  public async setClienteEstado(id: number, estado: string): Promise<void> {
    this.s = load(); const c = this.s.clientes.filter(x => x.id === id)[0]; if (c) c.estado = estado; save(this.s);
  }
  public async uploadVoucher(name: string, data: Blob): Promise<string> {
    await wait(200);
    const key = 'demo-file:' + name;
    this.s = load();
    this.s.files[key] = await blobToDataUrl(data);
    save(this.s);
    return key;
  }
}

/** Lectura simulada: devuelve datos de ejemplo tras unos segundos. Con ?ocr=<url> usa una función real (por ejemplo la local). */
/** Configuración de lectura real con Document Intelligence; se guarda solo en este navegador. */
export interface DocIntelCfg { endpoint: string; key: string; }
const DI_KEY = 'gestion-abonos-demo-docintel';
export function getDocIntel(): DocIntelCfg | null {
  try { const c = JSON.parse(localStorage.getItem(DI_KEY) || 'null'); return c && c.endpoint && c.key ? c : null; } catch (e) { return null; }
}
export function setDocIntel(c: DocIntelCfg | null): void {
  try { if (c) localStorage.setItem(DI_KEY, JSON.stringify(c)); else localStorage.removeItem(DI_KEY); } catch (e) { /* nada */ }
}
/** Comprueba punto de conexión y clave sin analizar nada (GET /info). Devuelve '' si funciona o el motivo del error. */
export async function probarDocIntel(c: DocIntelCfg): Promise<string> {
  const ep = c.endpoint.trim().replace(/\/+$/, '');
  if (!/^https:\/\/[^/]+$/.test(ep)) return 'El punto de conexión debe ser como https://<recurso>.cognitiveservices.azure.com';
  try {
    const r = await fetch(`${ep}/documentintelligence/info?api-version=${reglas.API_VERSION}`, { headers: { 'Ocp-Apim-Subscription-Key': c.key.trim() } });
    if (r.ok) return '';
    if (r.status === 401) return 'La clave no es válida para este recurso.';
    if (r.status === 404) return 'El punto de conexión no corresponde a un recurso de Document Intelligence.';
    return `Azure respondió ${r.status}.`;
  } catch (e) { return 'No se pudo conectar. Revisa el punto de conexión.'; }
}

export class MockOcr {
  public enabled = true;
  constructor(private url: string) {}
  public async read(jpg: Blob): Promise<OcrResult> {
    const di = getDocIntel();
    if (di) {
      const b64 = (await blobToDataUrl(jpg)).split(',')[1];
      try {
        const res = await reglas.analizarCon(b64, { endpoint: di.endpoint, headers: { 'Ocp-Apim-Subscription-Key': di.key.trim() } });
        return normalize(reglas.extraerCampos(res));
      } catch (e) {
        const st = (e as { status?: number }).status;
        throw new Error(st === 401 ? 'La lectura falló: la clave de Document Intelligence no es válida.' : st === 429 ? 'Document Intelligence está ocupado o alcanzaste el límite del plan gratuito. Intenta en unos segundos.' : `La lectura falló: ${(e as Error).message}`);
      }
    }
    if (this.url) {
      const b64 = (await blobToDataUrl(jpg)).split(',')[1];
      const r = await fetch(this.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: b64, mimeType: 'image/jpeg' }) });
      if (!r.ok) throw new Error(`La lectura falló (${r.status}).`);
      return normalize(await r.json());
    }
    await wait(4500 + Math.random() * 2500);
    const bancos = ['BCP', 'BBVA', 'Interbank', 'Scotiabank'];
    const d = new Date(Date.now() - 86400e3);
    const op = String(Math.floor(10000000 + Math.random() * 89999999));
    const imp = Math.round((1500 + Math.random() * 30000) * 100) / 100;
    return normalize({
      esVoucher: true,
      banco: { valor: bancos[Math.floor(Math.random() * bancos.length)], confianza: 'alta' },
      fecha: { valor: `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`, confianza: 'alta' },
      hora: { valor: null, confianza: null },
      operacion: { valor: op, confianza: 'alta' },
      importe: { valor: imp, confianza: 'media' },
      moneda: { valor: 'PEN', confianza: 'alta' },
      cuenta: { valor: '193-1122334-0-45', confianza: 'alta' },
      ordenante: { valor: 'TRANSPORTES ABC SAC', confianza: 'media' },
      referencia: { valor: 'FACT F001-00' + Math.floor(4000 + Math.random() * 999), confianza: 'alta' },
      nota: 'Lectura simulada (modo demo): los valores son de ejemplo, no provienen de tu imagen.'
    });
  }
}
