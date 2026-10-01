/*
 * Reglas de lectura de vouchers con Azure AI Document Intelligence, sin dependencias: las usan la función
 * (src/docintel.js) y la demo del web part, que llama a Document Intelligence directo desde el navegador.
 * analizarCon() envía el archivo y espera el resultado; extraerCampos() traduce el texto y los pares
 * "etiqueta: valor" a los nueve campos del abono con reglas para vouchers de bancos peruanos.
 */
const API_VERSION = '2024-11-30';
const esperar = ms => new Promise(r => setTimeout(r, ms));

/*
 * Ritmo de llamadas. El plan gratuito F0 permite 1 análisis (POST) y 1 consulta (GET) por segundo; el lote
 * lee dos vouchers a la vez. Si Azure responde 429, desde ahí las llamadas de cada tipo se espacian 1.1 s
 * (para todo el lote, porque el estado es del módulo) y la llamada rechazada se repite tras una espera.
 */
const ritmo = { gap: 0, post: 0, get: 0 };
async function turno(tipo) {
  const ahora = Date.now();
  const t = Math.max(ahora, ritmo[tipo]);
  ritmo[tipo] = t + ritmo.gap;
  if (t > ahora) await esperar(t - ahora);
}
async function pedir(tipo, url, init, limite) {
  for (let intento = 0; ; intento++) {
    await turno(tipo);
    const r = await fetch(url, init);
    if (r.status !== 429) return r;
    ritmo.gap = Math.max(ritmo.gap, 1100);
    const ra = Number(r.headers.get('retry-after'));
    const espera = (ra > 0 ? ra * 1000 : Math.min(1000 * 2 ** intento, 8000)) + Math.floor(Math.random() * 400);
    if (Date.now() + espera > limite) return r;
    await esperar(espera);
  }
}

/**
 * Envía el archivo (base64) a Document Intelligence y espera el resultado (analyzeResult).
 * opts: { endpoint, headers (clave o token), model, features, apiVersion, timeoutMs }
 */
async function analizarCon(base64, opts) {
  const endpoint = String(opts.endpoint || '').trim().replace(/\/+$/, '');
  if (!endpoint) throw new Error('Falta el punto de conexión de Document Intelligence.');
  const model = opts.model || 'prebuilt-layout';
  const features = opts.features === undefined ? 'keyValuePairs' : opts.features;
  const headers = opts.headers || {};
  const limite = Date.now() + (opts.timeoutMs || 90000);
  const qs = `api-version=${opts.apiVersion || API_VERSION}&locale=es-ES${features ? `&features=${encodeURIComponent(features)}` : ''}`;
  const r = await pedir('post', `${endpoint}/documentintelligence/documentModels/${encodeURIComponent(model)}:analyze?${qs}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ base64Source: base64 })
  }, limite);
  if (r.status !== 202) {
    const e = new Error(`Document Intelligence ${r.status}: ${(await r.text()).slice(0, 400)}`);
    e.status = r.status; throw e;
  }
  const op = r.headers.get('operation-location');
  if (!op) { const e = new Error('Document Intelligence no devolvió la dirección del resultado.'); e.status = 502; throw e; }
  const pausa = Math.min(Math.max(Number(r.headers.get('retry-after')) || 1, 1), 3) * 1000;
  while (Date.now() < limite) {
    await esperar(pausa);
    const p = await pedir('get', op, { headers }, limite);
    if (p.status === 429) break;
    const j = await p.json();
    if (j.status === 'succeeded') return j.analyzeResult;
    if (j.status === 'failed') { const e = new Error(`Document Intelligence: ${JSON.stringify(j.error || {}).slice(0, 400)}`); e.status = 502; throw e; }
  }
  const e = new Error('Document Intelligence no respondió a tiempo.'); e.status = 504; throw e;
}

/** Solo para pruebas: reinicia el ritmo de llamadas. */
function _reiniciarRitmo() { ritmo.gap = 0; ritmo.post = 0; ritmo.get = 0; }

// ---------- Interpretación del resultado ----------

const plano = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
const nivel = c => (c >= 0.9 ? 'alta' : c >= 0.6 ? 'media' : 'baja');
const campo = (valor, confianza) => ({ valor: valor === undefined || valor === '' ? null : valor, confianza: valor === undefined || valor === null || valor === '' ? null : confianza });

const BANCOS = [
  ['BCP', /\bBCP\b|BANCO DE CREDITO|\bYAPE/], ['BBVA', /\bBBVA\b|BANCO CONTINENTAL/], ['Interbank', /INTERBANK/],
  ['Scotiabank', /SCOTIA\s?BANK/], ['BanBif', /BANBIF|INTERAMERICANO DE FINANZAS/], ['Banco de la Nación', /BANCO DE LA NACION|\bPAGALO\b/],
  ['Banco Pichincha', /PICHINCHA/], ['Banco GNB', /\bGNB\b/], ['Mibanco', /MIBANCO/],
  ['Caja Arequipa', /CAJA AREQUIPA/], ['Caja Huancayo', /CAJA HUANCAYO/], ['Caja Piura', /CAJA PIURA/]
];
const MESES = { ENE: 1, JAN: 1, FEB: 2, MAR: 3, ABR: 4, APR: 4, MAY: 5, JUN: 6, JUL: 7, AGO: 8, AUG: 8, SET: 9, SEP: 9, OCT: 10, NOV: 11, DIC: 12, DEC: 12 };

const ETIQUETAS = {
  fecha: /FECHA/,
  hora: /\bHORA\b/,
  // También "OP-0534249" (recaudación BCP): OP seguido de un separador y un número.
  operacion: /(N[°ºO.]?|NRO\.?|NUMERO|CODIGO|COD\.?)\s*(DE\s*)?(LA\s*)?(OPERACION|OP\b|TRANSACCION|CONSTANCIA)|CONSTANCIA\s*(N[°ºO.]?|:)|SECUENCIA|OPERACION\s*(N[°ºO.]|:|#)|\bOP(?=\s*[-:#.]\s*\d)/,
  importe: /IMPORTE|MONTO|TOTAL|VALOR TRANSFERIDO|CANTIDAD/,
  cuenta: /CUENTA|\bCTA\b|\bCCI\b|DESTINO|BENEFICIARIO|CONVENIO/,
  ordenante: /ORDENANTE|TITULAR|REMITENTE|PAGADOR|DEPOSITANTE|ENVIADO POR|^DE$/,
  referencia: /REFERENCIA|CONCEPTO|GLOSA|DESCRIPCION|MENSAJE|DETALLE/
};

// Etiquetas que parecen del campo pero no lo son (cuenta de origen, comisiones, vencimientos).
const EXCLUIR = { cuenta: /ORIGEN|CARGO|ORDENANTE/, importe: /COMISION|\bITF\b|CARGO|SALDO/, fecha: /VENCIMIENTO|NACIMIENTO/, operacion: /FECHA|HORA/ };

/** Busca un valor por su etiqueta: primero en los pares clave-valor, luego línea a línea en el texto. */
function porEtiqueta(clave, kvs, lineas) {
  const re = ETIQUETAS[clave];
  const no = EXCLUIR[clave];
  const out = [];
  for (const kv of kvs) if (re.test(kv.k) && !(no && no.test(kv.k)) && kv.v) out.push({ v: kv.v, c: nivel(kv.c) });
  for (let i = 0; i < lineas.length; i++) {
    const p = plano(lineas[i]);
    const m = p.match(re);
    if (!m || (no && no.test(p))) continue;
    let resto = lineas[i].slice(m.index + m[0].length).replace(/^[^:#-]*?[:#-]\s*/, '').trim();
    if (resto) out.push({ v: resto, c: 'media' });
    // El valor suele ir en la línea siguiente ("Cuenta destino" ↵ "200-3001234567").
    if (lineas[i + 1]) out.push({ v: lineas[i + 1].trim(), c: 'media' });
  }
  return out;
}

function fecha(s) {
  const p = plano(s);
  let d, mo, y;
  let m = p.match(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4}|\d{2})\b/);
  if (m) { d = +m[1]; mo = +m[2]; y = +m[3]; }
  else if ((m = p.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/))) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if ((m = p.match(/\b(\d{1,2})\s*(?:DE\s+)?(ENE|JAN|FEB|MAR|ABR|APR|MAY|JUN|JUL|AGO|AUG|SET|SEP|OCT|NOV|DIC|DEC)[A-Z]*\.?\s*(?:DE(?:L)?\s+)?(\d{4})\b/))) { d = +m[1]; mo = MESES[m[2]]; y = +m[3]; }
  else return null;
  if (y < 100) y += 2000;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d || y < 2000 || y > 2100) return null;
  return `${String(d).padStart(2, '0')}/${String(mo).padStart(2, '0')}/${y}`;
}

function hora(s) {
  const m = plano(s).match(/\b([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?\s*(A\.?\s?M\.?|P\.?\s?M\.?)?/);
  if (!m) return null;
  let h = +m[1];
  if (m[3]) { const pm = m[3][0] === 'P'; if (pm && h < 12) h += 12; if (!pm && h === 12) h = 0; }
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

/**
 * N° de operación en tickets de recaudación BBVA, que no lo etiquetan:
 * "CLAVE: RC70/1714/P030520 /00240109/16:53" → 00240109 (el último bloque solo de dígitos antes de la hora).
 */
function operacionClave(lineas) {
  for (const l of lineas) {
    const m = plano(l).match(/^\s*CLAVE\s*:?\s*(.+)$/);
    if (!m) continue;
    const partes = m[1].split('/').map(x => x.trim()).filter(x => x && !/^\d{1,2}:\d{2}(:\d{2})?$/.test(x));
    for (let i = partes.length - 1; i >= 0; i--) if (/^\d{6,12}$/.test(partes[i])) return partes[i];
  }
  return null;
}

/** Hora junto a su etiqueta: acepta también "16.53" o "16h53", que fuera de la etiqueta se confundiría con un monto. */
function horaEtiqueta(s) {
  const h = hora(s);
  if (h) return h;
  const m = plano(s).match(/^\s*([01]?\d|2[0-3])\s*[.H]\s*([0-5]\d)\b/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
}

function operacion(s) {
  // Se quitan fechas y horas para no tomar un año como número de operación.
  const t = plano(s).replace(/\b\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}\b|\b\d{1,2}:\d{2}(:\d{2})?\b/g, ' ');
  const m = t.match(/\b([A-Z]{0,4}\d[\dA-Z-]{4,23})\b/);
  return m ? m[1] : null;
}

/** Convierte "1,250.40", "1.250,40", "18450" a número. */
function numero(raw) {
  let t = String(raw).replace(/[\s*]/g, '');
  // "5.000.00" o "1,234,567.89": el último separador seguido de 2 dígitos es el decimal; los demás son de miles.
  const sep = t.match(/[.,]/g) || [];
  if (sep.length > 1 && /[.,]\d{2}$/.test(t)) t = t.slice(0, -3).replace(/[.,]/g, '') + '.' + t.slice(-2);
  if (t.includes(',') && t.includes('.')) t = t.lastIndexOf('.') > t.lastIndexOf(',') ? t.replace(/,/g, '') : t.replace(/\./g, '').replace(',', '.');
  else if (t.includes(',')) t = /,\d{2}$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const n = parseFloat(t);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}
const MONTO = /(S\/\.?|US\$|USD|\$|SOLES|DOLARES|PEN)?\s*(\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(SOLES|DOLARES|USD|PEN)?/;
const moneda = sim => (!sim ? null : /S\/|SOLES|PEN/.test(sim) ? 'PEN' : 'USD');
// "$" solo (sin "US") es ambiguo en algunos tickets peruanos: se toma como dólares, pero para revisar.
const simboloDudoso = sim => /^\$$/.test(String(sim || '').trim());

/** Valida un RUC peruano (11 dígitos, prefijo 10/15/16/17/20 y dígito verificador). */
function rucValido(r) {
  if (!/^(10|15|16|17|20)\d{9}$/.test(r)) return false;
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = pesos.reduce((acc, w, i) => acc + w * Number(r[i]), 0);
  const dv = (11 - (suma % 11)) % 10;
  return dv === Number(r[10]);
}

/**
 * RUC (y nombre) de quien paga en tickets de recaudación: "REF.: 20609231158CONGA DE ORO EIRL",
 * "Código Id Usuario: 20275847721". Devuelve "NOMBRE · RUC 20609231158" o "RUC 20275847721".
 */
const ETIQ_RUC = /^\s*(REF\b|REFERENCIA\b|(COD(IGO)?\.?\s*)?(ID\s*)?(DE\s*)?(USUARIO|DEPOSITANTE|CLIENTE|ASOCIADO)\b|RUC\b|DNI\b)/;
function ordenanteRuc(lineas) {
  for (let i = 0; i < lineas.length; i++) {
    const p = plano(lineas[i]);
    if (!ETIQ_RUC.test(p)) continue;
    const val = lineas[i].replace(/^[^:]*:\s*/, '');
    const m = val.match(/^\s*(\d{11})\s*([^\d].*)?$/);
    if (!m || !rucValido(m[1])) continue;
    const nom = m[2] ? nombre(m[2]) : null;
    return nom ? `${nom} · RUC ${m[1]}` : `RUC ${m[1]}`;
  }
  return null;
}

function importe(s) {
  const m = plano(s).replace(/\*+/g, '').match(MONTO);
  if (!m) return null;
  const valor = numero(m[2]);
  return valor === null ? null : { valor, moneda: moneda(m[1] || m[3]), dudoso: simboloDudoso(m[1] || m[3]) };
}

function cuenta(s) {
  const m = String(s).match(/[\d*][\d*\s-]{6,}[\d*]/);
  return m ? m[0].replace(/\s+/g, ' ').trim() : null;
}

const texto = s => { const t = String(s).replace(/\s+/g, ' ').trim(); return t.length >= 2 ? t.slice(0, 120) : null; };
// Un nombre debe tener letras; así no se toma un número de cuenta como ordenante.
const nombre = s => { const t = texto(s); return t && (t.match(/[A-Za-zÁÉÍÓÚÑáéíóúñ]/g) || []).length >= 3 ? t : null; };

/** analyzeResult de Document Intelligence → { esVoucher, banco, fecha, …, nota } con valor y confianza. */
function extraerCampos(result) {
  const content = (result && result.content) || '';
  const T = plano(content);
  const lineas = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const kvs = ((result && result.keyValuePairs) || [])
    .filter(kv => kv && kv.key && kv.value)
    .map(kv => ({ k: plano(kv.key.content).trim(), v: String(kv.value.content || '').trim(), c: typeof kv.confidence === 'number' ? kv.confidence : 0.7 }));
  const notas = [];
  const primero = (clave, fn) => { for (const x of porEtiqueta(clave, kvs, lineas)) { const v = fn(x.v); if (v !== null) return { v, c: x.c }; } return null; };

  const out = {};
  const bancos = BANCOS.map(([n, re]) => { const m = T.match(re); return m ? { n, i: m.index } : null; }).filter(Boolean).sort((a, b) => a.i - b.i);
  out.banco = bancos.length ? campo(bancos[0].n, bancos.length === 1 ? 'alta' : 'media') : campo(null);
  if (bancos.length > 1) notas.push(`Aparecen varios bancos (${bancos.map(b => b.n).join(', ')}); confirma el banco emisor.`);

  const f = primero('fecha', fecha); const ft = f ? null : fecha(content);
  out.fecha = f ? campo(f.v, f.c) : campo(ft, 'media');
  const h = primero('hora', horaEtiqueta); const ht = h ? null : hora(content);
  out.hora = h ? campo(h.v, h.c) : campo(ht, 'media');
  const o = primero('operacion', operacion);
  const oClave = o ? null : operacionClave(lineas);
  out.operacion = o ? campo(o.v, o.c) : campo(oClave, 'media');

  let imp = primero('importe', importe);
  if (!imp) {
    // Sin etiqueta: el mayor monto con símbolo de moneda (las comisiones suelen ser menores).
    const re = new RegExp(MONTO.source.replace('(S\\/\\.?|US\\$|USD|\\$|SOLES|DOLARES|PEN)?', '(S\\/\\.?|US\\$|USD|\\$|SOLES|DOLARES|PEN)'), 'g');
    let best = null;
    for (const m of T.replace(/\*+/g, '').matchAll(re)) { const v = numero(m[2]); if (v !== null && (!best || v > best.valor)) best = { valor: v, moneda: moneda(m[1]), dudoso: simboloDudoso(m[1]) }; }
    if (best) imp = { v: best, c: 'media' };
  }
  out.importe = imp ? campo(imp.v.valor, imp.c) : campo(null);
  // Moneda: la del símbolo junto al importe; si no hay, la que aparezca en el texto. Un "$" solo queda para revisar.
  let mon = imp && imp.v.moneda; let monConf = mon ? (imp.c === 'baja' ? 'baja' : imp.v.dudoso ? 'media' : 'alta') : 'media';
  if (!mon) {
    if (/US\$|\bUSD\b|DOLARES/.test(T)) mon = 'USD';
    else if (/S\/|\bSOLES\b/.test(T)) mon = 'PEN';
    else if (/\$/.test(T)) mon = 'USD';
  }
  out.moneda = campo(mon || null, monConf);

  const cu = primero('cuenta', cuenta);
  out.cuenta = cu ? campo(cu.v, cu.c) : campo(null);
  const or = primero('ordenante', nombre);
  const orRuc = or ? null : ordenanteRuc(lineas);
  out.ordenante = or ? campo(or.v, or.c) : campo(orRuc, 'media');
  const rf = primero('referencia', texto);
  out.referencia = rf ? campo(rf.v, rf.c) : campo(null);

  out.esVoucher = !!(out.banco.valor || out.operacion.valor || out.importe.valor);
  if (!out.esVoucher) notas.push(content.trim() ? 'No parece un voucher bancario: no se encontró banco, número de operación ni importe.' : 'No se pudo leer texto en la imagen.');
  out.nota = notas.join(' ');
  return out;
}

module.exports = { API_VERSION, analizarCon, extraerCampos, numero, fecha, hora, rucValido, _reiniciarRitmo };
