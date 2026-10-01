/*
 * Lectura de vouchers con Azure AI Document Intelligence desde la función: agrega la autenticación (clave o
 * identidad administrada) y la configuración por variables de entorno. Las reglas están en docintel-reglas.js.
 */
const { DefaultAzureCredential } = require('@azure/identity');
const reglas = require('./docintel-reglas');

let credential = null;

async function authHeaders(key) {
  if (key) return { 'Ocp-Apim-Subscription-Key': key };
  if (!credential) credential = new DefaultAzureCredential();
  const t = await credential.getToken('https://cognitiveservices.azure.com/.default');
  return { Authorization: `Bearer ${t.token}` };
}

/** Envía el archivo (base64) a Document Intelligence y espera el resultado (analyzeResult). */
async function analizar(base64, opts = {}) {
  const endpoint = opts.endpoint || process.env.DOCINTEL_ENDPOINT || '';
  if (!endpoint) throw new Error('Falta configurar DOCINTEL_ENDPOINT.');
  const key = opts.key !== undefined ? opts.key : (process.env.DOCINTEL_KEY || '');
  return reglas.analizarCon(base64, {
    endpoint,
    headers: await authHeaders(key),
    model: opts.model || process.env.DOCINTEL_MODEL || 'prebuilt-layout',
    features: opts.features !== undefined ? opts.features : (process.env.DOCINTEL_FEATURES ?? 'keyValuePairs'),
    apiVersion: process.env.DOCINTEL_API_VERSION || reglas.API_VERSION,
    timeoutMs: opts.timeoutMs
  });
}

module.exports = { analizar, extraerCampos: reglas.extraerCampos, numero: reglas.numero, fecha: reglas.fecha, hora: reglas.hora };
