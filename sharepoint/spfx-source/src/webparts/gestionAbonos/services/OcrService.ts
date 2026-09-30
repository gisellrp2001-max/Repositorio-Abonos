/* Preparación de imágenes/PDF en el navegador y llamada a la Azure Function que lee el voucher. */
import { AadHttpClient } from '@microsoft/sp-http';
import { WebPartContext } from '@microsoft/sp-webpart-base';
import { FIELDS, OcrData, Conf, FormData, emptyForm, toIso, toHora, parseAmount, fmtNum, Moneda } from '../model';

export interface Prepared { jpg: Blob; preview: string; isPdf: boolean; }

function canvasBlob(c: HTMLCanvasElement, q: number): Promise<Blob> {
  return new Promise((resolve, reject) => c.toBlob(b => (b ? resolve(b) : reject(new Error('canvas'))), 'image/jpeg', q));
}
export async function imageToJpeg(src: string, max: number, q: number): Promise<Blob> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = src; });
  const sc = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * sc); c.height = Math.round(img.naturalHeight * sc);
  const x = c.getContext('2d') as CanvasRenderingContext2D;
  x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
  return canvasBlob(c, q);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function pdfToJpeg(file: File): Promise<Blob> {
  const pdfjs: any = await import(/* webpackChunkName: 'pdfjs' */ 'pdfjs-dist/legacy/build/pdf');
  const worker: any = await import(/* webpackChunkName: 'pdfjs-worker' */ 'pdfjs-dist/legacy/build/pdf.worker');
  (window as any).pdfjsWorker = worker;
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
  const page = await pdf.getPage(1);
  const v0 = page.getViewport({ scale: 1 });
  const vp = page.getViewport({ scale: Math.min(3, 1800 / Math.max(v0.width, v0.height)) });
  const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
  const x = c.getContext('2d') as CanvasRenderingContext2D;
  x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: x, viewport: vp }).promise;
  return canvasBlob(c, 0.88);
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function prepareFile(file: File): Promise<Prepared> {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  let jpg: Blob;
  if (isPdf) jpg = await pdfToJpeg(file);
  else { const u = URL.createObjectURL(file); try { jpg = await imageToJpeg(u, 1800, 0.86); } finally { URL.revokeObjectURL(u); } }
  return { jpg, preview: URL.createObjectURL(jpg), isPdf };
}

function blobToBase64(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => { const fr = new FileReader(); fr.onload = () => resolve(String(fr.result).split(',')[1] || ''); fr.onerror = reject; fr.readAsDataURL(b); });
}

export interface OcrResult { ocr: OcrData; conf: Partial<Record<string, Conf>>; form: FormData; note: string; }

export class OcrService {
  private client: Promise<AadHttpClient> | null = null;
  constructor(private ctx: WebPartContext, private url: string, private appId: string) {}
  public get enabled(): boolean { return !!this.url; }

  private getClient(): Promise<AadHttpClient> {
    if (!this.client) this.client = this.ctx.aadHttpClientFactory.getClient(this.appId);
    return this.client;
  }

  public async read(jpg: Blob): Promise<OcrResult> {
    const body = JSON.stringify({ image: await blobToBase64(jpg), mimeType: 'image/jpeg' });
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
    let r;
    if (this.appId) {
      const c = await this.getClient();
      r = await c.post(this.url, AadHttpClient.configurations.v1, { headers, body });
    } else {
      r = await fetch(this.url, { method: 'POST', headers, body });
    }
    if (!r.ok) {
      let msg = `La lectura falló (${r.status}).`;
      try { const j = await r.json(); if (j && j.error) msg = String(j.error); } catch (e) { /* sin cuerpo */ }
      throw new Error(msg);
    }
    return normalize(await r.json());
  }
}

/** Convierte la respuesta de la función en datos de formulario y niveles de confianza. */
export function normalize(r: Record<string, unknown>): OcrResult {
  const ocr = {} as OcrData; const conf: Partial<Record<string, Conf>> = {};
  FIELDS.forEach(([k]) => {
    const o = r[k] as { valor?: unknown; confianza?: string } | unknown;
    let v: unknown = null; let c: Conf = null;
    if (o && typeof o === 'object') { v = (o as { valor?: unknown }).valor; c = ((o as { confianza?: string }).confianza || null) as Conf; }
    else if (o !== undefined && o !== null) { v = o; c = 'media'; }
    if (v === '' || v === undefined) v = null;
    if (k === 'fecha' && v) { const iso = toIso(v); if (iso) v = iso; else { v = null; c = null; } }
    if (k === 'hora' && v) { v = toHora(v) || null; if (!v) c = null; }
    if (k === 'importe' && v !== null) { v = parseAmount(v); if (v === null) c = null; }
    if (k === 'moneda' && v) v = /USD|\$|DOL/i.test(String(v)) && !/S\//.test(String(v)) ? 'USD' : 'PEN';
    if (v !== null && c === null) c = 'media';
    if (c !== 'alta' && c !== 'media' && c !== 'baja') c = v !== null ? 'media' : null;
    ocr[k] = { v: v as string | number | null, c };
    if (v !== null) conf[k] = c;
  });
  const f = emptyForm();
  f.banco = String(ocr.banco.v || ''); f.fecha = String(ocr.fecha.v || ''); f.hora = String(ocr.hora.v || '');
  f.operacion = ocr.operacion.v !== null ? String(ocr.operacion.v) : '';
  f.importe = ocr.importe.v !== null ? fmtNum(Number(ocr.importe.v)) : '';
  f.moneda = (ocr.moneda.v as Moneda) || 'PEN';
  f.cuenta = String(ocr.cuenta.v || ''); f.ordenante = String(ocr.ordenante.v || ''); f.referencia = String(ocr.referencia.v || '');
  const note = r.esVoucher === false ? String(r.nota || 'La imagen no parece un voucher bancario. Revísala antes de continuar.') : String(r.nota || '');
  return { ocr, conf, form: f, note };
}
