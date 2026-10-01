/* Punto de entrada del modo demo: monta la app con servicios simulados y una barra para cambiar de rol. */
import * as React from 'react';
import * as ReactDom from 'react-dom';
import App from '../src/webparts/gestionAbonos/components/App';
import { SpService } from '../src/webparts/gestionAbonos/services/SpService';
import { OcrService } from '../src/webparts/gestionAbonos/services/OcrService';
import { MockSp, MockOcr, USERS, resetDemo, DocIntelCfg, getDocIntel, setDocIntel, probarDocIntel } from './mockServices';

type Rol = 'vendedor' | 'vendedor2' | 'gestion';
const ocrUrl = new URLSearchParams(window.location.search).get('ocr') || '';

/** Ventana para activar la lectura real con Document Intelligence (punto de conexión y clave del usuario). */
function LecturaReal(props: { onClose: (cfg: DocIntelCfg | null | undefined) => void }): React.ReactElement {
  const actual = getDocIntel();
  const [ep, setEp] = React.useState(actual ? actual.endpoint : '');
  const [key, setKey] = React.useState(actual ? actual.key : '');
  const [msg, setMsg] = React.useState<{ ok: boolean; t: string } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const guardar = async (): Promise<void> => {
    const cfg = { endpoint: ep.trim().replace(/\/+$/, ''), key: key.trim() };
    if (!cfg.endpoint || !cfg.key) { setMsg({ ok: false, t: 'Completa el punto de conexión y la clave.' }); return; }
    setBusy(true); setMsg(null);
    const err = await probarDocIntel(cfg);
    setBusy(false);
    if (err) { setMsg({ ok: false, t: err }); return; }
    setDocIntel(cfg); props.onClose(cfg);
  };
  return (
    <div className="di-back" role="dialog" aria-modal="true" aria-labelledby="di-t" onClick={e => { if (e.target === e.currentTarget) props.onClose(undefined); }}>
      <form className="di-dlg" onSubmit={e => { e.preventDefault(); void guardar(); }}>
        <h2 id="di-t">Lectura real de vouchers</h2>
        <p>Usa tu recurso de <b>Azure AI Document Intelligence</b> para leer tus vouchers de verdad. Lo encuentras en el portal de Azure › tu recurso › <b>Claves y punto de conexión</b>.</p>
        <label>Punto de conexión<input type="url" value={ep} onChange={e => setEp(e.target.value)} placeholder="https://<recurso>.cognitiveservices.azure.com" autoComplete="off" spellCheck={false} /></label>
        <label>Clave<input type="password" value={key} onChange={e => setKey(e.target.value)} placeholder="Clave 1 o Clave 2" autoComplete="off" /></label>
        {msg ? <div className={msg.ok ? 'di-ok' : 'di-err'} role="alert">{msg.t}</div> : null}
        <ul>
          <li>La clave se guarda <b>solo en este navegador</b>. No la uses en una computadora compartida.</li>
          <li>Tus vouchers van directo de tu navegador a tu recurso de Azure. Los registros de la demo siguen guardándose solo aquí.</li>
          <li>Cada lectura cuenta como una página en tu plan de Azure (el plan F0 es gratuito).</li>
        </ul>
        <div className="di-acts">
          {actual ? <button type="button" className="di-sec" onClick={() => { setDocIntel(null); props.onClose(null); }}>Volver a lectura simulada</button> : <span />}
          <span className="di-gap" />
          <button type="button" className="di-sec" onClick={() => props.onClose(undefined)}>Cancelar</button>
          <button type="submit" className="di-pri" disabled={busy}>{busy ? 'Comprobando…' : 'Comprobar y activar'}</button>
        </div>
      </form>
    </div>
  );
}

function Demo(): React.ReactElement {
  const initial = ((): Rol => { try { return (localStorage.getItem('gestion-abonos-demo-rol') as Rol) || 'vendedor'; } catch (e) { return 'vendedor'; } })();
  const [rol, setRol] = React.useState<Rol>(initial);
  const [gen, setGen] = React.useState(0);
  const [di, setDi] = React.useState<DocIntelCfg | null>(getDocIntel());
  const [diOpen, setDiOpen] = React.useState(false);
  const u = USERS[rol];
  const sp = React.useMemo(() => new MockSp(u.id, u.name, rol === 'gestion'), [rol, gen]);
  const ocr = React.useMemo(() => new MockOcr(ocrUrl), []);
  const change = (r: Rol): void => { setRol(r); try { localStorage.setItem('gestion-abonos-demo-rol', r); } catch (e) { /* nada */ } };
  return (
    <>
      <div className="demo-bar">
        <b>Modo demo</b>
        <span>Los datos se guardan solo en este navegador. {di ? 'Lectura real con Document Intelligence.' : ocrUrl ? `Lectura con la función: ${ocrUrl}` : 'La lectura del voucher es simulada.'}</span>
        <button type="button" className={di ? 'on' : ''} onClick={() => setDiOpen(true)}>{di ? '● Lectura real activa' : 'Lectura real'}</button>
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
        {diOpen ? <LecturaReal onClose={c => { setDiOpen(false); if (c !== undefined) setDi(c); }} /> : null}
        <App key={rol + gen} sp={sp as unknown as SpService} ocr={ocr as unknown as OcrService} userName={u.name} mappingError="" />
      </div>
    </>
  );
}

ReactDom.render(<Demo />, document.getElementById('app'));
