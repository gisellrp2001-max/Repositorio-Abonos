/* Registro de abonos por lote: cada voucher adjunto se lee, se revisa y se registra como un abono independiente. */
import * as React from 'react';
import {
  BANCOS, FIELDS, OCR_MSGS, REQUIRED, Extra, FieldKey, parseAmount, fmtNum, money, fmtDate, showVal, computeOrigen,
  dupCandidates, initials, norm, digits, scoreCliente, emptyForm, sameVal
} from '../../model';
import { prepareFile } from '../../services/OcrService';
import { useApp, Item, Flow } from '../ctx';
import { Badge, Icon, Stepper, Viewer } from '../ui';

const MAX_FILES = 20;
let seq = 0;

function newItem(file: File): Item {
  seq += 1;
  return {
    key: 'v' + Date.now() + '_' + seq, file, name: file.name || 'voucher.jpg', size: file.size, isPdf: /pdf$/i.test(file.type) || /\.pdf$/i.test(file.name),
    jpg: null, preview: '', status: 'preparando', err: '', anStart: 0, ocr: null, conf: {}, form: emptyForm(), note: '', manual: false,
    clienteId: null, cliSug: false, cq: '', revOk: false, dupOk: false, missing: [], start: Date.now()
  };
}

const STATUS_TXT: Record<string, [string, string]> = {
  preparando: ['Preparando', 'b-neu'], pendiente: ['En cola', 'b-neu'], analizando: ['Leyendo…', 'b-env'], revisar: ['Por revisar', 'b-env'],
  confirmar: ['Por confirmar', 'b-env'], registrando: ['Registrando…', 'b-env'], registrado: ['Registrado', 'b-val'], error: ['Error', 'b-obs']
};

export function VNuevo(): React.ReactElement {
  const { flow } = useApp();
  return flow.stage === 'carga' ? <Carga /> : <Lote />;
}

/* ---------- Paso 1: carga de uno o varios vouchers ---------- */
function Carga(): React.ReactElement {
  const { flow, setFlow, go, ocr, toast } = useApp();
  const [over, setOver] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const camRef = React.useRef<HTMLInputElement>(null);
  const upd = (key: string, p: Partial<Item>): void => setFlow(f => ({ ...f, items: f.items.map(i => (i.key === key ? { ...i, ...p } : i)) }));

  const addFiles = (list: FileList | File[] | null): void => {
    if (!list) return;
    const arr = Array.from(list);
    const bad = arr.filter(f => !(/^image\//.test(f.type) || f.type === 'application/pdf' || /\.pdf$/i.test(f.name)));
    const okFiles = arr.filter(f => bad.indexOf(f) < 0 && f.size <= 20 * 1048576);
    const room = MAX_FILES - flow.items.length;
    const take = okFiles.slice(0, Math.max(0, room));
    if (bad.length) toast(`${bad.length} archivo(s) no son imagen ni PDF y se omitieron.`);
    else if (okFiles.length > take.length) toast(`Puedes cargar hasta ${MAX_FILES} vouchers por lote.`);
    const items = take.map(newItem);
    setFlow(f => ({ ...f, items: f.items.concat(items) }));
    items.forEach(it => {
      prepareFile(it.file)
        .then(p => upd(it.key, { jpg: p.jpg, preview: p.preview, isPdf: p.isPdf, status: 'pendiente' }))
        .catch(() => upd(it.key, { status: 'error', err: it.isPdf ? 'No se pudo abrir el PDF.' : 'No se pudo abrir la imagen (si es HEIC, conviértela a JPG).' }));
    });
  };
  const ready = flow.items.filter(i => i.status === 'pendiente');
  const preparing = flow.items.some(i => i.status === 'preparando');
  const remove = (key: string): void => setFlow(f => ({ ...f, items: f.items.filter(i => i.key !== key || i.status === 'registrado') }));
  const start = (manual: boolean): void => {
    setFlow((f: Flow) => {
      const items = f.items.filter(i => i.status !== 'error').map(i => (manual && i.status === 'pendiente' ? { ...i, status: 'revisar' as const, manual: true } : i));
      const first = items.filter(i => i.status === 'pendiente' || i.status === 'revisar')[0] || items[0];
      return { stage: 'lote', items, active: first ? first.key : null };
    });
  };

  return (
    <>
      <Stepper idx={0} />
      <section className="card" style={{ maxWidth: 900, width: '100%', margin: '0 auto', padding: '32px 36px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div className="between" style={{ alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <h1 className="h1" style={{ fontSize: 24 }}>Registra nuevos abonos</h1>
            <p style={{ margin: 0, fontSize: 15 }} className="muted">Sube uno o varios vouchers y nosotros completaremos la información por ti. Cada voucher se registra como un abono separado.</p>
          </div>
          <span className="chip"><Icon n="clock" />Menos de un minuto por voucher</span>
        </div>
        <div className={'drop ' + (over ? 'over' : '')}
          onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
          onDrop={e => { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files); }}>
          <span className="drop-ic"><Icon n="upload" /></span>
          <b style={{ fontSize: 18 }}>Arrastra tus vouchers aquí</b>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button type="button" className="btn btn-s" onClick={() => fileRef.current && fileRef.current.click()}><Icon n="files" />Seleccionar archivos</button>
            <span className="muted">o</span>
            <button type="button" className="btn btn-s" onClick={() => camRef.current && camRef.current.click()}><Icon n="camera" />Tomar foto</button>
          </div>
          <span className="muted" style={{ fontSize: 12.5 }}>JPG, PNG o PDF · hasta {MAX_FILES} archivos por lote · también fotos desde el celular</span>
          <input ref={fileRef} type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" hidden onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
          <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
        </div>
        {flow.items.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="between"><b>{flow.items.length} voucher{flow.items.length > 1 ? 's' : ''} cargado{flow.items.length > 1 ? 's' : ''}</b><button type="button" className="btn btn-g btn-sm" onClick={() => setFlow({ stage: 'carga', items: [], active: null })}>Quitar todos</button></div>
            {flow.items.map((it, n) => (
              <div className="filerow" key={it.key}>
                {it.preview ? <img className="thumb" src={it.preview} alt={`Vista previa del voucher ${n + 1}`} /> : <span className="thumb" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{it.status === 'preparando' ? <span className="spin" /> : <Icon n="file" />}</span>}
                <div style={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span className="mono" style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{it.name}</span>
                  <span className="muted" style={{ fontSize: 12.5 }}>{(it.size / 1048576).toFixed(1)} MB · {it.isPdf ? 'PDF (se lee la primera página)' : 'Imagen'}</span>
                  {it.status === 'error' ? <span className="cf cf-no"><Icon n="alert" />{it.err}</span> : it.status === 'pendiente' ? <span className="cf cf-hi"><Icon n="check" />Listo para analizar</span> : <span className={'b ' + STATUS_TXT[it.status][1]} style={{ alignSelf: 'flex-start' }}><i />{it.code ? it.code + ' · ' : ''}{STATUS_TXT[it.status][0]}</span>}
                </div>
                {it.status !== 'registrado' && it.status !== 'registrando' ? <button type="button" className="ib" onClick={() => remove(it.key)} aria-label={`Quitar ${it.name}`}><Icon n="x" /></button> : null}
              </div>
            ))}
          </div>
        ) : null}
        <div className="row muted" style={{ fontSize: 13.5 }}><Icon n="info" />Procura que cada voucher sea legible y que los datos principales sean visibles.</div>
        <div className="between actbar" style={{ paddingTop: 16, borderTop: '1px solid var(--line-2)' }}>
          {flow.items.some(i => i.status !== 'pendiente' && i.status !== 'preparando' && i.status !== 'error')
            ? <button type="button" className="btn btn-g" onClick={() => setFlow(f => ({ ...f, stage: 'lote' }))}><Icon n="back" />Volver al lote</button>
            : <button type="button" className="btn btn-g" onClick={() => go('inicio')}>Cancelar</button>}
          <div className="row">
            {ready.length ? <button type="button" className="btn btn-g" onClick={() => start(true)} disabled={preparing}>Llenar a mano</button> : null}
            <button type="button" className="btn btn-p btn-lg" disabled={!ready.length || preparing} onClick={() => start(!ocr.enabled)}>
              <Icon n="scan" />{ready.length > 1 ? `Analizar ${ready.length} vouchers` : 'Analizar voucher'}
            </button>
          </div>
        </div>
      </section>
    </>
  );
}

/* ---------- Pasos 2 a 4: lectura, revisión y confirmación por voucher ---------- */
function Lote(): React.ReactElement {
  const { flow, setFlow, go } = useApp();
  const items = flow.items;
  const act = items.filter(i => i.key === flow.active)[0] || items[0];
  const done = items.filter(i => i.status === 'registrado');
  const allDone = items.length > 0 && done.length === items.length;
  const setActive = (key: string): void => setFlow(f => ({ ...f, active: key }));
  const stepIdx = !act ? 0 : act.status === 'analizando' || act.status === 'pendiente' ? 1 : act.status === 'revisar' ? 2 : act.status === 'registrado' ? 4 : 3;

  if (allDone) {
    return (
      <>
        <Stepper idx={4} />
        <section className="card" style={{ maxWidth: 720, width: '100%', margin: '0 auto', padding: 36, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, textAlign: 'center' }}>
          <span style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--val-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ width: 50, height: 50, borderRadius: '50%', background: 'var(--ok)', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon n="check" style={{ width: 26, height: 26, strokeWidth: 2.8 }} /></span>
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h1 className="h1">{done.length > 1 ? `${done.length} abonos registrados correctamente` : 'Abono registrado correctamente'}</h1>
            <p className="muted" style={{ margin: 0, fontSize: 15 }}>{done.length > 1 ? 'Los registros fueron enviados' : 'El registro fue enviado'} al equipo de Gestión para su validación.</p>
          </div>
          <div className="card" style={{ width: '100%', textAlign: 'left', overflow: 'hidden' }}>
            {done.map(i => {
              return (
                <div key={i.key} className="between" style={{ padding: '12px 16px', borderBottom: '1px solid var(--line-2)' }}>
                  <span className="row"><b className="mono" style={{ color: 'var(--accent-ink)' }}>{i.code}</b><Badge e="Enviado" upper /></span>
                  <span className="row" style={{ fontSize: 13 }}><span className="mono">{money(parseAmount(i.form.importe), i.form.moneda)}</span><button type="button" className="btn btn-g btn-sm" onClick={() => go('detalle', i.code || null)}>Ver detalle</button></span>
                </div>
              );
            })}
          </div>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button type="button" className="btn btn-g btn-lg" onClick={() => { setFlow({ stage: 'carga', items: [], active: null }); go('mis'); }}>Ir a Mis abonos</button>
            <button type="button" className="btn btn-p btn-lg" onClick={() => setFlow({ stage: 'carga', items: [], active: null })}><Icon n="add" />Registrar más abonos</button>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <Stepper idx={stepIdx} />
      <div className={'lote-grid ' + (items.length > 1 ? 'multi' : '')}>
        {items.length > 1 ? (
          <aside className="card lote-q" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="between" style={{ padding: '2px 4px' }}><b style={{ fontSize: 13.5 }}>Lote</b><span className="muted mono" style={{ fontSize: 12 }}>{done.length}/{items.length}</span></div>
            <div className="progress"><div style={{ width: Math.round(done.length * 100 / items.length) + '%' }} /></div>
            <div className="queue">
              {items.map((i, n) => (
                <button type="button" key={i.key} className={'qitem ' + (act && act.key === i.key ? 'on' : '')} onClick={() => setActive(i.key)} aria-current={act && act.key === i.key ? 'true' : undefined}>
                  {i.preview ? <img src={i.preview} alt="" /> : <span className="spin" />}
                  <span className="qt"><b>{i.code || `Voucher ${n + 1}`}</b><span className={'b ' + STATUS_TXT[i.status][1]} style={{ alignSelf: 'flex-start', padding: '1px 8px 1px 6px', fontSize: 11 }}><i />{STATUS_TXT[i.status][0]}</span></span>
                </button>
              ))}
            </div>
            <button type="button" className="btn btn-g btn-sm" onClick={() => setFlow(f => ({ ...f, stage: 'carga' }))} disabled={items.some(i => i.status === 'analizando' || i.status === 'registrando')}><Icon n="add" />Agregar vouchers</button>
          </aside>
        ) : null}
        <div className="stack">{act ? <ItemPanel it={act} /> : null}</div>
      </div>
    </>
  );
}

function nextKey(items: Item[], from: string): string | null {
  const idx = items.map(i => i.key).indexOf(from);
  const order = items.slice(idx + 1).concat(items.slice(0, idx));
  const n = order.filter(i => i.status === 'revisar' || i.status === 'confirmar')[0] || order.filter(i => i.status === 'analizando' || i.status === 'pendiente')[0];
  return n ? n.key : null;
}

function ItemPanel(props: { it: Item }): React.ReactElement {
  const app = useApp();
  const { setFlow, tick } = app;
  const it = props.it;
  const upd = (p: (i: Item) => Partial<Item>): void => setFlow(f => ({ ...f, items: f.items.map(i => (i.key === it.key ? { ...i, ...p(i) } : i)) }));
  const discard = (): void => setFlow(f => {
    const items = f.items.filter(i => i.key !== it.key);
    return items.length ? { ...f, items, active: nextKey(f.items, it.key) || items[0].key } : { stage: 'carga', items: [], active: null };
  });

  if (it.status === 'pendiente' || it.status === 'analizando' || it.status === 'preparando') {
    const idx = it.status === 'analizando' ? Math.min(4, Math.floor((Date.now() - it.anStart) / 3000)) : -1;
    void tick;
    return (
      <section className="card" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', overflow: 'hidden' }}>
        <div style={{ background: 'var(--line-2)', padding: 26, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {it.preview ? <span className="scanwrap"><img src={it.preview} alt="Voucher en análisis" style={{ maxHeight: 400, display: 'block' }} />{it.status === 'analizando' ? <span className="scanline" /> : null}</span> : <span className="spin" />}
        </div>
        <div style={{ padding: 30, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="chip" style={{ alignSelf: 'flex-start' }}><Icon n="scan" />Asistente OCR</span>
            <h1 className="h1" style={{ fontSize: 23 }} aria-live="polite">{it.status === 'analizando' ? 'Analizando voucher…' : 'En cola para lectura'}</h1>
            <p className="muted" style={{ margin: 0 }}>{it.status === 'analizando' ? 'Estamos leyendo el voucher por ti. Mientras tanto puedes revisar los que ya están listos.' : 'Se leerá en cuanto termine el voucher anterior.'}</p>
          </div>
          <div className="progress"><div style={{ width: (it.status === 'analizando' ? Math.min(92, 10 + idx * 18) : 3) + '%' }} /></div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, border: '1px solid var(--line-2)', borderRadius: 12 }}>
            {OCR_MSGS.map((m, k) => (
              <li key={k} style={{ display: 'flex', alignItems: 'center', gap: 12, height: 44, padding: '0 16px', borderBottom: k < 4 ? '1px solid var(--line-2)' : 0, fontWeight: k === idx ? 700 : 500, color: k > idx ? 'var(--muted)' : 'var(--fg)' }}>
                {k < idx ? <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--val-bg)', color: 'var(--val-fg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon n="check" style={{ width: 12, height: 12, strokeWidth: 3 }} /></span>
                  : k === idx ? <span className="spin" /> : <span style={{ width: 20, display: 'flex', justifyContent: 'center' }}><span className="dotc" style={{ background: 'var(--line)', width: 8, height: 8 }} /></span>}
                {m}
              </li>
            ))}
          </ul>
          <span className="mono muted" style={{ fontSize: 12, overflowWrap: 'anywhere' }}>{it.name}</span>
        </div>
      </section>
    );
  }
  if (it.status === 'registrado') {
    const nk = nextKey(app.flow.items, it.key);
    return (
      <section className="card" style={{ padding: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center' }}>
        <span style={{ width: 60, height: 60, borderRadius: '50%', background: 'var(--ok)', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon n="check" style={{ width: 28, height: 28, strokeWidth: 2.8 }} /></span>
        <h2 className="h1" style={{ fontSize: 22 }}>Abono registrado correctamente</h2>
        <span className="mono" style={{ fontSize: 22, fontWeight: 600, color: 'var(--accent-ink)' }}>{it.code}</span>
        <Badge e="Enviado" upper />
        <p className="muted" style={{ margin: 0 }}>El registro fue enviado al equipo de Gestión para su validación.</p>
        {nk ? <button type="button" className="btn btn-p btn-lg" onClick={() => setFlow(f => ({ ...f, active: nk }))}>Siguiente voucher <Icon n="fwd" /></button> : null}
      </section>
    );
  }
  if (it.status === 'confirmar' || it.status === 'registrando') return <Confirmar it={it} upd={upd} discard={discard} />;
  return <Revisar it={it} upd={upd} discard={discard} />;
}

/* ---------- Revisión ---------- */
function Revisar(props: { it: Item; upd: (p: (i: Item) => Partial<Item>) => void; discard: () => void }): React.ReactElement {
  const { it, upd } = props;
  const { reread } = useApp();
  const fm = it.form;
  const setField = (k: FieldKey, v: string): void => upd(i => ({ form: { ...i.form, [k]: v }, missing: i.missing.filter(x => x !== k) }));
  const conf = (k: FieldKey): React.ReactNode => {
    if (it.manual && !it.ocr) return null;
    const c = it.conf[k];
    if (c === 'alta') return <span className="cf cf-hi"><Icon n="check" />Alta confianza</span>;
    if (c === 'media' || c === 'baja') return <span className="cf cf-md"><Icon n="warn" />Revisar</span>;
    return <span className="cf cf-no"><Icon n="minus" />No detectado</span>;
  };
  const cls = (k: FieldKey): string => {
    if (it.missing.indexOf(k) > -1) return 'miss';
    if (it.manual && !it.ocr) return '';
    const c = it.conf[k];
    if (!fm[k] && !c) return 'miss';
    return c === 'media' || c === 'baja' ? 'warn' : '';
  };
  const help = (k: FieldKey): React.ReactNode => {
    if (it.manual && !it.ocr) return null;
    const c = it.conf[k];
    if (!fm[k] && !c) return <span className="help bad">No se pudo leer. Complétalo tal como aparece en el voucher.</span>;
    if (c === 'media' || c === 'baja') return <span className="help warn">Compáralo con el voucher antes de continuar.</span>;
    return null;
  };
  const id = (k: string): string => `ga-${it.key}-${k}`;
  const txt = (k: FieldKey, mono?: boolean, extra?: React.InputHTMLAttributes<HTMLInputElement>): React.ReactElement =>
    <input id={id(k)} className={`inp ${mono ? 'mono' : ''} ${cls(k)}`} value={fm[k]} onChange={e => setField(k, e.target.value)} autoComplete="off" {...extra} />;
  const fld = (k: FieldKey, input: React.ReactElement, span?: boolean): React.ReactElement => (
    <div className={'field ' + (span ? 'span2' : '')} key={k}>
      <div className="field-h"><label className="lbl" htmlFor={id(k)}>{FIELDS.filter(f => f[0] === k)[0][1]}</label>{conf(k)}</div>
      {input}{help(k)}
    </div>
  );
  const vals = Object.keys(it.conf).map(k => it.conf[k]);
  const cnt = { a: vals.filter(c => c === 'alta').length, r: vals.filter(c => c === 'media' || c === 'baja').length };
  const toConfirm = (): void => {
    const miss: string[] = REQUIRED.filter(k => (k === 'importe' ? parseAmount(fm.importe) === null : !String(fm[k] || '').trim()));
    if (!it.clienteId) miss.push('cliente');
    if (miss.length) { upd(() => ({ missing: miss })); return; }
    upd(i => ({ status: 'confirmar', missing: [], revOk: false, dupOk: false, form: { ...i.form, importe: fmtNum(parseAmount(i.form.importe)) } }));
  };
  return (
    <div className="split">
      <Viewer src={it.preview || null} name={it.name} />
      <div className="stack">
        <section className="card pad" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div className="between" style={{ alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <h2 className="h2" style={{ fontSize: 18 }}>Datos detectados</h2>
              <span className="muted" style={{ fontSize: 13 }}>{it.ocr ? `Leímos ${cnt.a + cnt.r} de ${FIELDS.length} campos. Todos son editables antes de enviar.` : 'Completa los datos del voucher.'}</span>
            </div>
            {it.ocr ? (
              <div className="row" style={{ gap: 12 }}>
                <span className="cf cf-hi"><span className="dotc" style={{ background: 'var(--val-dot)' }} />{cnt.a} alta</span>
                <span className="cf cf-md"><span className="dotc" style={{ background: 'var(--env-dot)' }} />{cnt.r} revisar</span>
                <span className="cf cf-no"><span className="dotc" style={{ background: 'var(--obs-dot)' }} />{FIELDS.length - cnt.a - cnt.r} sin detectar</span>
              </div>
            ) : null}
          </div>
          {it.note ? (
            <div className="alert warn">
              <span className="a-ic"><Icon n="warn" /></span>
              <p style={{ fontSize: 13 }}>{it.note}</p>
              {it.readFail && it.jpg ? (
                <button type="button" className="btn btn-s btn-sm" style={{ marginLeft: 'auto', flex: 'none' }} onClick={() => reread(it.key)} disabled={!!it.rereading}>
                  {it.rereading ? <><span className="spin" />Leyendo…</> : <><Icon n="scan" />Volver a leer</>}
                </button>
              ) : null}
            </div>
          ) : null}
          <div className="grid2">
            {fld('banco', <><input id={id('banco')} className={'inp ' + cls('banco')} value={fm.banco} list={id('bancos')} onChange={e => setField('banco', e.target.value)} autoComplete="off" /><datalist id={id('bancos')}>{BANCOS.map(b => <option key={b} value={b} />)}</datalist></>)}
            {fld('moneda', <select id={id('moneda')} className={'inp ' + cls('moneda')} value={fm.moneda} onChange={e => setField('moneda', e.target.value)}><option value="PEN">Soles (PEN)</option><option value="USD">Dólares (USD)</option></select>)}
            {fld('fecha', txt('fecha', true, { type: 'date' }))}
            {fld('hora', txt('hora', true, { type: 'time' }))}
            {fld('operacion', txt('operacion', true))}
            {fld('importe', txt('importe', true, { inputMode: 'decimal', placeholder: '0.00', style: { fontSize: 16, fontWeight: 600 } }))}
            {fld('cuenta', txt('cuenta', true))}
            {fld('ordenante', txt('ordenante'))}
            {fld('referencia', txt('referencia', true), true)}
          </div>
        </section>
        <ClientePicker it={it} upd={upd} />
        <div className="card" style={{ padding: '14px 18px' }}>
          <div className="between actbar">
            <button type="button" className="btn btn-g" onClick={props.discard}><Icon n="x" />Descartar este voucher</button>
            <div className="row">
              {it.missing.length ? <span className="help bad" style={{ fontWeight: 600 }}>Completa: {it.missing.map(k => (k === 'cliente' ? 'Cliente' : FIELDS.filter(f => f[0] === k)[0][1])).join(', ')}</span> : null}
              <button type="button" className="btn btn-p btn-lg" onClick={toConfirm}>Continuar<Icon n="fwd" /></button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ClientePicker(props: { it: Item; upd: (p: (i: Item) => Partial<Item>) => void }): React.ReactElement {
  const { clientes, meId, sp, refresh, toast } = useApp();
  const { it, upd } = props;
  const [nc, setNc] = React.useState<{ razon: string; ruc: string; err: string; saving: boolean } | null>(null);
  const c = clientes.filter(x => x.id === it.clienteId)[0];
  if (c) {
    return (
      <section className="card pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="between"><h2 className="h2" style={{ fontSize: 18 }}>Cliente</h2>{it.cliSug ? <span className="chip"><Icon n="spark" />Sugerido por el ordenante</span> : null}</div>
        <div className="cli-card">
          <span className="cli-ini">{initials(c.razon)}</span>
          <div style={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span className="muted" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.1em' }}>CLIENTE</span>
            <b style={{ fontSize: 15 }}>{c.razon}</b>
            <span className="row" style={{ fontSize: 12.5, gap: 6 }}>RUC <span className="mono">{c.ruc}</span> · Vendedor: {c.vendedorName || '—'} · <span className={'b ' + (c.estado === 'Inactivo' ? 'b-obs' : 'b-val')} style={{ padding: '1px 8px 1px 6px', fontSize: 11.5 }}><i />{c.estado || 'Activo'}</span></span>
          </div>
          <button type="button" className="btn btn-s btn-sm" onClick={() => upd(() => ({ clienteId: null, cliSug: false }))}>Cambiar</button>
        </div>
      </section>
    );
  }
  const q = norm(it.cq);
  const sug = it.form.ordenante ? clientes.map(x => ({ x, s: scoreCliente(x, it.form.ordenante) })).filter(r => r.s >= 0.5).sort((a, b) => b.s - a.s).map(r => r.x).slice(0, 2) : [];
  const res = q
    ? clientes.filter(x => norm(x.razon).indexOf(q) > -1 || (!!digits(q) && digits(x.ruc).indexOf(digits(q)) > -1)).slice(0, 8)
    : clientes.filter(x => x.vendedorId === meId && sug.indexOf(x) < 0).slice(0, 6);
  const pick = (id: number, s: boolean): void => upd(i => ({ clienteId: id, cliSug: s, cq: '', missing: i.missing.filter(k => k !== 'cliente') }));
  const opt = (x: typeof clientes[0], s: boolean): React.ReactElement => (
    <button type="button" key={x.id} className="cli-opt" onClick={() => pick(x.id, s)}>
      <span className="cli-ini" style={{ width: 34, height: 34, fontSize: 12 }}>{initials(x.razon)}</span>
      <span style={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}><b style={{ fontSize: 13.5 }}>{x.razon}</b><span className="muted mono" style={{ fontSize: 12 }}>{x.ruc}</span></span>
      {s ? <span className="chip" style={{ height: 24, fontSize: 11.5 }}><Icon n="spark" />Coincide</span> : null}
    </button>
  );
  const save = async (): Promise<void> => {
    if (!nc) return;
    const razon = nc.razon.trim(); const ruc = digits(nc.ruc);
    if (razon.length < 3) { setNc({ ...nc, err: 'Escribe la razón social.' }); return; }
    if (ruc.length !== 11) { setNc({ ...nc, err: 'El RUC debe tener 11 dígitos.' }); return; }
    if (clientes.some(x => digits(x.ruc) === ruc)) { setNc({ ...nc, err: 'Ya existe un cliente con ese RUC.' }); return; }
    setNc({ ...nc, saving: true, err: '' });
    try {
      await sp.createCliente(razon, ruc);
      await refresh();
      const fresh = (await sp.loadClientes()).filter(x => digits(x.ruc) === ruc)[0];
      if (fresh) pick(fresh.id, false);
      setNc(null); toast('Cliente guardado');
    } catch (e) { setNc({ ...nc, saving: false, err: 'No se pudo guardar el cliente: ' + (e as Error).message }); }
  };
  return (
    <section className="card pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="between"><h2 className="h2" style={{ fontSize: 18 }}>Cliente</h2>{it.missing.indexOf('cliente') > -1 ? <span className="help bad" style={{ fontWeight: 600 }}>Selecciona un cliente</span> : null}</div>
      <label className="srch" style={{ height: 44 }}><Icon n="search" /><input type="search" placeholder="Buscar cliente por nombre o RUC" value={it.cq} onChange={e => { const v = e.target.value; upd(() => ({ cq: v })); }} aria-label="Buscar cliente por nombre o RUC" /></label>
      {!q && sug.length ? <><span className="lbl">Sugeridos por el voucher</span>{sug.map(x => opt(x, true))}</> : null}
      {res.length ? <>{!q ? <span className="lbl">Tus clientes</span> : null}{res.map(x => opt(x, false))}</> : q ? <p className="note" style={{ margin: 0 }}>No encontramos “{it.cq}”.</p> : !sug.length ? <p className="note" style={{ margin: 0 }}>Aún no tienes clientes asignados. Búscalo o créalo aquí mismo.</p> : null}
      {nc ? (
        <div style={{ border: '1px dashed var(--line)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <b style={{ fontSize: 13.5 }}>Nuevo cliente</b>
          <div className="grid2">
            <div className="field"><label className="lbl" htmlFor={`nc-r-${it.key}`}>Razón social</label><input id={`nc-r-${it.key}`} className="inp" value={nc.razon} onChange={e => setNc({ ...nc, razon: e.target.value })} autoComplete="off" /></div>
            <div className="field"><label className="lbl" htmlFor={`nc-u-${it.key}`}>RUC</label><input id={`nc-u-${it.key}`} className="inp mono" inputMode="numeric" maxLength={11} value={nc.ruc} onChange={e => setNc({ ...nc, ruc: e.target.value })} autoComplete="off" /></div>
          </div>
          {nc.err ? <span className="help bad">{nc.err}</span> : null}
          <div className="row"><button type="button" className="btn btn-p btn-sm" onClick={() => { void save(); }} disabled={nc.saving}>{nc.saving ? 'Guardando…' : 'Guardar cliente'}</button><button type="button" className="btn btn-g btn-sm" onClick={() => setNc(null)}>Cancelar</button></div>
        </div>
      ) : (
        <button type="button" className="btn btn-g btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setNc({ razon: /^\d+$/.test(it.cq) ? '' : it.cq, ruc: /^\d+$/.test(it.cq) ? it.cq : '', err: '', saving: false })}><Icon n="add" />Nuevo cliente</button>
      )}
    </section>
  );
}

/* ---------- Confirmación y registro ---------- */
function Confirmar(props: { it: Item; upd: (p: (i: Item) => Partial<Item>) => void; discard: () => void }): React.ReactElement {
  const { sp, clientes, abonos, flow, refresh, toast, go } = useApp();
  const { it, upd } = props;
  const fm = it.form; const imp = parseAmount(fm.importe);
  const c = clientes.filter(x => x.id === it.clienteId)[0];
  const dups = dupCandidates(abonos, fm, c ? c.ruc : null);
  const siblings = flow.items.filter(i => i.key !== it.key && i.status !== 'registrado' && sameVal('operacion', i.form.operacion, fm.operacion) && sameVal('banco', i.form.banco, fm.banco));
  const needDup = dups.length > 0 || siblings.length > 0;
  const saving = it.status === 'registrando';
  const ready = it.revOk && (!needDup || it.dupOk) && !saving;
  const orig = computeOrigen(fm, it.ocr);
  const changed = FIELDS.filter(([k]) => orig[k] === 'manual' || orig[k] === 'revisado');
  const lbl: Record<string, string> = { banco: 'Banco', operacion: 'N° de operación', fecha: 'Fecha', importe: 'Importe', cliente: 'Cliente' };

  const save = async (): Promise<void> => {
    if (!c) return;
    upd(() => ({ status: 'registrando' }));
    const now = Date.now();
    const extra: Extra = { ocr: it.ocr, origen: orig, cliSug: it.cliSug, dup: needDup ? dups.map(d => d.a.code) : null, segundos: Math.max(1, Math.round((now - it.start) / 1000)), voucherName: it.name };
    try {
      let id = it.savedId; let code = it.code;
      if (!id) {
        const r = await sp.createAbono({
          clienteRazon: c.razon, clienteRuc: c.ruc, banco: fm.banco.trim(), fecha: fm.fecha, hora: fm.hora, operacion: fm.operacion.trim(), importe: imp,
          moneda: fm.moneda, cuenta: fm.cuenta.trim(), ordenante: fm.ordenante.trim(), referencia: fm.referencia.trim(), estado: 'Enviado', fechaEstado: now, datosOcr: extra
        });
        id = r.id; code = r.code;
        const sid = id, scode = code;
        upd(() => ({ savedId: sid, code: scode }));
        const nOcr = it.ocr ? FIELDS.filter(([k]) => it.ocr && it.ocr[k].v !== null).length : 0;
        const manuales = FIELDS.filter(([k]) => orig[k] === 'manual').map(f => f[1].toLowerCase());
        const hs: Array<[string, string, string, string]> = [
          ['registro', '', '', it.name],
          ['ocr', '', '', it.ocr ? `${nOcr} de ${FIELDS.length} campos detectados${manuales.length ? ' · ingresado a mano: ' + manuales.join(', ') : ''}` : 'Sin lectura automática: datos ingresados a mano'],
          ['estado', '', 'Enviado', needDup ? 'El vendedor confirmó que no es duplicado' + (dups.length ? ' de ' + dups.map(d => d.a.code).join(', ') : '') : '']
        ];
        for (const h of hs) { try { await sp.addHist(sid, scode, h[0], h[1], h[2], h[3]); } catch (e) { /* el historial no bloquea el registro */ } }
      }
      const url = await sp.uploadVoucher(`${code}.jpg`, it.jpg as Blob);
      if (it.isPdf) { try { extra.pdfUrl = await sp.uploadVoucher(`${code}_original.pdf`, it.file); } catch (e) { /* se conserva la imagen */ } }
      await sp.updateAbono(id as number, { voucher: url, datosOcr: extra });
      upd(() => ({ status: 'registrado' }));
      void refresh();
    } catch (e) {
      upd(() => ({ status: 'confirmar' }));
      toast('No se pudo registrar: ' + ((e as Error).message || 'revisa tu conexión e inténtalo otra vez.'));
    }
  };

  return (
    <div className="split-r">
      <div className="stack">
        {needDup ? (
          <section className="alert warn" style={{ flexDirection: 'column', gap: 12 }}>
            <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap', gap: 12 }}>
              <span className="a-ic"><Icon n="warn" /></span>
              <div style={{ flexGrow: 1 }}><div className="ttl">Posible abono duplicado</div><p style={{ fontSize: 13.5 }}>Encontramos {dups.length + siblings.length === 1 ? 'un registro' : 'registros'} con información similar. No bloqueamos el envío, pero revísalo antes de continuar.</p></div>
            </div>
            {dups.map(({ a, m }) => (
              <div className="card" key={a.id} style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div className="between"><span className="row"><b className="mono" style={{ color: 'var(--accent)' }}>{a.code}</b><Badge e={a.estado} /></span>
                  <button type="button" className="btn btn-s btn-sm" onClick={() => go('detalle', a.code)}><Icon n="eye" />Ver registro existente</button></div>
                <div className="row" style={{ fontSize: 12.5, gap: 12 }}>{a.clienteRazon} · {a.banco} · {fmtDate(a.fecha)} · <span className="mono">{a.operacion}</span> · <span className="mono">{money(a.importe, a.moneda)}</span> · {a.authorName}</div>
                <div className="row" style={{ fontSize: 12.5, gap: 14 }}>
                  {Object.keys(m).map(k => <span key={k} className="row" style={{ gap: 4, color: m[k] ? 'var(--val-fg)' : 'var(--warn-fg)' }}><Icon n={m[k] ? 'check' : 'x'} style={{ width: 14, height: 14 }} />{m[k] ? 'Coincide' : 'Difiere'}: {lbl[k]}</span>)}
                </div>
              </div>
            ))}
            {siblings.length ? <p style={{ fontSize: 13 }}>Otro voucher de este mismo lote tiene el mismo banco y número de operación.</p> : null}
            <label className="chk" style={{ color: 'var(--fg)' }}><input type="checkbox" checked={it.dupOk} onChange={e => { const v = e.target.checked; upd(() => ({ dupOk: v })); }} />Confirmo que es un abono distinto.</label>
          </section>
        ) : null}
        <section className="card pad" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div><h1 className="h1" style={{ fontSize: 22 }}>Revisa antes de enviar</h1><span className="muted" style={{ fontSize: 13.5 }}>Este resumen es lo que recibirá el equipo de Gestión.</span></div>
          <dl className="fcols" style={{ margin: 0 }}>
            <div style={{ gridColumn: '1 / -1' }}><dt className="lbl">Cliente</dt><dd style={{ margin: '3px 0 0', fontSize: 15, fontWeight: 700 }}>{c ? c.razon : '—'} <span className="mono muted" style={{ fontSize: 12.5, fontWeight: 500 }}>· RUC {c ? c.ruc : ''}</span></dd></div>
            {(['banco', 'fecha', 'hora', 'operacion', 'importe', 'moneda', 'cuenta', 'referencia'] as FieldKey[]).map(k => (
              <div key={k}>
                <dt className="lbl row" style={{ gap: 6 }}>{FIELDS.filter(f => f[0] === k)[0][1]}{orig[k] && orig[k] !== 'ocr' ? <span className={'src src-' + orig[k]}>{String(orig[k]).toUpperCase()}</span> : null}</dt>
                <dd className={k === 'banco' ? '' : 'mono'} style={{ margin: '3px 0 0', fontSize: k === 'importe' ? 21 : 14.5, fontWeight: 600, overflowWrap: 'anywhere' }}>{k === 'importe' ? money(imp, fm.moneda) : showVal(k, fm[k], fm.moneda)}</dd>
              </div>
            ))}
            <div style={{ gridColumn: '1 / -1' }}><dt className="lbl">Voucher</dt><dd style={{ margin: '3px 0 0' }} className="row"><Icon n="file" /><span className="mono">{it.name}</span></dd></div>
          </dl>
          <div style={{ borderTop: '1px solid var(--line-2)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <label className="chk"><input type="checkbox" checked={it.revOk} onChange={e => { const v = e.target.checked; upd(() => ({ revOk: v })); }} />He revisado la información extraída del voucher.</label>
            <div className="between actbar">
              <button type="button" className="btn btn-s btn-lg" onClick={() => upd(() => ({ status: 'revisar' }))} disabled={saving}><Icon n="edit" />Volver a editar</button>
              <button type="button" className="btn btn-p btn-lg" onClick={() => { void save(); }} disabled={!ready}>{saving ? <><span className="spin" />Enviando…</> : <><Icon n="send" />Confirmar y enviar</>}</button>
            </div>
            {!ready && !saving ? <span className="help" style={{ textAlign: 'right' }}>{!it.revOk && needDup && !it.dupOk ? 'Confirma el posible duplicado y la revisión.' : !it.revOk ? 'Marca que revisaste la información.' : 'Confirma el posible duplicado.'}</span> : null}
          </div>
        </section>
      </div>
      <aside className="stack">
        <section className="card" style={{ overflow: 'hidden' }}><div style={{ background: 'var(--line-2)', display: 'flex', justifyContent: 'center', padding: 18 }}>{it.preview ? <img src={it.preview} alt="Voucher" style={{ maxHeight: 260, maxWidth: '100%', borderRadius: 3, boxShadow: '0 6px 18px rgba(16,24,40,.14)' }} /> : null}</div></section>
        <section className="card pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="between"><h2 className="h2" style={{ fontSize: 15 }}>Trazabilidad OCR</h2><span className="chip" style={{ height: 24, fontSize: 11.5 }}><Icon n="clock" />{Math.max(1, Math.round((Date.now() - it.start) / 1000))} s</span></div>
          <p className="note" style={{ margin: 0 }}>{it.ocr ? 'Guardamos la lectura original junto a tus cambios para que Gestión vea qué vino del voucher.' : 'Registro llenado a mano, sin lectura automática.'}</p>
          {changed.map(([k, l]) => (
            <div key={k} className="between" style={{ fontSize: 13, alignItems: 'flex-start' }}>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}><b>{l}</b>
                <span className="muted" style={{ fontSize: 12, overflowWrap: 'anywhere' }}>{orig[k] === 'revisado' ? 'Lectura confirmada sin cambios' : (it.ocr && it.ocr[k].v !== null ? showVal(k, it.ocr[k].v, fm.moneda) + ' → ' : 'Sin lectura → ') + (k === 'importe' ? money(imp, fm.moneda) : showVal(k, fm[k], fm.moneda))}</span></span>
              <span className={'src src-' + orig[k]}>{String(orig[k]).toUpperCase()}</span>
            </div>
          ))}
          {it.ocr ? <div className="between" style={{ fontSize: 13 }}><span><b>{FIELDS.filter(([k]) => orig[k] === 'ocr').length} campos</b><br /><span className="muted" style={{ fontSize: 12 }}>Tal como se leyeron del voucher</span></span><span className="src src-ocr">OCR</span></div> : null}
          <div className="row" style={{ borderTop: '1px solid var(--line-2)', paddingTop: 12, fontSize: 12.5 }}>Al enviar, el estado será <Badge e="Enviado" /></div>
        </section>
        {!saving ? <button type="button" className="btn btn-g btn-sm" style={{ alignSelf: 'flex-start' }} onClick={props.discard}><Icon n="x" />Descartar este voucher</button> : null}
      </aside>
    </div>
  );
}
