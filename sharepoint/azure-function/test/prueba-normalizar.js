const assert = require('assert');
const { normalizar } = require('../src/functions/leerVoucher');
const r = normalizar({ esVoucher: true, banco: { valor: 'BCP', confianza: 'alta' }, importe: { valor: '18,450.00', confianza: 'rara' }, hora: '', ordenante: 'ABC SAC' });
assert.deepStrictEqual(r.banco, { valor: 'BCP', confianza: 'alta' });
assert.deepStrictEqual(r.importe, { valor: 18450, confianza: 'media' });
assert.deepStrictEqual(r.hora, { valor: null, confianza: null });
assert.deepStrictEqual(r.ordenante, { valor: 'ABC SAC', confianza: 'media' });
assert.strictEqual(r.esVoucher, true);
console.log('normalizar OK');
