/*
 * leer-voucher: recibe la imagen de un voucher y devuelve banco, fecha, hora, operación, importe, moneda,
 * cuenta destino, ordenante y referencia, cada uno con su nivel de confianza.
 *
 * Seguridad: protege la Function App con la autenticación de App Service (Entra ID). El web part llama
 * con AadHttpClient, así que solo usuarios de tu organización con el permiso aprobado llegan aquí.
 * La clave de Azure OpenAI nunca sale de Azure; si no defines AZURE_OPENAI_KEY se usa la identidad
 * administrada de la función.
 */
const { app } = require('@azure/functions');
const { DefaultAzureCredential } = require('@azure/identity');

const ENDPOINT = (process.env.AZURE_OPENAI_ENDPOINT || '').replace(/\/+$/, '');
const DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o';
const API_VERSION = process.env.AZURE_OPENAI_API_VERSION || '2024-10-21';
const KEY = process.env.AZURE_OPENAI_KEY || '';
const MAX_BYTES = 8 * 1024 * 1024;
let credential = null;

const PROMPT = `Eres un asistente que lee vouchers o constancias de transferencias y depósitos bancarios de Perú.
Extrae los datos de la imagen y responde SOLO con un objeto JSON con esta forma exacta:
{"esVoucher": true,
 "banco": {"valor": "BCP", "confianza": "alta"},
 "fecha": {"valor": "25/09/2026", "confianza": "alta"},
 "hora": {"valor": "10:18", "confianza": "media"},
 "operacion": {"valor": "00892143", "confianza": "alta"},
 "importe": {"valor": 18450.00, "confianza": "alta"},
 "moneda": {"valor": "PEN", "confianza": "alta"},
 "cuenta": {"valor": "193-1122334-0-45", "confianza": "alta"},
 "ordenante": {"valor": "TRANSPORTES ABC SAC", "confianza": "media"},
 "referencia": {"valor": "FACT F001-004512", "confianza": "alta"},
 "nota": ""}
Reglas:
- banco: nombre corto del banco emisor (BCP, BBVA, Interbank, Scotiabank, BanBif, Banco de la Nación, Banco Pichincha, Mibanco, o el que aparezca).
- fecha en formato DD/MM/AAAA; hora en HH:MM de 24 horas.
- operacion: número de operación, constancia o secuencia, tal como aparece.
- importe: número con punto decimal, sin separador de miles ni símbolo de moneda.
- moneda: "PEN" para soles (S/), "USD" para dólares (US$ o $).
- cuenta: cuenta o CCI de destino (beneficiario). ordenante: quien paga. referencia: glosa, descripción o concepto.
- confianza: "alta" si se lee con claridad, "media" si hay alguna duda (borroso, cortado o ambiguo), "baja" si es una suposición.
- Si un dato no aparece o no se puede leer, usa {"valor": null, "confianza": null}. Nunca inventes datos.
- Si la imagen no es un voucher bancario, pon "esVoucher": false y explica en "nota".
- "nota": una frase breve en español solo si hay algo que el usuario deba revisar; si no, "".`;

const CAMPOS = ['banco', 'fecha', 'hora', 'operacion', 'importe', 'moneda', 'cuenta', 'ordenante', 'referencia'];

/** Garantiza la forma de la respuesta aunque el modelo omita o deforme algún campo. */
function normalizar(r) {
  const out = { esVoucher: r && r.esVoucher !== false, nota: typeof (r && r.nota) === 'string' ? r.nota.slice(0, 300) : '' };
  for (const k of CAMPOS) {
    const o = r ? r[k] : null;
    let valor = null, confianza = null;
    if (o && typeof o === 'object') { valor = o.valor ?? null; confianza = o.confianza ?? null; }
    else if (o !== undefined && o !== null && o !== '') { valor = o; confianza = 'media'; }
    if (valor === '') valor = null;
    if (!['alta', 'media', 'baja'].includes(confianza)) confianza = valor === null ? null : 'media';
    if (k === 'importe' && valor !== null) {
      const n = typeof valor === 'number' ? valor : parseFloat(String(valor).replace(/[^\d.-]/g, ''));
      valor = Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
      if (valor === null) confianza = null;
    }
    if (typeof valor === 'string') valor = valor.slice(0, 200);
    out[k] = { valor, confianza };
  }
  return out;
}

async function authHeaders() {
  if (KEY) return { 'api-key': KEY };
  if (!credential) credential = new DefaultAzureCredential();
  const t = await credential.getToken('https://cognitiveservices.azure.com/.default');
  return { Authorization: `Bearer ${t.token}` };
}

app.http('leer-voucher', {
  methods: ['POST'],
  authLevel: 'anonymous', // la autenticación la aplica App Service (Entra ID) antes de llegar aquí
  handler: async (request, context) => {
    if (!ENDPOINT) return { status: 500, jsonBody: { error: 'Falta configurar AZURE_OPENAI_ENDPOINT en la función.' } };
    let body;
    try { body = await request.json(); } catch { return { status: 400, jsonBody: { error: 'Solicitud inválida.' } }; }
    const image = body && typeof body.image === 'string' ? body.image : '';
    const mime = body && /^image\/(jpeg|png|webp)$/.test(body.mimeType || '') ? body.mimeType : 'image/jpeg';
    if (!image) return { status: 400, jsonBody: { error: 'No se recibió la imagen del voucher.' } };
    if (image.length * 0.75 > MAX_BYTES) return { status: 413, jsonBody: { error: 'La imagen es demasiado grande.' } };

    const url = `${ENDPOINT}/openai/deployments/${encodeURIComponent(DEPLOYMENT)}/chat/completions?api-version=${API_VERSION}`;
    const payload = {
      messages: [
        { role: 'system', content: PROMPT },
        { role: 'user', content: [
          { type: 'text', text: 'Lee este voucher y devuelve el JSON.' },
          { type: 'image_url', image_url: { url: `data:${mime};base64,${image}`, detail: 'high' } }
        ] }
      ],
      temperature: 0,
      max_tokens: 800,
      response_format: { type: 'json_object' }
    };
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify(payload) });
      if (!r.ok) {
        const t = await r.text();
        context.error(`Azure OpenAI ${r.status}: ${t.slice(0, 500)}`);
        const status = r.status === 429 ? 429 : 502;
        return { status, jsonBody: { error: r.status === 429 ? 'Hay muchas lecturas en curso. Intenta en unos segundos.' : 'El servicio de lectura no respondió correctamente.' } };
      }
      const j = await r.json();
      const text = j && j.choices && j.choices[0] && j.choices[0].message ? j.choices[0].message.content : '';
      let parsed = {};
      try { parsed = JSON.parse(text); } catch { const m = String(text).match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : {}; }
      return { status: 200, jsonBody: normalizar(parsed) };
    } catch (e) {
      context.error(e);
      return { status: 502, jsonBody: { error: 'No se pudo leer el voucher.' } };
    }
  }
});

module.exports = { normalizar };
