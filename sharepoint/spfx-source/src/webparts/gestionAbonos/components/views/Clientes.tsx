/* Clientes: listado con búsqueda, alta rápida y perfil con resumen, abonos e información. */
import * as React from 'react';
import { Cliente, MESES, avgValidation, digits, durFmt, fmtDate, fmtTs, initials, monthKey, money, norm, pad2, sumBy, sumTxt } from '../../model';
import { useApp } from '../ctx';
import { Badge, BarChart, Empty, Icon, Kpi } from '../ui';

function NuevoCliente(props: { onDone: () => void }): React.ReactElement {
  const { sp, clientes, refresh, toast } = useApp();
  const [razon, setRazon] = React.useState('');
  const [ruc, setRuc] = React.useState('');
  const [err, setErr] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const save = async (): Promise<void> => {
    const r = digits(ruc);
    if (razon.trim().length < 3) { setErr('Escribe la razón social.'); return; }
    if (r.length !== 11) { setErr('El RUC debe tener 11 dígitos.'); return; }
    if (clientes.some(c => digits(c.ruc) === r)) { setErr('Ya existe un cliente con ese RUC.'); return; }
    setBusy(true);
    try { await sp.createCliente(razon.trim(), r); await refresh(); toast('Cliente guardado'); props.onDone(); }
    catch (e) { setErr('No se pudo guardar: ' + (e as Error).message); setBusy(false); }
  };
  return (
    <div style={{ margin: 16, border: '1px dashed var(--line)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <b style={{ fontSize: 13.5 }}>Nuevo cliente</b>
      <div className="grid2">
        <div className="field"><label className="lbl" htmlFor="ga-nc-r">Razón social</label><input id="ga-nc-r" className="inp" value={razon} onChange={e => setRazon(e.target.value)} autoComplete="off" /></div>
        <div className="field"><label className="lbl" htmlFor="ga-nc-u">RUC</label><input id="ga-nc-u" className="inp mono" inputMode="numeric" maxLength={11} value={ruc} onChange={e => setRuc(e.target.value)} autoComplete="off" /></div>
      </div>
      {err ? <span className="help bad">{err}</span> : null}
      <div className="row"><button type="button" className="btn btn-p btn-sm" onClick={() => { void save(); }} disabled={busy}>{busy ? 'Guardando…' : 'Guardar cliente'}</button><button type="button" className="btn btn-g btn-sm" onClick={props.onDone}>Cancelar</button></div>
    </div>
  );
}

export function VClientes(): React.ReactElement {
  const { clientes, abonos, isG, meId, go } = useApp();
  const [q, setQ] = React.useState('');
  const [mine, setMine] = React.useState(!isG);
  const [adding, setAdding] = React.useState(false);
  const nq = norm(q);
  let list = clientes.filter(c => !nq || norm(c.razon).indexOf(nq) > -1 || (!!digits(q) && digits(c.ruc).indexOf(digits(q)) > -1));
  if (mine) list = list.filter(c => c.vendedorId === meId);
  list = list.slice().sort((a, b) => a.razon.localeCompare(b.razon));
  const stats = (c: Cliente): { n: number; pend: number; last: number } => {
    const L = abonos.filter(a => digits(a.clienteRuc) === digits(c.ruc));
    return { n: L.length, pend: L.filter(a => a.estado === 'Enviado').length, last: L.reduce((m, a) => Math.max(m, a.created), 0) };
  };
  return (
    <>
      <div className="between" style={{ alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}><h1 className="h1">Clientes</h1><p className="muted" style={{ margin: 0 }}>Perfiles y abonos de cada cliente.</p></div>
      </div>
      <section className="card" style={{ overflow: 'hidden' }}>
        <div className="bar">
          <label className="srch" style={{ flex: '1 1 240px', maxWidth: 360 }}><Icon n="search" /><input type="search" placeholder="Buscar por nombre o RUC" value={q} onChange={e => setQ(e.target.value)} aria-label="Buscar cliente" /></label>
          <div className="tabs"><button type="button" className={mine ? 'on' : ''} onClick={() => setMine(true)}>Mis clientes</button><button type="button" className={!mine ? 'on' : ''} onClick={() => setMine(false)}>Todos</button></div>
          <span style={{ marginLeft: 'auto' }} />
          {!adding ? <button type="button" className="btn btn-s btn-sm" onClick={() => setAdding(true)}><Icon n="add" />Nuevo cliente</button> : null}
        </div>
        {adding ? <NuevoCliente onDone={() => setAdding(false)} /> : null}
        {list.length ? (
          <div className="tw">
            <table className="t">
              <thead><tr><th>Cliente</th><th>RUC</th><th>Vendedor asignado</th><th>Estado</th><th className="num">Abonos</th><th className="num">Pendientes</th><th>Último abono</th></tr></thead>
              <tbody>
                {list.map(c => { const s = stats(c); return (
                  <tr key={c.id} onClick={() => go('cliente', String(c.id))}>
                    <td className="strong h"><span className="row" style={{ flexWrap: 'nowrap' }}><span className="cli-ini" style={{ width: 30, height: 30, fontSize: 11, borderRadius: 8 }}>{initials(c.razon)}</span>{c.razon}</span></td>
                    <td className="op" data-l="RUC">{c.ruc}</td><td data-l="Vendedor">{c.vendedorName || '—'}</td>
                    <td className="st"><span className={'b ' + (c.estado === 'Inactivo' ? 'b-obs' : 'b-val')}><i />{c.estado || 'Activo'}</span></td>
                    <td className="amt" data-l="Abonos">{s.n}</td><td className="amt" data-l="Pendientes">{s.pend}</td><td className="muted" data-l="Último abono">{s.last ? fmtTs(s.last, true) : '—'}</td>
                  </tr>
                ); })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon="users" title={clientes.length ? 'Sin resultados' : 'Aún no hay clientes'} text={clientes.length ? (mine ? 'No tienes clientes asignados con ese criterio. Prueba en “Todos”.' : 'Prueba con otro nombre o RUC.') : 'Crea el primero con “Nuevo cliente” o desde el registro de un abono.'} />
        )}
      </section>
    </>
  );
}

export function VCliente(): React.ReactElement {
  const { clientes, abonos, param, isG, sp, go, refresh, toast } = useApp();
  const [tab, setTab] = React.useState<'resumen' | 'abonos' | 'info'>('abonos');
  const c = clientes.filter(x => String(x.id) === param)[0];
  if (!c) return <div className="card"><Empty icon="search" title="No encontramos ese cliente" text="Vuelve a la lista de clientes."><button type="button" className="btn btn-s" onClick={() => go('clientes')}>Ver clientes</button></Empty></div>;
  const L = abonos.filter(a => digits(a.clienteRuc) === digits(c.ruc)).sort((a, b) => b.created - a.created);
  const y = new Date().getFullYear(); const mk = monthKey(Date.now());
  const anio = L.filter(a => new Date(a.created).getFullYear() === y && a.estado !== 'Observado');
  const mes = L.filter(a => monthKey(a.created) === mk);
  const pend = L.filter(a => a.estado === 'Enviado');
  const last = L[0];
  let panel: React.ReactNode = null;
  if (tab === 'abonos') {
    panel = L.length ? (
      <div className="tw"><table className="t">
        <thead><tr><th>Fecha</th><th>Código</th><th>Banco</th><th>Operación</th><th className="num">Importe</th><th>Estado</th><th>Registrado por</th></tr></thead>
        <tbody>{L.map(a => (
          <tr key={a.id} onClick={() => go('detalle', a.code)}><td data-l="Fecha">{fmtDate(a.fecha)}</td><td className="code h">{a.code}</td><td data-l="Banco">{a.banco}</td><td className="op" data-l="Operación">{a.operacion}</td><td className="amt" data-l="Importe">{money(a.importe, a.moneda)}</td><td className="st"><Badge e={a.estado} /></td><td data-l="Registrado por">{a.authorName}</td></tr>
        ))}</tbody>
      </table></div>
    ) : <Empty icon="file" title="Sin abonos" text="Este cliente aún no tiene abonos registrados."><button type="button" className="btn btn-p" onClick={() => go('nuevo')}><Icon n="add" />Registrar abono</button></Empty>;
  } else if (tab === 'resumen') {
    const months: string[] = []; const d = new Date(); d.setDate(1);
    for (let i = 5; i >= 0; i--) { const x = new Date(d.getFullYear(), d.getMonth() - i, 1); months.push(x.getFullYear() + '-' + pad2(x.getMonth() + 1)); }
    const vals = months.map(m => L.filter(a => monthKey(a.created) === m && a.moneda !== 'USD').reduce((s, a) => s + (Number(a.importe) || 0), 0));
    const bancos: Record<string, number> = {}; L.forEach(a => { bancos[a.banco] = (bancos[a.banco] || 0) + 1; });
    const bt = L.length || 1;
    panel = (
      <div className="grid2" style={{ padding: 22, gap: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}><b>Monto abonado por mes (S/)</b><BarChart labels={months.map(m => MESES[+m.split('-')[1] - 1])} vals={vals} money={true} /></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <b>Bancos utilizados</b>
          {Object.keys(bancos).length ? Object.keys(bancos).sort((a, b) => bancos[b] - bancos[a]).map(b => (
            <div className="hbar" key={b}><div className="t"><span style={{ fontWeight: 600 }}>{b}</span><span className="mono">{Math.round(bancos[b] * 100 / bt)}%</span></div><div className="tr"><div style={{ width: Math.round(bancos[b] * 100 / bt) + '%' }} /></div></div>
          )) : <span className="note">Sin datos todavía.</span>}
          <div className="note" style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '12px 14px' }}>Tiempo promedio de validación: <b style={{ color: 'var(--fg)' }}>{durFmt(avgValidation(L, null))}</b></div>
        </div>
      </div>
    );
  } else {
    panel = (
      <dl className="fcols" style={{ margin: 0, padding: 22 }}>
        <div><dt className="lbl">Razón social</dt><dd style={{ margin: '3px 0 0', fontWeight: 600 }}>{c.razon}</dd></div>
        <div><dt className="lbl">RUC</dt><dd className="mono" style={{ margin: '3px 0 0' }}>{c.ruc}</dd></div>
        <div><dt className="lbl">Vendedor asignado</dt><dd style={{ margin: '3px 0 0' }}>{c.vendedorName || '—'}</dd></div>
        <div><dt className="lbl">Estado</dt><dd style={{ margin: '3px 0 0' }} className="row">{c.estado || 'Activo'}
          {isG ? <button type="button" className="btn btn-s btn-sm" onClick={() => { const n = c.estado === 'Inactivo' ? 'Activo' : 'Inactivo'; sp.setClienteEstado(c.id, n).then(() => refresh()).then(() => toast('Cliente actualizado')).catch(e => toast('No se pudo actualizar: ' + (e as Error).message)); }}>Marcar como {c.estado === 'Inactivo' ? 'Activo' : 'Inactivo'}</button> : null}</dd></div>
        <div><dt className="lbl">Creado</dt><dd style={{ margin: '3px 0 0' }}>{fmtTs(c.created, true)} · {c.authorName}</dd></div>
      </dl>
    );
  }
  return (
    <>
      <button type="button" className="btn btn-g btn-sm" style={{ padding: 0, alignSelf: 'flex-start' }} onClick={() => go('clientes')}><Icon n="back" />Clientes</button>
      <section className="card pad" style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
        <span className="cli-ini" style={{ width: 64, height: 64, fontSize: 20, borderRadius: 16 }}>{initials(c.razon)}</span>
        <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div className="row"><h1 className="h1">{c.razon}</h1><span className={'b ' + (c.estado === 'Inactivo' ? 'b-obs' : 'b-val')}><i />{c.estado || 'Activo'}</span></div>
          <div className="row" style={{ gap: 30 }}>
            <span style={{ display: 'flex', flexDirection: 'column' }}><span className="lbl">RUC</span><span className="mono">{c.ruc}</span></span>
            <span style={{ display: 'flex', flexDirection: 'column' }}><span className="lbl">Vendedor asignado</span><b>{c.vendedorName || '—'}</b></span>
            <span style={{ display: 'flex', flexDirection: 'column' }}><span className="lbl">Estado</span><b>{c.estado || 'Activo'}</b></span>
          </div>
        </div>
        <button type="button" className="btn btn-p" onClick={() => go('nuevo')}><Icon n="add" />Registrar abono</button>
      </section>
      <div className="kpis">
        <Kpi label={'Total abonado ' + y} value={sumTxt(sumBy(anio))} sub={anio.length + ' abonos en el año'} icon="cash" tone="acc" mono={true} />
        <Kpi label="Abonos del mes" value={mes.length} sub={sumTxt(sumBy(mes))} icon="file" tone="acc" />
        <Kpi label="Pendientes de validar" value={pend.length} sub={sumTxt(sumBy(pend))} icon="clock" tone="env" />
        <Kpi label="Último abono" value={last ? fmtDate(last.fecha) : '—'} sub={last ? money(last.importe, last.moneda) + ' · ' + last.banco : 'Sin abonos'} icon="checkc" tone="val" mono={true} />
      </div>
      <section className="card" style={{ overflow: 'hidden' }}>
        <div role="tablist" style={{ display: 'flex', gap: 26, padding: '0 22px', borderBottom: '1px solid var(--line)' }}>
          {([['resumen', 'Resumen'], ['abonos', 'Abonos'], ['info', 'Información']] as Array<['resumen' | 'abonos' | 'info', string]>).map(([k, l]) => (
            <button type="button" role="tab" key={k} aria-selected={tab === k} onClick={() => setTab(k)} style={{ border: 0, background: 'none', height: 46, fontSize: 14, fontWeight: 600, cursor: 'pointer', color: tab === k ? 'var(--accent)' : 'var(--muted)', borderBottom: `2px solid ${tab === k ? 'var(--accent)' : 'transparent'}`, marginBottom: -1, padding: '0 2px' }}>{l}</button>
          ))}
        </div>
        {panel}
      </section>
    </>
  );
}
