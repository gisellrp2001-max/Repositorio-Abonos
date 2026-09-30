/* Piezas de interfaz compartidas: iconos, estados, KPI, visor de voucher y diálogo de confirmación. */
import * as React from 'react';
import { Estado } from '../model';

const P: Record<string, string> = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
  plus: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
  add: '<path d="M12 5v14M5 12h14"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/>',
  camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  files: '<path d="M15 2H8a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z"/><path d="M15 2v5h5"/><path d="M4 7v13a2 2 0 0 0 2 2h9"/>',
  zin: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3M11 8v6M8 11h6"/>',
  zout: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3M8 11h6"/>',
  rot: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  exp: '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
  ext: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6M10 14 21 3"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  checkc: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/>',
  warn: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/>',
  minus: '<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  back: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  fwd: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  send: '<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/>',
  scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 12h10"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  sort: '<path d="m7 15 5 5 5-5M7 9l5-5 5 5"/>',
  cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'
};

export function Icon(props: { n: string; className?: string; style?: React.CSSProperties }): React.ReactElement {
  return <svg className={'i ' + (props.className || '')} style={props.style} viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: P[props.n] || '' }} />;
}

const CLS: Record<Estado, string> = { Enviado: 'env', Validado: 'val', Observado: 'obs' };
export const estadoCls = (e: Estado): string => CLS[e] || 'env';
export function Badge(props: { e: Estado; upper?: boolean; label?: string }): React.ReactElement {
  return <span className={`b b-${estadoCls(props.e)}`} style={props.upper ? { letterSpacing: '.05em' } : undefined}><i />{props.label || (props.upper ? props.e.toUpperCase() : props.e)}</span>;
}

const TONES: Record<string, React.CSSProperties> = {
  acc: { background: 'var(--accent-soft)', color: 'var(--accent)' },
  env: { background: 'var(--env-bg)', color: 'var(--env-fg)' },
  val: { background: 'var(--val-bg)', color: 'var(--val-fg)' },
  obs: { background: 'var(--obs-bg)', color: 'var(--obs-fg)' }
};
export function Kpi(props: { label: string; value: React.ReactNode; sub: React.ReactNode; icon: string; tone: string; mono?: boolean }): React.ReactElement {
  return (
    <div className="card kpi">
      <div className="kpi-h"><span>{props.label}</span><span className="kpi-ic" style={TONES[props.tone] || TONES.acc}><Icon n={props.icon} /></span></div>
      <div className={'kpi-v ' + (props.mono ? 'mono' : '')}>{props.value}</div>
      <div className="kpi-s">{props.sub}</div>
    </div>
  );
}

export function Empty(props: { icon: string; title: string; text: string; children?: React.ReactNode }): React.ReactElement {
  return (
    <div className="empty">
      <span className="empty-ic"><Icon n={props.icon} /></span>
      <b>{props.title}</b><span>{props.text}</span>{props.children}
    </div>
  );
}

export function Stepper(props: { idx: number }): React.ReactElement {
  const st = ['Cargar vouchers', 'Lectura OCR', 'Revisar', 'Confirmar'];
  const out: React.ReactElement[] = [];
  st.forEach((l, i) => {
    if (i) out.push(<li key={'l' + i} aria-hidden="true" className={'ln ' + (i <= props.idx ? 'done' : '')} />);
    out.push(
      <li key={i} className={i < props.idx ? 'done' : i === props.idx ? 'cur' : ''} aria-current={i === props.idx ? 'step' : undefined}>
        <span className="n">{i < props.idx ? <Icon n="check" /> : i + 1}</span><span className="lbltxt">{l}</span>
      </li>
    );
  });
  return <ol className="steps" aria-label="Pasos del registro">{out}</ol>;
}

/** Visor con zoom, giro, ampliación y enlace al archivo original. */
export function Viewer(props: { src: string | null; name?: string; orig?: string; title?: string; loading?: boolean }): React.ReactElement {
  const [zoom, setZoom] = React.useState(1);
  const [rot, setRot] = React.useState(0);
  const [full, setFull] = React.useState(false);
  const tf: React.CSSProperties = { transform: `scale(${zoom}) rotate(${rot}deg)` };
  React.useEffect(() => { setZoom(1); setRot(0); }, [props.src]);
  React.useEffect(() => {
    if (!full) return undefined;
    const k = (e: KeyboardEvent): void => { if (e.key === 'Escape') setFull(false); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [full]);
  const tools = (
    <>
      <button type="button" className="ib" onClick={() => setZoom(z => Math.max(0.5, +(z - 0.25).toFixed(2)))} aria-label="Alejar"><Icon n="zout" /></button>
      <span className="mono muted" style={{ fontSize: 12, width: 42, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
      <button type="button" className="ib" onClick={() => setZoom(z => Math.min(3, +(z + 0.25).toFixed(2)))} aria-label="Acercar"><Icon n="zin" /></button>
      <button type="button" className="ib" onClick={() => setRot(r => (r + 90) % 360)} aria-label="Rotar"><Icon n="rot" /></button>
    </>
  );
  return (
    <section className="card viewer">
      <div className="v-bar">
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <b style={{ fontSize: 14 }}>{props.title || 'Voucher original'}</b>
          {props.name ? <span className="mono muted" style={{ fontSize: 11.5, overflowWrap: 'anywhere' }}>{props.name}</span> : null}
        </div>
        <div className="v-tools">
          {tools}
          <button type="button" className="ib" onClick={() => setFull(true)} aria-label="Ampliar" disabled={!props.src}><Icon n="exp" /></button>
          {props.orig ? <a className="ib" href={props.orig} target="_blank" rel="noopener noreferrer" aria-label="Abrir o descargar el archivo original"><Icon n="ext" /></a> : null}
        </div>
      </div>
      <div className="v-stage">
        {props.src ? <img src={props.src} alt="Voucher" style={tf} /> : <div className="v-none">{props.loading ? <span className="spin" /> : 'Voucher no disponible'}</div>}
      </div>
      {full && props.src ? (
        <div className="modal full" role="dialog" aria-label="Voucher ampliado">
          <div className="modal-bar">{tools}<button type="button" className="ib" onClick={() => setFull(false)} aria-label="Cerrar"><Icon n="x" /></button></div>
          <div className="v-stage"><img src={props.src} alt="Voucher ampliado" style={tf} /></div>
        </div>
      ) : null}
    </section>
  );
}

export interface ConfirmOpts {
  title: string;
  tone: 'ok' | 'bad' | 'neutral';
  icon: string;
  lines: Array<[string, React.ReactNode]>;
  text?: string;
  confirm: string;
  onConfirm: () => Promise<void>;
}

/** Ventana de confirmación previa a un cambio de estado. */
export function ConfirmDialog(props: { opts: ConfirmOpts | null; onClose: () => void }): React.ReactElement | null {
  const [busy, setBusy] = React.useState(false);
  const o = props.opts;
  React.useEffect(() => {
    if (!o) return undefined;
    setBusy(false);
    const k = (e: KeyboardEvent): void => { if (e.key === 'Escape' && !busy) props.onClose(); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [o]);
  if (!o) return null;
  const run = async (): Promise<void> => {
    setBusy(true);
    try { await o.onConfirm(); props.onClose(); } catch (e) { setBusy(false); }
  };
  const tone = o.tone === 'ok' ? { background: 'var(--val-bg)', color: 'var(--val-fg)' } : o.tone === 'bad' ? { background: 'var(--obs-bg)', color: 'var(--obs-fg)' } : { background: 'var(--accent-soft)', color: 'var(--accent)' };
  return (
    <div className="modal" role="presentation" onClick={e => { if (e.target === e.currentTarget && !busy) props.onClose(); }}>
      <div className="dlg" role="alertdialog" aria-modal="true" aria-labelledby="ga-dlg-t">
        <div className="dlg-h">
          <span className="a-ic" style={tone}><Icon n={o.icon} /></span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <h2 className="h2" id="ga-dlg-t" style={{ fontSize: 17 }}>{o.title}</h2>
            {o.text ? <span className="muted" style={{ fontSize: 13.5 }}>{o.text}</span> : null}
          </div>
        </div>
        <div className="dlg-b"><dl>{o.lines.map(([k, v], i) => <React.Fragment key={i}><dt>{k}</dt><dd>{v}</dd></React.Fragment>)}</dl></div>
        <div className="dlg-f">
          <button type="button" className="btn btn-s" onClick={props.onClose} disabled={busy}>Cancelar</button>
          <button type="button" autoFocus className={'btn ' + (o.tone === 'ok' ? 'btn-ok' : o.tone === 'bad' ? 'btn-bad-solid' : 'btn-p')} onClick={() => { void run(); }} disabled={busy}>
            {busy ? <span className="spin" /> : null}{o.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}

export function BarChart(props: { labels: string[]; vals: number[]; money?: boolean }): React.ReactElement {
  const { labels, vals } = props;
  const W = 560, H = 230, L = 50, T = 26, B = 196;
  const max = Math.max(0, ...vals);
  const p = max <= 0 ? 1 : Math.pow(10, Math.floor(Math.log10(max)));
  const nice = max <= 0 ? 1 : p * ([1, 2, 2.5, 5, 10].filter(m => m * p >= max)[0] || 10);
  const bw = (W - L - 10) / labels.length;
  const y = (v: number): number => B - (v / nice) * (B - T);
  const fmt = (v: number): string => props.money ? (v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 0 : 1) + 'k' : String(Math.round(v))) : String(Math.round(v * 10) / 10);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={labels.map((l, i) => l + ': ' + vals[i]).join(', ')}>
      {[0, 0.5, 1].map(f => (
        <g key={f}><line className="gl" x1={L} x2={W} y1={y(nice * f)} y2={y(nice * f)} /><text x={L - 8} y={y(nice * f) + 4} textAnchor="end" fontSize="11">{fmt(nice * f)}</text></g>
      ))}
      <line className="ax" x1={L} x2={W} y1={B} y2={B} />
      {vals.map((v, i) => {
        const x = L + i * bw + bw * 0.2, w = bw * 0.6, top = y(v);
        return (
          <g key={i}>
            <rect className={'bar ' + (i === vals.length - 1 ? 'last' : '')} x={x} y={top} width={w} height={Math.max(0, B - top)} rx="4" />
            {v ? <text className="val" x={x + w / 2} y={top - 7} textAnchor="middle">{fmt(v)}</text> : null}
            <text x={x + w / 2} y={B + 20} textAnchor="middle" fontSize="12">{labels[i]}</text>
          </g>
        );
      })}
    </svg>
  );
}
