// Prueba analizar() contra un servidor local que imita la API de Document Intelligence (202 + Operation-Location + sondeo).
const assert = require('assert');
const http = require('http');
const { analizar } = require('../src/docintel');

let consultas = 0; let recibido = null;
const srv = http.createServer((req, res) => {
  let body = '';
  req.on('data', c => { body += c; });
  req.on('end', () => {
    if (req.method === 'POST') {
      recibido = { url: req.url, key: req.headers['ocp-apim-subscription-key'], body: JSON.parse(body) };
      res.writeHead(202, { 'Operation-Location': `http://127.0.0.1:${srv.address().port}/resultado/1`, 'Retry-After': '1' });
      return res.end();
    }
    consultas++;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(consultas < 2 ? { status: 'running' } : { status: 'succeeded', analyzeResult: { content: 'BCP\nS/ 10.00' } }));
  });
});

srv.listen(0, '127.0.0.1', async () => {
  try {
    const r = await analizar('QUJD', { endpoint: `http://127.0.0.1:${srv.address().port}/`, key: 'clave-prueba', model: 'prebuilt-layout', features: 'keyValuePairs' });
    assert.strictEqual(r.content, 'BCP\nS/ 10.00');
    assert.strictEqual(consultas, 2);
    assert.strictEqual(recibido.key, 'clave-prueba');
    assert.deepStrictEqual(recibido.body, { base64Source: 'QUJD' });
    assert.ok(recibido.url.startsWith('/documentintelligence/documentModels/prebuilt-layout:analyze?api-version=2024-11-30'));
    assert.ok(recibido.url.includes('features=keyValuePairs'));
    console.log('analizar OK');
  } catch (e) { console.error(e); process.exitCode = 1; } finally { srv.close(); }
});
