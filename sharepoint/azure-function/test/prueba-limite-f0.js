// Simula el límite del plan F0 (1 POST y 1 GET por segundo; si no, 429) y lee 6 vouchers de dos en dos,
// como el lote de la app: todos deben terminar bien gracias a los reintentos y al ritmo adaptativo.
const assert = require('assert');
const http = require('http');
const { analizarCon, _reiniciarRitmo } = require('../src/docintel-reglas');

const ultimo = { POST: 0, GET: 0 };
const rechazos = { POST: 0, GET: 0 };
const consultas = {};
let seq = 0;
const srv = http.createServer((req, res) => {
  req.resume();
  req.on('end', () => {
    const ahora = Date.now();
    if (ahora - ultimo[req.method] < 1000) { rechazos[req.method]++; res.writeHead(429); return res.end('{"error":{"code":"429"}}'); }
    ultimo[req.method] = ahora;
    if (req.method === 'POST') {
      const id = ++seq; consultas[id] = 0;
      res.writeHead(202, { 'Operation-Location': `http://127.0.0.1:${srv.address().port}/resultado/${id}` });
      return res.end();
    }
    const id = req.url.split('/').pop();
    consultas[id]++;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(consultas[id] < 2 ? { status: 'running' } : { status: 'succeeded', analyzeResult: { content: `voucher ${id}` } }));
  });
});

srv.listen(0, '127.0.0.1', async () => {
  try {
    _reiniciarRitmo();
    const opts = { endpoint: `http://127.0.0.1:${srv.address().port}`, headers: {} };
    const t0 = Date.now();
    const pendientes = [1, 2, 3, 4, 5, 6];
    const hechos = [];
    const trabajador = async () => { while (pendientes.length) { pendientes.shift(); hechos.push((await analizarCon('QUJD', opts)).content); } };
    await Promise.all([trabajador(), trabajador()]);
    const s = ((Date.now() - t0) / 1000).toFixed(1);
    assert.strictEqual(hechos.length, 6);
    assert.ok(rechazos.POST + rechazos.GET > 0, 'la simulación debe haber rechazado alguna llamada');
    console.log(`limite F0 OK (6 vouchers en ${s} s; ${rechazos.POST + rechazos.GET} rechazos 429 recuperados)`);
  } catch (e) { console.error(e); process.exitCode = 1; } finally { srv.close(); }
});
