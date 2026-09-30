// Prueba la lectura con Document Intelligence sobre vouchers reales, desde tu computadora.
// Uso:  node probar-voucher.js voucher1.jpg [voucher2.pdf ...]
// Antes define DOCINTEL_ENDPOINT y DOCINTEL_KEY (Portal de Azure › tu recurso › Claves y punto de conexión).
const fs = require('fs');
const path = require('path');
const { analizar, extraerCampos } = require('./src/docintel');

const ETIQ = { banco: 'Banco', fecha: 'Fecha', hora: 'Hora', operacion: 'N° operación', importe: 'Importe', moneda: 'Moneda', cuenta: 'Cuenta destino', ordenante: 'Ordenante', referencia: 'Referencia' };

(async () => {
  const archivos = process.argv.slice(2);
  if (!archivos.length || !process.env.DOCINTEL_ENDPOINT) {
    console.log('Uso: node probar-voucher.js <imagen o PDF> [...]\nDefine antes DOCINTEL_ENDPOINT y DOCINTEL_KEY.');
    process.exit(1);
  }
  for (const a of archivos) {
    console.log(`\n=== ${path.basename(a)} ===`);
    try {
      const t0 = Date.now();
      const res = await analizar(fs.readFileSync(a).toString('base64'));
      const c = extraerCampos(res);
      for (const k of Object.keys(ETIQ)) console.log(`${ETIQ[k].padEnd(15)} ${c[k].valor === null ? '—' : c[k].valor}${c[k].confianza ? `  (${c[k].confianza})` : ''}`);
      if (c.nota) console.log(`Nota: ${c.nota}`);
      console.log(`(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
      if (process.env.VER_TEXTO) console.log('\n--- Texto leído ---\n' + res.content);
    } catch (e) { console.log('Error:', e.message); }
  }
})();
