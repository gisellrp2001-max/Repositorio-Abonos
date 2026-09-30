/* Contenedor principal: carga de datos, navegación, lectura OCR en cola y avisos. */
import * as React from 'react';
import styles from './GestionAbonos.module.scss';
import { Abono, Cliente, scoreCliente, emptyForm } from '../model';
import { SpService, Diagnostics } from '../services/SpService';
import { OcrService } from '../services/OcrService';
import { AppCtx, Ctx, Flow, Item, View } from './ctx';
import { Icon, ConfirmDialog, ConfirmOpts } from './ui';
import { VInicio, VGInicio } from './views/Inicio';
import { VNuevo } from './views/Nuevo';
import { VLista } from './views/Lista';
import { VDetalle } from './views/Detalle';
import { VClientes, VCliente } from './views/Clientes';
import { VReportes } from './views/Reportes';
import { VConfig } from './views/Config';

export interface AppProps { sp: SpService; ocr: OcrService; userName: string; mappingError: string; }

export const newFlow = (): Flow => ({ stage: 'carga', items: [], active: null });
const MAX_PARALLEL = 2;

export default function App(props: AppProps): React.ReactElement {
  const { sp, ocr } = props;
  const [abonos, setAbonos] = React.useState<Abono[]>([]);
  const [clientes, setClientes] = React.useState<Cliente[]>([]);
  const [diag, setDiag] = React.useState<Diagnostics | null>(null);
  const [isG, setIsG] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [fatal, setFatal] = React.useState('');
  const [view, setView] = React.useState<View>('inicio');
  const [param, setParam] = React.useState<string | null>(null);
  const [toastMsg, setToastMsg] = React.useState('');
  const [confirmOpts, setConfirmOpts] = React.useState<ConfirmOpts | null>(null);
  const [flow, setFlow] = React.useState<Flow>(newFlow());
  const [tick, setTick] = React.useState(0);
  const toastT = React.useRef<number>(0);
  const clientesRef = React.useRef<Cliente[]>([]);
  clientesRef.current = clientes;
  const rootRef = React.useRef<HTMLDivElement>(null);
  const isAdmin = sp.isSiteAdmin;

  const toast = React.useCallback((m: string) => {
    setToastMsg(m);
    window.clearTimeout(toastT.current);
    toastT.current = window.setTimeout(() => setToastMsg(''), 4000);
  }, []);

  const refresh = React.useCallback(async (): Promise<void> => {
    const [a, c] = await Promise.all([sp.loadAbonos().catch(() => null), sp.loadClientes().catch(() => null)]);
    if (a) setAbonos(a);
    if (c) setClientes(c);
  }, [sp]);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const d = await sp.init();
        if (!alive) return;
        setDiag(d);
        setIsG(await sp.isGestion());
        await refresh();
      } catch (e) {
        setFatal((e as Error).message || 'No se pudo cargar la información.');
      }
      if (alive) setLoading(false);
    })().catch(() => undefined);
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 60000);
    return () => { alive = false; window.clearInterval(t); };
  }, [sp]);

  const go = React.useCallback((v: View, p?: string | null) => {
    setView(v); setParam(p === undefined ? null : p);
    if (rootRef.current) rootRef.current.scrollIntoView({ block: 'start', behavior: 'auto' });
  }, []);

  /* ---------- Cola de lectura OCR ---------- */
  const upd = (key: string, patch: (i: Item) => Partial<Item>): void =>
    setFlow(f => ({ ...f, items: f.items.map(i => (i.key === key ? { ...i, ...patch(i) } : i)) }));

  const autoCliente = (ordenante: string): { clienteId: number | null; cliSug: boolean } => {
    if (!ordenante) return { clienteId: null, cliSug: false };
    const best = clientesRef.current.map(c => ({ c, s: scoreCliente(c, ordenante) })).sort((a, b) => b.s - a.s)[0];
    return best && best.s >= 0.67 ? { clienteId: best.c.id, cliSug: true } : { clienteId: null, cliSug: false };
  };

  const analyze = async (it: Item): Promise<void> => {
    if (!ocr.enabled || !it.jpg) {
      upd(it.key, () => ({ status: 'revisar', manual: true, ocr: null, conf: {}, note: ocr.enabled ? '' : 'La lectura automática no está configurada. Completa los datos a mano.' }));
      return;
    }
    upd(it.key, () => ({ status: 'analizando', anStart: Date.now() }));
    try {
      const r = await ocr.read(it.jpg);
      const cli = autoCliente(r.form.ordenante);
      upd(it.key, i => ({ status: 'revisar', ocr: r.ocr, conf: r.conf, form: r.form, note: r.note, manual: false, clienteId: i.clienteId || cli.clienteId, cliSug: i.clienteId ? i.cliSug : cli.cliSug }));
    } catch (e) {
      upd(it.key, () => ({ status: 'revisar', manual: true, ocr: null, conf: {}, form: emptyForm(), note: ((e as Error).message || 'La lectura automática falló.') + ' Completa los datos a mano.' }));
    }
  };

  React.useEffect(() => {
    if (flow.stage !== 'lote') return;
    const running = flow.items.filter(i => i.status === 'analizando').length;
    const next = flow.items.filter(i => i.status === 'pendiente').slice(0, Math.max(0, MAX_PARALLEL - running));
    next.forEach(i => { void analyze(i); });
  }, [flow]);

  const anyAnalyzing = flow.items.some(i => i.status === 'analizando');
  React.useEffect(() => {
    if (!anyAnalyzing) return undefined;
    const t = window.setInterval(() => setTick(x => x + 1), 1000);
    return () => window.clearInterval(t);
  }, [anyAnalyzing]);

  const ctx: Ctx = {
    sp, ocr, abonos, clientes, isG, isAdmin, meId: sp.userId, meName: props.userName, diag, loading, view, param,
    go, refresh, toast, confirm: (o: ConfirmOpts) => setConfirmOpts(o), flow, setFlow, tick
  };

  const pend = abonos.filter(a => a.estado === 'Enviado').length;
  const obsMine = abonos.filter(a => a.estado === 'Observado' && a.authorId === sp.userId).length;
  const items: Array<[View, string, string, number?]> = [['inicio', 'Inicio', 'home'], ['nuevo', 'Nuevo abono', 'plus'], ['mis', 'Mis abonos', 'list'], ['clientes', 'Clientes', 'users']];
  const gItems: Array<[View, string, string, number?]> = isG ? [['bandeja', 'Gestión de abonos', 'inbox', pend], ['reportes', 'Reportes', 'chart']] : [];
  if (isAdmin || (diag && !diag.ok)) gItems.push(['config', 'Configuración', 'gear']);
  const isOn = (v: View): boolean => {
    const map: Partial<Record<View, View>> = { detalle: isG ? 'bandeja' : 'mis', cliente: 'clientes' };
    return (map[view] || view) === v;
  };
  const nb = ([v, l, i, c]: [View, string, string, number?]): React.ReactElement => (
    <button type="button" key={v} className={isOn(v) ? 'on' : ''} onClick={() => go(v)} aria-current={isOn(v) ? 'page' : undefined}>
      <Icon n={i} />{l}{c ? <span className="count">{c}</span> : null}
    </button>
  );
  const bn: Array<[View | 'FAB', string, string]> = isG
    ? [['inicio', 'Inicio', 'home'], ['bandeja', 'Bandeja', 'inbox'], ['FAB', '', ''], ['clientes', 'Clientes', 'users'], ['reportes', 'Reportes', 'chart']]
    : [['inicio', 'Inicio', 'home'], ['mis', 'Mis abonos', 'list'], ['FAB', '', ''], ['clientes', 'Clientes', 'users']];

  const titles: Record<View, string> = { inicio: 'Inicio', nuevo: 'Nuevo abono', mis: 'Mis abonos', bandeja: 'Gestión de abonos', detalle: isG ? 'Gestión de abonos' : 'Mis abonos', clientes: 'Clientes', cliente: 'Clientes', reportes: 'Reportes', config: 'Configuración' };
  const initials = props.userName.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();

  let body: React.ReactNode;
  if (loading) body = <div className="card"><div className="empty"><span className="spin" /><b>Cargando…</b></div></div>;
  else if (fatal) body = <div className="alert obs"><span className="a-ic"><Icon n="alert" /></span><p>{fatal}</p></div>;
  else {
    switch (view) {
      case 'inicio': body = isG ? <VGInicio /> : <VInicio />; break;
      case 'nuevo': body = <VNuevo />; break;
      case 'mis': body = <VLista bandeja={false} />; break;
      case 'bandeja': body = isG ? <VLista bandeja={true} /> : <VLista bandeja={false} />; break;
      case 'detalle': body = <VDetalle />; break;
      case 'clientes': body = <VClientes />; break;
      case 'cliente': body = <VCliente />; break;
      case 'reportes': body = isG ? <VReportes /> : <VInicio />; break;
      case 'config': body = <VConfig mappingError={props.mappingError} />; break;
      default: body = <VInicio />;
    }
  }
  const dia = new Date().toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <AppCtx.Provider value={ctx}>
      <div className={styles.root} ref={rootRef}>
        <div className="ga">
          <aside className="side">
            <div className="brand"><span className="mark">GA</span><span><b>Gestión de Abonos</b><small>Registro y validación</small></span></div>
            <nav className="nav" aria-label="Gestión de Abonos">
              {items.map(nb)}
              {gItems.length ? <><span className="sec">Gestión</span>{gItems.map(nb)}</> : null}
            </nav>
            <div className="side-foot"><b><Icon n="camera" />Desde el celular</b>Toma fotos de los vouchers y la app completa los datos por ti.</div>
          </aside>
          <div className="main">
            <header className="top">
              <div className="m-brand"><span className="mark" style={{ width: 30, height: 30, fontSize: 12 }}>GA</span>Gestión de Abonos</div>
              <div className="crumb">
                {view === 'detalle' ? <><span>{titles[view]}</span><span>/</span><b className="mono">{param}</b></> : <><b>{titles[view]}</b><span>·</span><span>{dia.charAt(0).toUpperCase() + dia.slice(1)}</span></>}
              </div>
              <div className="top-r">
                <button type="button" className="ib" onClick={() => { void refresh().then(() => toast('Datos actualizados')); }} aria-label="Actualizar datos"><Icon n="refresh" /></button>
                <div className="who">
                  <span className="av" aria-hidden="true">{initials}</span>
                  <span className="who-t"><b>{props.userName}</b><span>{isG ? 'Gestión y Administración' : 'Vendedor'}{obsMine ? ` · ${obsMine} observado${obsMine > 1 ? 's' : ''}` : ''}</span></span>
                </div>
              </div>
            </header>
            <main className="content">{body}</main>
            <nav className="bnav" aria-label="Navegación" style={{ gridTemplateColumns: `repeat(${bn.length}, minmax(0, 1fr))` }}>
              {bn.map(([v, l, i]) => v === 'FAB'
                ? <button type="button" key="fab" className="fab" onClick={() => go('nuevo')} aria-label="Registrar abonos con foto"><Icon n="camera" style={{ width: 24, height: 24 }} /></button>
                : <button type="button" key={v} className={isOn(v) ? 'on' : ''} onClick={() => go(v)}><Icon n={i} />{l}</button>)}
            </nav>
          </div>
        </div>
        <ConfirmDialog opts={confirmOpts} onClose={() => setConfirmOpts(null)} />
        {toastMsg ? <div className="toast" role="status">{toastMsg}</div> : null}
      </div>
    </AppCtx.Provider>
  );
}
