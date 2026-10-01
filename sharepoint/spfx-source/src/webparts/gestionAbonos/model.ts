/* Tipos, configuración por defecto y utilidades de formato de Gestión de Abonos. */

export type Estado = 'Enviado' | 'Validado' | 'Observado';
export type Moneda = 'PEN' | 'USD';
export type Conf = 'alta' | 'media' | 'baja' | null;
export type Origen = 'ocr' | 'revisado' | 'manual';
export type FieldKey = 'banco' | 'fecha' | 'hora' | 'operacion' | 'importe' | 'moneda' | 'cuenta' | 'ordenante' | 'referencia';

export const FIELDS: Array<[FieldKey, string]> = [
  ['banco', 'Banco'], ['fecha', 'Fecha de operación'], ['hora', 'Hora'], ['operacion', 'N° de operación'],
  ['importe', 'Importe'], ['moneda', 'Moneda'], ['cuenta', 'Cuenta destino'], ['ordenante', 'Ordenante / pagador'],
  ['referencia', 'Descripción o referencia']
];
export const FIELD_LABEL: Record<string, string> = FIELDS.reduce((m, [k, l]) => { m[k] = l; return m; }, {} as Record<string, string>);
export const REQUIRED: FieldKey[] = ['banco', 'fecha', 'operacion', 'importe', 'moneda'];
export const BANCOS = ['BCP', 'BBVA', 'Interbank', 'Scotiabank', 'BanBif', 'Banco de la Nación', 'Banco Pichincha', 'Banco GNB', 'Mibanco', 'Caja Arequipa', 'Caja Huancayo', 'Caja Piura'];
export const OCR_MSGS = ['Identificando banco', 'Leyendo operación', 'Extrayendo importe', 'Identificando fecha', 'Verificando información'];
export const QUICK_OBS: Array<[string, string]> = [
  ['Importe no coincide', 'El importe registrado no coincide con el voucher. Favor revisar.'],
  ['Voucher ilegible', 'El voucher no es legible. Adjuntarlo nuevamente.'],
  ['Cliente incorrecto', 'El cliente asociado no corresponde al ordenante del voucher.'],
  ['Posible duplicado', 'Posible duplicado de un registro existente. Favor confirmar.'],
  ['Fecha no coincide', 'La fecha registrada no coincide con el voucher.']
];

export interface OcrField { v: string | number | null; c: Conf; }
export type OcrData = Record<FieldKey, OcrField>;

/** Datos de trazabilidad guardados como JSON en la columna "DatosOCR". */
export interface Extra {
  ocr?: OcrData | null;
  origen?: Partial<Record<FieldKey, Origen>>;
  cliSug?: boolean;
  dup?: string[] | null;
  segundos?: number;
  voucherName?: string;
  pdfUrl?: string;
}

export interface Abono {
  id: number;
  code: string;
  clienteRazon: string;
  clienteRuc: string;
  banco: string;
  fecha: string;          // AAAA-MM-DD
  hora: string;           // HH:MM
  operacion: string;
  importe: number | null;
  moneda: Moneda;
  cuenta: string;
  ordenante: string;
  referencia: string;
  estado: Estado;
  observacion: string;
  fechaEstado: number | null;
  created: number;
  modified: number;
  authorId: number;
  authorName: string;
  responsableName: string;
  voucherUrl: string;
  extra: Extra;
}

export interface Cliente {
  id: number;
  razon: string;
  ruc: string;
  vendedorId: number | null;
  vendedorName: string;
  estado: string;
  created: number;
  authorName: string;
}

export interface Hist {
  id: number;
  tipo: string;
  de: string;
  a: string;
  detalle: string;
  created: number;
  authorName: string;
}

export interface Mapping {
  abonos: Record<string, string>;
  clientes: Record<string, string>;
  valores: { estado: Record<Estado, string>; moneda: Record<Moneda, string>; };
}

export const DEFAULT_MAPPING: Mapping = {
  abonos: {
    codigo: 'Title', clienteRazon: 'Cliente', clienteRuc: 'RUC', banco: 'Banco', fecha: 'FechaOperacion', hora: 'HoraOperacion',
    operacion: 'NumeroOperacion', importe: 'Importe', moneda: 'Moneda', cuenta: 'CuentaDestino', ordenante: 'Ordenante',
    referencia: 'Referencia', estado: 'Estado', observacion: 'ObservacionGestion', fechaEstado: 'FechaEstado',
    responsable: 'ResponsableGestion', voucher: 'Voucher', datosOcr: 'DatosOCR'
  },
  clientes: { razon: 'Title', ruc: 'RUC', vendedor: 'VendedorAsignado', estado: 'Estado' },
  valores: {
    estado: { Enviado: 'Enviado', Validado: 'Validado', Observado: 'Observado' },
    moneda: { PEN: 'PEN', USD: 'USD' }
  }
};

export const ABONO_LABELS: Record<string, string> = {
  codigo: 'Código', clienteRazon: 'Cliente (razón social)', clienteRuc: 'RUC del cliente', banco: 'Banco', fecha: 'Fecha de operación',
  hora: 'Hora', operacion: 'N° de operación', importe: 'Importe', moneda: 'Moneda', cuenta: 'Cuenta destino', ordenante: 'Ordenante',
  referencia: 'Referencia', estado: 'Estado', observacion: 'Observación de Gestión', fechaEstado: 'Fecha del último cambio de estado',
  responsable: 'Responsable de Gestión', voucher: 'Voucher (enlace)', datosOcr: 'Datos de lectura OCR (trazabilidad)'
};
export const ABONO_REQUIRED_KEYS = ['codigo', 'clienteRazon', 'clienteRuc', 'banco', 'fecha', 'operacion', 'importe', 'moneda', 'estado'];

export function parseMapping(json: string | undefined): { mapping: Mapping; error: string } {
  if (!json || !json.trim()) return { mapping: DEFAULT_MAPPING, error: '' };
  try {
    const m = JSON.parse(json) as Partial<Mapping>;
    return {
      mapping: {
        abonos: { ...DEFAULT_MAPPING.abonos, ...(m.abonos || {}) },
        clientes: { ...DEFAULT_MAPPING.clientes, ...(m.clientes || {}) },
        valores: {
          estado: { ...DEFAULT_MAPPING.valores.estado, ...((m.valores && m.valores.estado) || {}) },
          moneda: { ...DEFAULT_MAPPING.valores.moneda, ...((m.valores && m.valores.moneda) || {}) }
        }
      },
      error: ''
    };
  } catch (e) {
    return { mapping: DEFAULT_MAPPING, error: 'El mapeo de columnas no es un JSON válido. Se usan los nombres por defecto.' };
  }
}

/* ---------- Formato ---------- */
export const pad2 = (n: number | string): string => ('0' + n).slice(-2);
export function money(n: number | null | undefined, m?: string): string {
  if (n === null || n === undefined || isNaN(Number(n))) return '—';
  return (m === 'USD' ? 'US$ ' : 'S/ ') + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export const fmtNum = (n: number | null | undefined): string => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function fmtDate(iso: string | undefined | null): string {
  if (!iso) return '—';
  const p = String(iso).split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : String(iso);
}
export function fmtTs(ms: number | null | undefined, year?: boolean): string {
  if (!ms) return '—';
  const d = new Date(ms);
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}${year ? '/' + d.getFullYear() : ''} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
export function ago(ms: number): string {
  const m = Math.max(0, Math.floor((Date.now() - ms) / 60000));
  if (m < 60) return m + ' min';
  const h = Math.floor(m / 60);
  if (h < 24) return h + ' h ' + (m % 60) + ' min';
  const d = Math.floor(h / 24);
  return d + ' d ' + (h % 24) + ' h';
}
export function durFmt(ms: number | null): string {
  if (!ms || ms < 0) return '—';
  const m = Math.round(ms / 60000);
  if (m < 60) return m + ' min';
  const h = Math.floor(m / 60);
  if (h < 48) return h + ' h ' + (m % 60) + ' min';
  return Math.floor(h / 24) + ' d ' + (h % 24) + ' h';
}
export function parseAmount(s: unknown): number | null {
  if (s === null || s === undefined || s === '') return null;
  if (typeof s === 'number') return isFinite(s) ? Math.round(s * 100) / 100 : null;
  let t = String(s).replace(/[^\d.,-]/g, '');
  if (!t) return null;
  const lc = t.lastIndexOf(','), ld = t.lastIndexOf('.');
  if (lc > -1 && ld > -1) t = lc > ld ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  else if (lc > -1) {
    const dec = t.length - lc - 1;
    t = (dec === 2 || dec === 1) && (t.match(/,/g) || []).length === 1 ? t.replace(',', '.') : t.replace(/,/g, '');
  }
  const n = parseFloat(t);
  return isFinite(n) ? Math.round(n * 100) / 100 : null;
}
export function toIso(s: unknown): string {
  if (!s) return '';
  const v = String(s).trim();
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;
  m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) { let y = m[3]; if (y.length === 2) y = '20' + y; return `${y}-${pad2(m[2])}-${pad2(m[1])}`; }
  return '';
}
export function toHora(s: unknown): string {
  if (!s) return '';
  const m = String(s).match(/(\d{1,2}):(\d{2})/);
  return m ? `${pad2(m[1])}:${m[2]}` : '';
}
export const norm = (s: unknown): string => String(s === null || s === undefined ? '' : s).trim().toUpperCase().replace(/\s+/g, ' ');
export const digits = (s: unknown): string => String(s === null || s === undefined ? '' : s).replace(/\D/g, '');
export function initials(s: string): string {
  const w = String(s || '').replace(/S\.?A\.?C\.?|S\.?R\.?L\.?|E\.?I\.?R\.?L\.?|S\.?A\.?/gi, '').trim().split(/\s+/).filter(Boolean);
  return (((w[0] || '?')[0]) + (w[1] ? w[1][0] : '')).toUpperCase();
}
export function sameVal(k: string, a: unknown, b: unknown): boolean {
  if (k === 'importe') return a !== null && a !== undefined && b !== null && b !== undefined && a !== '' && b !== '' && Math.abs(Number(a) - Number(b)) < 0.005;
  if (k === 'operacion') return digits(a) !== '' && digits(a) === digits(b);
  return norm(a) !== '' && norm(a) === norm(b);
}
export function showVal(k: string, v: unknown, mon?: string): string {
  if (v === null || v === undefined || v === '') return '—';
  if (k === 'importe') return money(Number(v), mon);
  if (k === 'fecha') return fmtDate(String(v));
  if (k === 'moneda') return v === 'USD' ? 'Dólares (USD)' : 'Soles (PEN)';
  return String(v);
}
export const monthKey = (ms: number): string => { const d = new Date(ms); return d.getFullYear() + '-' + pad2(d.getMonth() + 1); };
export const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MESES_L = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const monthLabel = (k: string): string => { const [y, m] = k.split('-'); const l = MESES_L[+m - 1]; return l.charAt(0).toUpperCase() + l.slice(1) + ' ' + y; };

export function sumBy(list: Abono[]): { PEN: number; USD: number } {
  const r = { PEN: 0, USD: 0 };
  list.forEach(a => { r[a.moneda === 'USD' ? 'USD' : 'PEN'] += Number(a.importe) || 0; });
  return r;
}
export function sumTxt(s: { PEN: number; USD: number }): string {
  const parts: string[] = [];
  if (s.PEN || !s.USD) parts.push(money(s.PEN, 'PEN'));
  if (s.USD) parts.push(money(s.USD, 'USD'));
  return parts.join(' + ');
}

export function scoreCliente(c: Cliente, ord: string): number {
  // Si el voucher trae el RUC de quien paga (tickets de recaudación), coincide de forma exacta.
  const rucs = String(ord).match(/\b\d{11}\b/g);
  if (rucs && c.ruc) return rucs.indexOf(String(c.ruc).trim()) > -1 ? 1 : 0;
  const a = norm(ord).replace(/[.,]/g, '').replace(/\b(SAC|SRL|EIRL|SA|SAA)\b/g, '').split(' ').filter(w => w.length > 2);
  if (!a.length) return 0;
  const b = norm(c.razon).replace(/[.,]/g, '');
  return a.filter(w => b.indexOf(w) > -1).length / a.length;
}

export interface FormData {
  banco: string; fecha: string; hora: string; operacion: string; importe: string; moneda: Moneda;
  cuenta: string; ordenante: string; referencia: string;
}
export const emptyForm = (): FormData => ({ banco: '', fecha: '', hora: '', operacion: '', importe: '', moneda: 'PEN', cuenta: '', ordenante: '', referencia: '' });

export interface DupHit { a: Abono; m: Record<string, boolean>; n: number; }
export function dupCandidates(list: Abono[], form: { banco: string; operacion: string; fecha: string; importe: unknown }, ruc: string | null, exceptId?: number): DupHit[] {
  const imp = parseAmount(form.importe);
  return list.filter(a => a.id !== exceptId).map(a => {
    const m: Record<string, boolean> = {
      banco: sameVal('banco', a.banco, form.banco),
      operacion: sameVal('operacion', a.operacion, form.operacion),
      fecha: !!a.fecha && a.fecha === form.fecha,
      importe: sameVal('importe', a.importe, imp),
      cliente: !!ruc && digits(a.clienteRuc) === digits(ruc)
    };
    const n = Object.keys(m).filter(k => m[k]).length;
    return { a, m, n, strong: (m.operacion && m.banco) || n >= 4 };
  }).filter(x => x.strong).sort((x, y) => y.n - x.n).slice(0, 3);
}

export function computeOrigen(form: FormData, ocr: OcrData | null): Partial<Record<FieldKey, Origen>> {
  const o: Partial<Record<FieldKey, Origen>> = {};
  FIELDS.forEach(([k]) => {
    const cur = k === 'importe' ? parseAmount(form.importe) : form[k];
    if (cur === null || cur === '') return;
    const oc = ocr ? ocr[k] : null;
    if (!oc || oc.v === null || oc.v === '') { o[k] = 'manual'; return; }
    if (!sameVal(k, oc.v, cur)) { o[k] = 'manual'; return; }
    o[k] = oc.c === 'alta' ? 'ocr' : 'revisado';
  });
  return o;
}

export function avgValidation(list: Abono[], hist: Record<number, Hist[]> | null): number | null {
  // Sin historial cargado, aproxima con la fecha del último cambio de estado.
  const ds = list.filter(a => a.estado === 'Validado' && a.fechaEstado).map(a => {
    const h = hist && hist[a.id];
    if (h && h.length) {
      const v = h.filter(x => x.a === 'Validado').pop();
      const e = h.filter(x => x.a === 'Enviado' && v && x.created <= v.created).pop();
      if (v && e) return v.created - e.created;
    }
    return (a.fechaEstado as number) - a.created;
  }).filter(x => x >= 0);
  return ds.length ? ds.reduce((s, x) => s + x, 0) / ds.length : null;
}
