/* Detalle del abono: datos con su origen, voucher, historial; corrección del vendedor y validación de Gestión con confirmación. */
import * as React from 'react';
import { Estado, FIELDS, FieldKey, Hist, QUICK_OBS, FIELD_LABEL, ago, fmtDate, fmtNum, fmtTs, money, parseAmount, sameVal, showVal, dupCandidates, norm } from '../../model';
import { useApp } from '../ctx';
import { Badge, Empty, Icon, Viewer } from '../ui';

const DOT: Record<string, string> = { Enviado: 'var(--env-dot)', Validado: 'var(--val-dot)', Observado: 'var(--obs-dot)' };

function histTitle(h: Hist): string {
  if (h.tipo === 'registro') return 'Voucher registrado por ' + h.authorName;
  if (h.tipo === 'ocr') return 'Información procesada mediante OCR';
  if (h.tipo === 'edicion') return 'Datos corregidos por ' + h.authorName;
  if (h.tipo === 'estado') { if (h.a === 'Enviado') return h.de ? 'Reenviado para validación' : 'Enviado a Gestión'; return (h.a === 'Validado' ? 'Validado' : 'Observado') + ' por ' + h.authorName; }
  return h.detalle;
}
function histDet(h: Hist): string {
  if (h.tipo === 'estado') return `${h.de || '—'} → ${h.a}${h.detalle ? ' · “' + h.detalle + '”' : ''}`;
  return h.detalle;
}

export function VDetalle(): React.ReactElement {
  const { abonos, param, isG, meId, sp, go, refresh, toast, confirm, loading } = useApp();
  const a = abonos.filter(x => x.code === param)[0];
  const [hist, setHist] = React.useState<Hist[] | null>(null);
  const [edit, setEdit] = React.useState<Record<FieldKey, string> | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [g, setG] = React.useState<{ estado: Estado; obs: string; err: boolean }>({ estado: 'Enviado', obs: '', err: false });

  const loadHist = React.useCallback(() => { if (a) sp.loadHist(a.id).then(setHist).catch(() => setHist([])); }, [a && a.id, a && a.modified]);
  React.useEffect(() => { loadHist(); }, [loadHist]);
  React.useEffect(() => { if (a) setG({ estado: a.estado, obs: '', err: false }); setEdit(null); }, [a && a.id, a && a.estado]);

  if (!a) return <div className="card"><Empty icon="search" title="No encontramos ese abono" text={loading ? 'Cargando…' : 'Puede que el código sea incorrecto o que aún no se haya sincronizado.'}><button type="button" className="btn btn-s" onClick={() => go(isG ? 'bandeja' : 'mis')}>Volver</button></Empty></div>;

  const mine = a.authorId === meId;
  const ocr = a.extra.ocr || null;
  const origen = a.extra.origen || {};
  const tag = (k: FieldKey): React.ReactNode => origen[k] ? <span className={'src src-' + origen[k]}>{String(origen[k]).toUpperCase()}</span> : null;

  /* ----- Corrección del vendedor ----- */
  const startEdit = (): void => setEdit({ banco: a.banco, fecha: a.fecha, hora: a.hora, operacion: a.operacion, importe: a.importe !== null ? fmtNum(a.importe) : '', moneda: a.moneda, cuenta: a.cuenta, ordenante: a.ordenante, referencia: a.referencia });
  const resend = async (): Promise<void> => {
    if (!edit) return;
    const imp = parseAmount(edit.importe);
    if (imp === null || !edit.banco.trim() || !edit.operacion.trim() || !edit.fecha) { toast('Completa banco, fecha, operación e importe.'); return; }
    const vals: Record<string, unknown> = {}; const cambios: string[] = []; const newOrigen = { ...origen };
    FIELDS.forEach(([k]) => {
      const nv = k === 'importe' ? imp : String(edit[k] || '').trim();
      const ov = (a as unknown as Record<string, unknown>)[k];
      const same = k === 'importe' ? sameVal(k, nv, ov) : norm(nv) === norm(ov);
      if (same) return;
      vals[k] = nv;
      cambios.push(`${FIELD_LABEL[k]}: ${k === 'importe' ? money(Number(ov), a.moneda) : k === 'fecha' ? fmtDate(String(ov)) : (ov || '—')} → ${k === 'importe' ? money(imp, edit.moneda) : k === 'fecha' ? fmtDate(String(nv)) : (nv || '—')}`);
      const oc = ocr ? ocr[k] : null;
      newOrigen[k] = oc && oc.v !== null && sameVal(k, oc.v, nv) ? (oc.c === 'alta' ? 'ocr' : 'revisado') : 'manual';
    });
    setSaving(true);
    try {
      await sp.updateAbono(a.id, { ...vals, estado: 'Enviado', fechaEstado: Date.now(), datosOcr: { ...a.extra, origen: newOrigen } });
      if (cambios.length) { try { await sp.addHist(a.id, a.code, 'edicion', '', '', cambios.join(' · ')); } catch (e) { /* no bloquea */ } }
      try { await sp.addHist(a.id, a.code, 'estado', 'Observado', 'Enviado', ''); } catch (e) { /* no bloquea */ }
      setEdit(null); toast('Corrección reenviada para validación'); await refresh(); loadHist();
    } catch (e) { toast('No se pudo reenviar: ' + (e as Error).message); }
    setSaving(false);
  };

  /* ----- Cambio de estado por Gestión (con confirmación) ----- */
  const change = (nuevo: Estado): void => {
    const texto = g.obs.trim();
    if (nuevo === 'Observado' && !texto) { setG({ ...g, err: true }); return; }
    const verb = nuevo === 'Validado' ? 'Validar' : nuevo === 'Observado' ? 'Marcar como observado' : 'Volver a Enviado';
    confirm({
      title: nuevo === 'Validado' ? '¿Validar este abono?' : nuevo === 'Observado' ? '¿Marcar este abono como observado?' : '¿Devolver este abono a Enviado?',
      text: nuevo === 'Observado' ? 'El vendedor verá la observación y deberá corregir la información.' : nuevo === 'Validado' ? 'Confirma que revisaste el voucher contra los datos registrados.' : 'El abono volverá a la bandeja de pendientes.',
      tone: nuevo === 'Validado' ? 'ok' : nuevo === 'Observado' ? 'bad' : 'neutral',
      icon: nuevo === 'Validado' ? 'checkc' : nuevo === 'Observado' ? 'alert' : 'refresh',
      lines: [
        ['Código', <span className="mono" key="c">{a.code}</span>],
        ['Cliente', a.clienteRazon],
        ['Importe', <span className="mono" key="i">{money(a.importe, a.moneda)}</span>],
        ['Estado', <span key="e" className="row" style={{ gap: 6 }}><Badge e={a.estado} /> → <Badge e={nuevo} /></span>],
        ['Observación', texto || '—']
      ],
      confirm: verb,
      onConfirm: async () => {
        const now = Date.now();
        try {
          await sp.updateAbono(a.id, { estado: nuevo, fechaEstado: now, responsable: sp.userId || null, observacion: nuevo === 'Observado' ? texto : (texto || a.observacion) });
          try { await sp.addHist(a.id, a.code, 'estado', a.estado, nuevo, texto); } catch (e) { /* no bloquea */ }
          toast(nuevo === 'Validado' ? `${a.code} validado` : nuevo === 'Observado' ? `${a.code} observado` : `${a.code} volvió a Enviado`);
          await refresh(); loadHist();
        } catch (e) {
          toast('No se pudo cambiar el estado: ' + (e as Error).message);
          throw e;
        }
      }
    });
  };

  const row = (k: FieldKey): React.ReactElement => {
    const label = FIELD_LABEL[k];
    if (edit) {
      const id = `ga-e-${k}`;
      const input = k === 'moneda'
        ? <select id={id} className="inp" value={edit.moneda} onChange={e => setEdit({ ...edit, moneda: e.target.value })} style={{ maxWidth: 180 }}><option value="PEN">Soles (PEN)</option><option value="USD">Dólares (USD)</option></select>
        : <input id={id} className={'inp ' + (k === 'banco' || k === 'ordenante' ? '' : 'mono')} type={k === 'fecha' ? 'date' : k === 'hora' ? 'time' : 'text'} value={edit[k]} onChange={e => setEdit({ ...edit, [k]: e.target.value })} style={{ maxWidth: 260 }} />;
      return <div key={k}><dt><label htmlFor={id}>{label}</label></dt><dd>{input}</dd></div>;
    }
    const v = (a as unknown as Record<string, unknown>)[k];
    const ov = ocr ? ocr[k] : null;
    const diff = ov && ov.v !== null && ov.v !== '' && !sameVal(k, ov.v, v);
    if (k === 'importe') {
      const obs = a.estado === 'Observado';
      return (
        <div key={k} className="hl" style={{ background: obs ? 'var(--obs-bg)' : 'var(--surface-2)', borderColor: obs ? 'var(--obs-line)' : 'var(--line)' }}>
          <dt style={{ display: 'flex', flexDirection: 'column', gap: 3, color: 'var(--fg)', fontWeight: 600 }}>Importe{diff && ov ? <span className="mono muted" style={{ fontSize: 11.5, fontWeight: 500 }}>Lectura OCR original: {money(Number(ov.v), a.moneda)}</span> : null}</dt>
          <dd><span className="mono" style={{ fontSize: 20 }}>{money(a.importe, a.moneda)}</span>{tag(k)}</dd>
        </div>
      );
    }
    return <div key={k}><dt>{label}</dt><dd><span className={k === 'banco' || k === 'ordenante' ? '' : 'mono'} style={{ fontWeight: k === 'banco' ? 600 : 500 }}>{showVal(k, v, a.moneda)}</span>{tag(k)}</dd></div>;
  };

  const dups = isG ? dupCandidates(abonos, { banco: a.banco, operacion: a.operacion, fecha: a.fecha, importe: a.importe }, a.clienteRuc, a.id) : [];
  const info = (
    <section className="card pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="between">
        <h2 className="h2">{isG ? 'Datos registrados' : 'Información del abono'}</h2>
        <div className="row" style={{ gap: 6, fontSize: 11.5 }}><span className="src src-ocr">OCR</span><span className="muted">del voucher</span><span className="src src-revisado">REVISADO</span><span className="muted">confirmado</span><span className="src src-manual">MANUAL</span><span className="muted">vendedor</span></div>
      </div>
      <dl className={'kv ' + (isG ? 'one' : '')}>
        <div><dt>Cliente</dt><dd>{a.clienteRazon}</dd></div>
        <div><dt>RUC</dt><dd className="mono" style={{ fontWeight: 500 }}>{a.clienteRuc}</dd></div>
        {FIELDS.map(([k]) => row(k))}
        <div><dt>Registrado por</dt><dd>{a.authorName}</dd></div>
        <div><dt>Fecha de registro</dt><dd className="mono" style={{ fontWeight: 500 }}>{fmtTs(a.created, true)}</dd></div>
      </dl>
      {edit ? (
        <div className="between actbar" style={{ borderTop: '1px solid var(--line-2)', paddingTop: 14 }}>
          <span className="row muted" style={{ fontSize: 12.5 }}><Icon n="lock" />Tu corrección se agrega al historial; lo anterior no se elimina.</span>
          <div className="row">
            <button type="button" className="btn btn-s" onClick={() => setEdit(null)} disabled={saving}>Cancelar</button>
            <button type="button" className="btn btn-p" onClick={() => { void resend(); }} disabled={saving}>{saving ? <span className="spin" /> : <Icon n="send" />}Reenviar para validación</button>
          </div>
        </div>
      ) : null}
      {isG ? (
        <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 9 }}>
          <span className="muted" style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em' }}>VERIFICACIÓN AUTOMÁTICA</span>
          {origen.importe === 'manual'
            ? <span className="row" style={{ gap: 8, fontSize: 12.5, flexWrap: 'nowrap', color: 'var(--warn-fg)' }}><Icon n="warn" />El importe se escribió a mano o difiere de la lectura OCR.</span>
            : origen.importe ? <span className="row" style={{ gap: 8, fontSize: 12.5, flexWrap: 'nowrap' }}><span style={{ color: 'var(--val-fg)', display: 'flex' }}><Icon n="check" /></span>Importe igual a la lectura OCR</span> : null}
          {a.extra.cliSug ? <span className="row" style={{ gap: 8, fontSize: 12.5, flexWrap: 'nowrap' }}><span style={{ color: 'var(--val-fg)', display: 'flex' }}><Icon n="check" /></span>Cliente sugerido por el ordenante del voucher</span> : null}
          {dups.length ? dups.map(d => (
            <span key={d.a.id} className="row" style={{ gap: 8, fontSize: 12.5, flexWrap: 'nowrap', color: 'var(--warn-fg)' }}><Icon n="warn" /><span>Similar a <button type="button" className="btn btn-g btn-sm mono" style={{ padding: 0, height: 'auto' }} onClick={() => go('detalle', d.a.code)}>{d.a.code}</button>{a.extra.dup && a.extra.dup.length ? ' · el vendedor confirmó que es distinto' : ''}</span></span>
          )) : <span className="row" style={{ gap: 8, fontSize: 12.5, flexWrap: 'nowrap' }}><span style={{ color: 'var(--val-fg)', display: 'flex' }}><Icon n="check" /></span>Sin registros duplicados</span>}
        </div>
      ) : null}
    </section>
  );

  const src = a.voucherUrl || null;
  const viewer = <Viewer src={src} name={a.extra.voucherName} orig={a.extra.pdfUrl || a.voucherUrl || undefined} />;
  const histCard = (
    <section className="card pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="between"><h2 className="h2" style={{ fontSize: 15 }}>Historial</h2><span className="row muted" style={{ gap: 5, fontSize: 11.5 }}><Icon n="lock" />No editable</span></div>
      {hist === null ? <span className="spin" /> : hist.length ? (
        <ol className="tl">
          {hist.map(h => (
            <li key={h.id}>
              <div className="rail"><span className="d" style={{ background: h.tipo === 'estado' ? DOT[h.a] || 'var(--accent)' : h.tipo === 'edicion' ? 'var(--man-fg)' : h.tipo === 'ocr' ? 'var(--focus)' : 'var(--accent)' }} /><span className="l" /></div>
              <div className="body"><span className="when">{fmtTs(h.created, true)}</span><span className="what">{histTitle(h)}</span>{histDet(h) ? <span className="det">{histDet(h)}</span> : null}</div>
            </li>
          ))}
        </ol>
      ) : <p className="note" style={{ margin: 0 }}>Sin eventos registrados.</p>}
    </section>
  );
  const panel = (
    <section className="card pad g-panel" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h2 className="h2">Gestión</h2>
      <div className="field"><label className="lbl" htmlFor="ga-g-estado">Estado</label>
        <select id="ga-g-estado" className="inp" value={g.estado} onChange={e => setG({ ...g, estado: e.target.value as Estado })}>
          <option>Enviado</option><option>Validado</option><option>Observado</option>
        </select>
      </div>
      <div className="field">
        <label className="lbl" htmlFor="ga-g-obs">Observaciones de Gestión</label>
        <textarea id="ga-g-obs" className="inp" value={g.obs} onChange={e => setG({ ...g, obs: e.target.value, err: false })} placeholder="Ej.: El importe registrado no coincide con el voucher. Favor revisar." style={g.err ? { borderColor: 'var(--obs-dot)' } : undefined} />
        {g.err ? <span className="help bad" style={{ fontWeight: 600 }}>Escribe el motivo para marcar como observado.</span> : null}
        <div className="pill-list">{QUICK_OBS.map(([l, t]) => <button type="button" key={l} className="qc" onClick={() => setG({ estado: 'Observado', obs: t, err: false })}>{l}</button>)}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {g.estado === 'Enviado' && a.estado !== 'Enviado'
          ? <button type="button" className="btn btn-s btn-lg" onClick={() => change('Enviado')}><Icon n="refresh" />Volver a Enviado</button>
          : <>
            <button type="button" className="btn btn-ok btn-lg" onClick={() => change('Validado')} disabled={a.estado === 'Validado'}><Icon n="check" />Validar abono</button>
            <button type="button" className="btn btn-bad btn-lg" onClick={() => change('Observado')}><Icon n="alert" />Marcar como observado</button>
          </>}
      </div>
      <p className="note" style={{ margin: 0 }}>Antes de aplicar el cambio se pide confirmación. Queda registrado usuario, fecha, hora, estado anterior, estado nuevo y observación.</p>
      {a.responsableName ? <div className="row" style={{ fontSize: 12.5, borderTop: '1px solid var(--line-2)', paddingTop: 12 }}><span className="muted">Último cambio:</span><b>{a.responsableName}</b><span className="mono muted">{fmtTs(a.fechaEstado, true)}</span></div> : null}
    </section>
  );

  return (
    <>
      <div className="between" style={{ alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          <button type="button" className="btn btn-g btn-sm" style={{ padding: 0, alignSelf: 'flex-start' }} onClick={() => go(isG ? 'bandeja' : 'mis')}><Icon n="back" />{isG ? 'Bandeja' : 'Mis abonos'}</button>
          <div className="row" style={{ gap: 14 }}><h1 className="h1 mono" style={{ letterSpacing: 0 }}>{a.code}</h1><Badge e={a.estado} upper /></div>
          <span className="muted" style={{ fontSize: 13.5 }}>{a.clienteRazon} · Registrado por {a.authorName} el {fmtTs(a.created, true)}{a.estado === 'Enviado' ? ` · pendiente hace ${ago(a.fechaEstado || a.created)}` : ''}</span>
        </div>
        {mine && a.estado === 'Observado' && !edit ? <button type="button" className="btn btn-p" onClick={startEdit}><Icon n="edit" />Corregir información</button> : null}
      </div>
      {a.estado === 'Observado' ? (
        <section className="alert obs">
          <span className="a-ic"><Icon n="alert" /></span>
          <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
            <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.1em' }}>ABONO OBSERVADO</span>
            <p style={{ fontSize: 15.5, fontWeight: 600 }}>“{a.observacion}”</p>
            <div className="row" style={{ gap: 28, fontSize: 13, color: 'var(--fg)' }}>
              <span><span className="muted">Observado por</span> <b>{a.responsableName || 'Gestión'}</b></span>
              <span><span className="muted">Fecha</span> <b className="mono">{fmtTs(a.fechaEstado, true)}</b></span>
            </div>
          </div>
          {mine && !edit ? <button type="button" className="btn btn-bad" onClick={startEdit}>Corregir información</button> : null}
        </section>
      ) : null}
      {isG ? (
        <>
          <div className="three">{viewer}<div className="stack">{info}</div>{panel}</div>
          {histCard}
        </>
      ) : (
        <div className="split split-d">
          <div className="stack">{info}</div>
          <div className="stack">{viewer}{histCard}</div>
        </div>
      )}
    </>
  );
}

