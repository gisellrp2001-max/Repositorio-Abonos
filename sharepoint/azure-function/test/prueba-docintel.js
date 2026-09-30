const assert = require('assert');
const { extraerCampos, numero, fecha, hora } = require('../src/docintel');
const kv = (k, v, confidence = 0.95) => ({ key: { content: k }, value: { content: v }, confidence });
const val = (r, k) => r[k].valor;

// Utilidades
assert.strictEqual(numero('1,250.40'), 1250.4);
assert.strictEqual(numero('1.250,40'), 1250.4);
assert.strictEqual(numero('18450'), 18450);
assert.strictEqual(numero('12.300'), 12300);
assert.strictEqual(fecha('25 de setiembre de 2026'), '25/09/2026');
assert.strictEqual(fecha('31/02/2026'), null);
assert.strictEqual(hora('10:18 p. m.'), '22:18');

// 1. BCP con pares clave-valor
let r = extraerCampos({
  content: 'BCP\nConstancia de transferencia\nFecha y hora: 25/09/2026 10:18\nN° de operación: 00892143\nImporte transferido\nS/ 18,450.00\nCuenta origen: 191-99887766-0-11\nCuenta destino: 193-1122334-0-45\nOrdenante: TRANSPORTES ABC SAC\nReferencia: FACT F001-004512',
  keyValuePairs: [kv('Fecha y hora:', '25/09/2026 10:18'), kv('N° de operación:', '00892143'), kv('Importe transferido', 'S/ 18,450.00'),
    kv('Cuenta origen:', '191-99887766-0-11'), kv('Cuenta destino:', '193-1122334-0-45'), kv('Ordenante:', 'TRANSPORTES ABC SAC', 0.7), kv('Referencia:', 'FACT F001-004512')]
});
assert.deepStrictEqual(
  [val(r, 'banco'), val(r, 'fecha'), val(r, 'hora'), val(r, 'operacion'), val(r, 'importe'), val(r, 'moneda'), val(r, 'cuenta'), val(r, 'ordenante'), val(r, 'referencia')],
  ['BCP', '25/09/2026', '10:18', '00892143', 18450, 'PEN', '193-1122334-0-45', 'TRANSPORTES ABC SAC', 'FACT F001-004512']);
assert.strictEqual(r.operacion.confianza, 'alta');
assert.strictEqual(r.ordenante.confianza, 'media');
assert.strictEqual(r.esVoucher, true);

// 2. Interbank sin pares clave-valor: etiqueta y valor en líneas distintas, comisión menor que el monto
r = extraerCampos({ content: 'Interbank\nOperación exitosa\n26 set. 2026 - 15:40\nNº de operación\n4471029\nComisión S/ 5.00\nMonto\nS/ 7,850.00\nCuenta destino\n200-3001234567\nTitular: Distribuidora Andina S.A.' });
assert.deepStrictEqual(
  [val(r, 'banco'), val(r, 'fecha'), val(r, 'hora'), val(r, 'operacion'), val(r, 'importe'), val(r, 'moneda'), val(r, 'cuenta'), val(r, 'ordenante')],
  ['Interbank', '26/09/2026', '15:40', '4471029', 7850, 'PEN', '200-3001234567', 'Distribuidora Andina S.A.']);

// 3. Yape: monto sin decimales y hora con p. m.
r = extraerCampos({ content: '¡Yapeaste!\nS/ 150\nJuan Pérez\n30 set. 2026 | 10:18 p. m.\nNro. de operación: 12345678' });
assert.deepStrictEqual([val(r, 'banco'), val(r, 'importe'), val(r, 'moneda'), val(r, 'fecha'), val(r, 'hora'), val(r, 'operacion')],
  ['BCP', 150, 'PEN', '30/09/2026', '22:18', '12345678']);

// 4. BBVA en dólares, importe sin etiqueta
r = extraerCampos({ content: 'BBVA\nTransferencia a terceros\n24/09/2026 04:25\nCódigo de operación: 7730915\nUS$ 3,200.00\nDestino: 0011-0123-45-0100012345' });
assert.deepStrictEqual([val(r, 'banco'), val(r, 'importe'), val(r, 'moneda'), val(r, 'operacion'), val(r, 'cuenta')],
  ['BBVA', 3200, 'USD', '7730915', '0011-0123-45-0100012345']);
assert.strictEqual(r.importe.confianza, 'media');

// 5. Transferencia BCP → Scotiabank: el emisor es el que aparece primero y se avisa
r = extraerCampos({ content: 'BCP\nTransferencia interbancaria\nBanco destino: Scotiabank\nMonto: S/ 1,000.00' });
assert.strictEqual(val(r, 'banco'), 'BCP');
assert.strictEqual(r.banco.confianza, 'media');
assert.ok(/varios bancos/.test(r.nota));

// 6. No es un voucher
r = extraerCampos({ content: 'Lista de compras\nleche\npan' });
assert.strictEqual(r.esVoucher, false);
assert.ok(r.nota.length > 0);

console.log('docintel OK');
