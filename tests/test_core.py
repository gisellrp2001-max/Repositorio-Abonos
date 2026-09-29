"""End-to-end checks for the data layer and the OCR parser (no Tesseract needed)."""
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import db
import ocr

PNG = b'\x89PNG\r\n\x1a\n' + b'0' * 64


class CoreFlowTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        os.environ['APP_DATA_DIR'] = self.tmp.name
        os.environ['ADMIN_EMAIL'] = 'admin@empresa.com'
        os.environ['ADMIN_PASSWORD'] = 'ClaveAdmin-2026'
        db.initialize()
        self.admin = db.authenticate('admin@empresa.com', 'ClaveAdmin-2026')
        db.create_user(self.admin, 'Vendedor', 'vend@empresa.com', 'seller', 'ClaveVendedor1')
        db.create_user(self.admin, 'Otro', 'otro@empresa.com', 'seller', 'ClaveVendedor2')
        db.create_user(self.admin, 'Gestión', 'gest@empresa.com', 'management', 'ClaveGestion12')
        self.seller = db.authenticate('vend@empresa.com', 'ClaveVendedor1')
        self.other = db.authenticate('otro@empresa.com', 'ClaveVendedor2')
        self.manager = db.authenticate('gest@empresa.com', 'ClaveGestion12')
        db.create_client(self.admin, 'Cliente SAC', '20123456789', self.seller['id'])
        self.client = db.clients(self.seller)[0]
        self.data = {'bank': 'BCP', 'operation_date': '2026-09-01', 'operation_time': '10:15',
                     'operation_number': '123456', 'amount': 150.5, 'currency': 'PEN',
                     'account': '', 'payer': '', 'reference': '', 'client_id': self.client['id']}
        self.files = [{'name': 'a.png', 'mime': 'image/png', 'content': PNG},
                      {'name': 'b.pdf', 'mime': 'application/pdf', 'content': b'%PDF-1.4'}]

    def tearDown(self):
        self.tmp.cleanup()

    def test_full_flow(self):
        self.assertIsNone(db.authenticate('admin@empresa.com', 'incorrecta'))
        pid, code = db.create_payment(self.seller, self.data, self.files, {}, '')
        self.assertTrue(code.startswith('AB-'))
        self.assertEqual(len(db.attachments(self.seller, pid)), 2)

        with self.assertRaises(PermissionError):
            db.payment(self.other, pid)
        with self.assertRaises(PermissionError):
            db.create_payment(self.other, self.data, self.files, {}, '')
        with self.assertRaises(PermissionError):
            db.review(self.seller, pid, 'Validado', '')

        self.assertEqual(len(db.duplicates(self.seller, self.data)), 1)
        with self.assertRaises(ValueError):
            db.create_payment(self.seller, self.data, self.files, {}, '')

        with self.assertRaises(ValueError):
            db.review(self.manager, pid, 'Observado', '  ')
        db.review(self.manager, pid, 'Observado', 'Importe no coincide')
        self.assertEqual(db.payment(self.manager, pid)['status'], 'Observado')

        db.correct(self.seller, pid, {'amount': 155.0})
        self.assertEqual(db.payment(self.seller, pid)['status'], 'Enviado')

        db.review(self.manager, pid, 'Validado', '')
        self.assertEqual(db.payment(self.manager, pid)['status'], 'Validado')
        with self.assertRaises(ValueError):
            db.review(self.manager, pid, 'Observado', 'tarde')
        actions = [h['action'] for h in db.history(self.manager, pid)]
        self.assertEqual(actions, ['Revisión', 'Corregido y reenviado', 'Revisión', 'Registrado'])

    def test_short_password_rejected(self):
        with self.assertRaises(ValueError):
            db.create_user(self.admin, 'X', 'x@empresa.com', 'seller', 'corta')


class ParserTest(unittest.TestCase):
    def test_parse_voucher_text(self):
        text = ('BANCO DE CREDITO BCP\nConstancia de transferencia\n05/09/2026 14:32\n'
                'N° de operación: 00987654\nCuenta destino: 191-12345678-0-12\n'
                'Ordenante: Juan Pérez\nImporte S/ 1,250.40')
        r = ocr.parse_text(text)
        self.assertEqual(r['bank']['value'], 'BCP')
        self.assertEqual(r['date']['value'], '2026-09-05')
        self.assertEqual(r['time']['value'], '14:32')
        self.assertEqual(r['operation']['value'], '00987654')
        self.assertEqual(r['amount']['value'], '1250.40')
        self.assertEqual(r['currency']['value'], 'PEN')
        self.assertEqual(r['account']['value'], '191-12345678-0-12')
        self.assertEqual(r['payer']['value'], 'Juan Pérez')

    def test_usd_and_missing_fields(self):
        r = ocr.parse_text('BBVA  US$ 300.00')
        self.assertEqual(r['currency']['value'], 'USD')
        self.assertEqual(r['amount']['value'], '300.00')
        self.assertEqual(r['operation']['confidence'], 'No detectado')


if __name__ == '__main__':
    unittest.main()
