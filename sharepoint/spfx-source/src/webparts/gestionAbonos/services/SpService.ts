/* Acceso a SharePoint (REST) para listas de abonos, clientes, historial y la biblioteca de vouchers. */
import { SPHttpClient, SPHttpClientResponse } from '@microsoft/sp-http';
import { WebPartContext } from '@microsoft/sp-webpart-base';
import {
  Abono, Cliente, Hist, Mapping, Estado, Moneda, Extra, ABONO_REQUIRED_KEYS, pad2
} from '../model';

export interface AppConfig {
  listaAbonos: string;
  listaClientes: string;
  listaHistorial: string;
  biblioteca: string;
  grupoGestion: string;
  ocrUrl: string;
  ocrAppId: string;
  mapping: Mapping;
}

interface FieldInfo { InternalName: string; TypeAsString: string; Title: string; ReadOnlyField: boolean; }
type FieldMap = Record<string, FieldInfo>;

export interface Diagnostics {
  ok: boolean;
  listErrors: string[];
  abonos: Array<{ key: string; column: string; found: boolean; type: string }>;
  clientes: Array<{ key: string; column: string; found: boolean; type: string }>;
  historial: boolean;
  biblioteca: boolean;
}

const HIST_FIELDS = ['AbonoId', 'Tipo', 'EstadoAnterior', 'EstadoNuevo', 'Detalle'];

export class SpService {
  private web: string;
  private fAbonos: FieldMap = {};
  private fClientes: FieldMap = {};
  private fHist: FieldMap = {};
  private libRoot = '';
  public userId: number;

  constructor(private ctx: WebPartContext, public cfg: AppConfig) {
    this.web = ctx.pageContext.web.absoluteUrl;
    this.userId = (ctx.pageContext.legacyPageContext && ctx.pageContext.legacyPageContext.userId) || 0;
  }

  public get isSiteAdmin(): boolean {
    const lpc = this.ctx.pageContext.legacyPageContext;
    return !!(lpc && lpc.isSiteAdmin);
  }

  /* ---------- HTTP ---------- */
  private list(title: string): string { return `${this.web}/_api/web/lists/getbytitle('${encodeURIComponent(title.replace(/'/g, "''"))}')`; }
  private async ok(r: SPHttpClientResponse): Promise<SPHttpClientResponse> {
    if (r.ok) return r;
    let msg = `Error ${r.status}`;
    try { const j = await r.json(); msg = (j && (j['odata.error'] ? j['odata.error'].message.value : j.error && j.error.message)) || msg; } catch (e) { /* sin cuerpo */ }
    const err = new Error(msg) as Error & { status?: number };
    err.status = r.status;
    throw err;
  }
  private async get<T>(url: string): Promise<T> {
    const r = await this.ctx.spHttpClient.get(url, SPHttpClient.configurations.v1, { headers: { Accept: 'application/json;odata=nometadata' } });
    await this.ok(r);
    return r.json() as Promise<T>;
  }
  private async post<T>(url: string, body: unknown, extra: Record<string, string> = {}): Promise<T | null> {
    const r = await this.ctx.spHttpClient.post(url, SPHttpClient.configurations.v1, {
      headers: { Accept: 'application/json;odata=nometadata', 'Content-Type': 'application/json;odata=nometadata', ...extra },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    await this.ok(r);
    if (r.status === 204) return null;
    const t = await r.text();
    return t ? JSON.parse(t) as T : null;
  }

  /* ---------- Metadatos ---------- */
  private async fields(title: string): Promise<FieldMap> {
    const j = await this.get<{ value: FieldInfo[] }>(`${this.list(title)}/fields?$select=InternalName,TypeAsString,Title,ReadOnlyField&$filter=Hidden eq false`);
    const m: FieldMap = {};
    j.value.forEach(f => { m[f.InternalName] = f; });
    return m;
  }

  public async init(): Promise<Diagnostics> {
    const cfg = this.cfg;
    const errs: string[] = [];
    let ok = true; let historial = false; let biblioteca = false;
    const [fa, fc, fh, lib] = await Promise.all([
      this.fields(cfg.listaAbonos).catch(() => null),
      this.fields(cfg.listaClientes).catch(() => null),
      this.fields(cfg.listaHistorial).catch(() => null),
      this.get<{ ServerRelativeUrl: string }>(`${this.list(cfg.biblioteca)}/RootFolder?$select=ServerRelativeUrl`).catch(() => null)
    ]);
    if (fa) this.fAbonos = fa; else { ok = false; errs.push(`No se encontró la lista “${cfg.listaAbonos}”.`); }
    if (fc) this.fClientes = fc; else { ok = false; errs.push(`No se encontró la lista “${cfg.listaClientes}”.`); }
    if (fh) {
      this.fHist = fh;
      historial = HIST_FIELDS.every(f => !!fh[f]);
      if (!historial) errs.push(`A la lista “${cfg.listaHistorial}” le faltan columnas: ${HIST_FIELDS.filter(f => !fh[f]).join(', ')}.`);
    } else errs.push(`No se encontró la lista “${cfg.listaHistorial}”. El historial no se guardará.`);
    if (lib) { this.libRoot = lib.ServerRelativeUrl; biblioteca = true; } else { ok = false; errs.push(`No se encontró la biblioteca “${cfg.biblioteca}”.`); }
    const d: Diagnostics = { ok, listErrors: errs, abonos: [], clientes: [], historial, biblioteca };
    Object.keys(cfg.mapping.abonos).forEach(k => {
      const col = cfg.mapping.abonos[k]; const f = col ? this.fAbonos[col] : undefined;
      d.abonos.push({ key: k, column: col, found: !!f, type: f ? f.TypeAsString : '' });
      if (!f && ABONO_REQUIRED_KEYS.indexOf(k) > -1 && Object.keys(this.fAbonos).length) d.ok = false;
    });
    Object.keys(cfg.mapping.clientes).forEach(k => {
      const col = cfg.mapping.clientes[k]; const f = col ? this.fClientes[col] : undefined;
      d.clientes.push({ key: k, column: col, found: !!f, type: f ? f.TypeAsString : '' });
      if (!f && (k === 'razon' || k === 'ruc') && Object.keys(this.fClientes).length) d.ok = false;
    });
    return d;
  }

  public async isGestion(): Promise<boolean> {
    const lpc = this.ctx.pageContext.legacyPageContext;
    if (lpc && lpc.isSiteAdmin) return true;
    try {
      const j = await this.get<{ value: Array<{ Title: string }> }>(`${this.web}/_api/web/currentuser/groups?$select=Title`);
      const g = this.cfg.grupoGestion.trim().toLowerCase();
      return j.value.some(x => x.Title.trim().toLowerCase() === g);
    } catch (e) { return false; }
  }

  /* ---------- Conversión de valores ---------- */
  private col(fm: FieldMap, map: Record<string, string>, key: string): FieldInfo | undefined {
    const c = map[key]; return c ? fm[c] : undefined;
  }
  private writeVal(fm: FieldMap, map: Record<string, string>, key: string, val: unknown, out: Record<string, unknown>): void {
    const f = this.col(fm, map, key);
    if (!f || f.ReadOnlyField) return;
    const t = f.TypeAsString;
    if (t === 'User') { out[f.InternalName + 'Id'] = val === null || val === undefined ? null : Number(val); return; }
    if (t === 'Number' || t === 'Currency') { out[f.InternalName] = val === null || val === '' || val === undefined ? null : Number(val); return; }
    if (t === 'DateTime') {
      if (!val) { out[f.InternalName] = null; return; }
      out[f.InternalName] = typeof val === 'number' ? new Date(val).toISOString() : `${val}T12:00:00Z`;
      return;
    }
    if (t === 'URL') { out[f.InternalName] = val ? { Url: String(val), Description: String(val).split('/').pop() } : null; return; }
    if (t === 'Boolean') { out[f.InternalName] = !!val; return; }
    out[f.InternalName] = val === null || val === undefined ? '' : String(val);
  }
  private readVal(fm: FieldMap, map: Record<string, string>, key: string, item: Record<string, unknown>): unknown {
    const f = this.col(fm, map, key);
    if (!f) return undefined;
    const v = item[f.InternalName];
    if (f.TypeAsString === 'User') { const u = v as { Title?: string } | null; return u && u.Title ? u.Title : ''; }
    if (f.TypeAsString === 'URL') { const u = v as { Url?: string } | null; return u && u.Url ? u.Url : ''; }
    return v;
  }
  private selectFor(fm: FieldMap, map: Record<string, string>): { select: string[]; expand: string[] } {
    const select: string[] = ['Id', 'Created', 'Modified', 'AuthorId', 'Author/Title'];
    const expand: string[] = ['Author'];
    Object.keys(map).forEach(k => {
      const f = this.col(fm, map, k);
      if (!f) return;
      if (f.TypeAsString === 'User') { select.push(`${f.InternalName}/Title`, `${f.InternalName}Id`); expand.push(f.InternalName); }
      else if (select.indexOf(f.InternalName) < 0) select.push(f.InternalName);
    });
    return { select, expand };
  }
  private async getAll<T>(url: string, max = 20000): Promise<T[]> {
    let out: T[] = []; let next: string | undefined = url;
    while (next && out.length < max) {
      const j: { value: T[]; 'odata.nextLink'?: string } = await this.get(next);
      out = out.concat(j.value); next = j['odata.nextLink'];
    }
    return out;
  }
  private fromValue<T extends string>(dict: Record<T, string>, raw: unknown, fallback: T): T {
    const s = String(raw || '').trim().toLowerCase();
    const keys = Object.keys(dict) as T[];
    for (const k of keys) { if (dict[k].toLowerCase() === s || k.toLowerCase() === s) return k; }
    if (fallback === ('PEN' as T) && /usd|d[oó]lar|\$/.test(s) && !/s\//.test(s)) return 'USD' as T;
    return fallback;
  }
  private isoDate(v: unknown): string {
    if (!v) return '';
    const d = new Date(String(v));
    if (isNaN(d.getTime())) return String(v).slice(0, 10);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  /* ---------- Abonos ---------- */
  public async loadAbonos(): Promise<Abono[]> {
    const map = this.cfg.mapping.abonos;
    const { select, expand } = this.selectFor(this.fAbonos, map);
    const items = await this.getAll<Record<string, unknown>>(`${this.list(this.cfg.listaAbonos)}/items?$select=${select.join(',')}&$expand=${expand.join(',')}&$orderby=Id desc&$top=2000`);
    const V = this.cfg.mapping.valores;
    return items.map(it => {
      const r = (k: string): unknown => this.readVal(this.fAbonos, map, k, it);
      let extra: Extra = {};
      const raw = r('datosOcr');
      if (raw) { try { extra = JSON.parse(String(raw)); } catch (e) { extra = {}; } }
      const fe = r('fechaEstado');
      const imp = r('importe');
      return {
        id: Number(it.Id),
        code: String(r('codigo') || ''),
        clienteRazon: String(r('clienteRazon') || ''),
        clienteRuc: String(r('clienteRuc') || ''),
        banco: String(r('banco') || ''),
        fecha: this.isoDate(r('fecha')),
        hora: String(r('hora') || ''),
        operacion: String(r('operacion') || ''),
        importe: imp === null || imp === undefined || imp === '' ? null : Number(imp),
        moneda: this.fromValue<Moneda>(V.moneda, r('moneda'), 'PEN'),
        cuenta: String(r('cuenta') || ''),
        ordenante: String(r('ordenante') || ''),
        referencia: String(r('referencia') || ''),
        estado: this.fromValue<Estado>(V.estado, r('estado'), 'Enviado'),
        observacion: String(r('observacion') || ''),
        fechaEstado: fe ? new Date(String(fe)).getTime() : null,
        created: new Date(String(it.Created)).getTime(),
        modified: new Date(String(it.Modified)).getTime(),
        authorId: Number(it.AuthorId),
        authorName: (it.Author as { Title?: string } | undefined)?.Title || '',
        responsableName: String(r('responsable') || ''),
        voucherUrl: String(r('voucher') || ''),
        extra
      } as Abono;
    });
  }

  private abonoBody(values: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    const map = this.cfg.mapping.abonos; const V = this.cfg.mapping.valores;
    Object.keys(values).forEach(k => {
      let v = values[k];
      if (k === 'estado') v = V.estado[v as Estado] || v;
      if (k === 'moneda') v = V.moneda[v as Moneda] || v;
      if (k === 'datosOcr' && typeof v !== 'string') v = JSON.stringify(v);
      this.writeVal(this.fAbonos, map, k, v, out);
      if (k === 'codigo' && map.codigo !== 'Title' && this.fAbonos.Title) out.Title = String(v);
    });
    return out;
  }

  /** Crea el abono y fija su código con el Id del elemento (sin choques entre usuarios). */
  public async createAbono(values: Record<string, unknown>): Promise<{ id: number; code: string }> {
    const body = this.abonoBody({ ...values, codigo: 'Nuevo' });
    const res = await this.post<{ Id: number }>(`${this.list(this.cfg.listaAbonos)}/items`, body);
    const id = res ? res.Id : 0;
    const code = `AB-${new Date().getFullYear()}-${('000000' + id).slice(-6)}`;
    await this.updateAbono(id, { codigo: code });
    return { id, code };
  }
  public async updateAbono(id: number, values: Record<string, unknown>): Promise<void> {
    await this.post(`${this.list(this.cfg.listaAbonos)}/items(${id})`, this.abonoBody(values), { 'IF-MATCH': '*', 'X-HTTP-Method': 'MERGE' });
  }

  /* ---------- Historial ---------- */
  public async addHist(abonoId: number, code: string, tipo: string, de: string, a: string, detalle: string): Promise<void> {
    if (!this.fHist.AbonoId) return;
    await this.post(`${this.list(this.cfg.listaHistorial)}/items`, { Title: code, AbonoId: abonoId, Tipo: tipo, EstadoAnterior: de || '', EstadoNuevo: a || '', Detalle: detalle || '' });
  }
  public async loadHist(abonoId: number): Promise<Hist[]> {
    if (!this.fHist.AbonoId) return [];
    const j = await this.get<{ value: Array<Record<string, unknown>> }>(`${this.list(this.cfg.listaHistorial)}/items?$select=Id,Created,Tipo,EstadoAnterior,EstadoNuevo,Detalle,Author/Title&$expand=Author&$filter=AbonoId eq ${abonoId}&$orderby=Id asc&$top=500`);
    return j.value.map(x => ({
      id: Number(x.Id), tipo: String(x.Tipo || ''), de: String(x.EstadoAnterior || ''), a: String(x.EstadoNuevo || ''),
      detalle: String(x.Detalle || ''), created: new Date(String(x.Created)).getTime(), authorName: (x.Author as { Title?: string })?.Title || ''
    }));
  }

  /* ---------- Clientes ---------- */
  public async loadClientes(): Promise<Cliente[]> {
    if (!Object.keys(this.fClientes).length) return [];
    const map = this.cfg.mapping.clientes;
    const { select, expand } = this.selectFor(this.fClientes, map);
    const items = await this.getAll<Record<string, unknown>>(`${this.list(this.cfg.listaClientes)}/items?$select=${select.join(',')}&$expand=${expand.join(',')}&$top=2000`);
    const vf = this.col(this.fClientes, map, 'vendedor');
    return items.map(it => {
      const r = (k: string): unknown => this.readVal(this.fClientes, map, k, it);
      return {
        id: Number(it.Id), razon: String(r('razon') || ''), ruc: String(r('ruc') || ''),
        vendedorId: vf ? (it[vf.InternalName + 'Id'] as number | null) : null,
        vendedorName: String(r('vendedor') || ''), estado: String(r('estado') || 'Activo'),
        created: new Date(String(it.Created)).getTime(), authorName: (it.Author as { Title?: string } | undefined)?.Title || ''
      };
    }).filter(c => c.razon);
  }
  public async createCliente(razon: string, ruc: string): Promise<void> {
    const out: Record<string, unknown> = {};
    const map = this.cfg.mapping.clientes;
    this.writeVal(this.fClientes, map, 'razon', razon, out);
    this.writeVal(this.fClientes, map, 'ruc', ruc, out);
    this.writeVal(this.fClientes, map, 'vendedor', this.userId || null, out);
    this.writeVal(this.fClientes, map, 'estado', 'Activo', out);
    await this.post(`${this.list(this.cfg.listaClientes)}/items`, out);
  }
  public async setClienteEstado(id: number, estado: string): Promise<void> {
    const out: Record<string, unknown> = {};
    this.writeVal(this.fClientes, this.cfg.mapping.clientes, 'estado', estado, out);
    await this.post(`${this.list(this.cfg.listaClientes)}/items(${id})`, out, { 'IF-MATCH': '*', 'X-HTTP-Method': 'MERGE' });
  }

  /* ---------- Vouchers ---------- */
  public async uploadVoucher(name: string, data: Blob): Promise<string> {
    if (!this.libRoot) throw new Error('Biblioteca de vouchers no disponible');
    const d = new Date();
    const folder = `${this.libRoot}/${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
    try { await this.post(`${this.web}/_api/web/folders/AddUsingPath(decodedurl='${encodeURIComponent(folder.replace(/'/g, "''"))}')`, undefined); } catch (e) { /* ya existe */ }
    const safe = name.replace(/[#%&*:<>?/\\{|}~"]/g, '_');
    const r = await this.ctx.spHttpClient.post(
      `${this.web}/_api/web/GetFolderByServerRelativePath(decodedurl='${encodeURIComponent(folder.replace(/'/g, "''"))}')/Files/AddUsingPath(decodedurl='${encodeURIComponent(safe.replace(/'/g, "''"))}',overwrite=true)?$select=ServerRelativeUrl`,
      SPHttpClient.configurations.v1,
      { headers: { Accept: 'application/json;odata=nometadata' }, body: data }
    );
    await this.ok(r);
    const j = await r.json() as { ServerRelativeUrl: string };
    return new URL(this.web).origin + encodeURI(j.ServerRelativeUrl);
  }
}
