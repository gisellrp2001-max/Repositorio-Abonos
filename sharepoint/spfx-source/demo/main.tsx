/* Punto de entrada del modo demo: monta la app con servicios simulados y una barra para cambiar de rol. */
import * as React from 'react';
import * as ReactDom from 'react-dom';
import App from '../src/webparts/gestionAbonos/components/App';
import { SpService } from '../src/webparts/gestionAbonos/services/SpService';
import { OcrService } from '../src/webparts/gestionAbonos/services/OcrService';
import { MockSp, MockOcr, USERS, resetDemo } from './mockServices';

type Rol = 'vendedor' | 'vendedor2' | 'gestion';
const ocrUrl = new URLSearchParams(window.location.search).get('ocr') || '';

function Demo(): React.ReactElement {
  const initial = ((): Rol => { try { return (localStorage.getItem('gestion-abonos-demo-rol') as Rol) || 'vendedor'; } catch (e) { return 'vendedor'; } })();
  const [rol, setRol] = React.useState<Rol>(initial);
  const [gen, setGen] = React.useState(0);
  const u = USERS[rol];
  const sp = React.useMemo(() => new MockSp(u.id, u.name, rol === 'gestion'), [rol, gen]);
  const ocr = React.useMemo(() => new MockOcr(ocrUrl), []);
  const change = (r: Rol): void => { setRol(r); try { localStorage.setItem('gestion-abonos-demo-rol', r); } catch (e) { /* nada */ } };
  return (
    <>
      <div className="demo-bar">
        <b>Modo demo</b>
        <span>Los datos se guardan solo en este navegador. {ocrUrl ? `Lectura con la función: ${ocrUrl}` : 'La lectura del voucher es simulada.'}</span>
        <label>Ver como
          <select value={rol} onChange={e => change(e.target.value as Rol)}>
            <option value="vendedor">Vendedor · Juan Pérez</option>
            <option value="vendedor2">Vendedor · Carla Mendoza</option>
            <option value="gestion">Gestión · María López</option>
          </select>
        </label>
        <button type="button" onClick={() => { resetDemo(); setGen(g => g + 1); }}>Restablecer datos de ejemplo</button>
      </div>
      <div className="demo-frame">
        <App key={rol + gen} sp={sp as unknown as SpService} ocr={ocr as unknown as OcrService} userName={u.name} mappingError="" />
      </div>
    </>
  );
}

ReactDom.render(<Demo />, document.getElementById('app'));
