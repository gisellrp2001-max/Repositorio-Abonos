/* Paneles de inicio para vendedor y para Gestión. */
import * as React from 'react';
import { ago, fmtTs, monthKey, money, sumBy, sumTxt } from '../../model';
import { useApp } from '../ctx';
import { Badge, Empty, Icon, Kpi } from '../ui';
import { AbonosTable, Filters, emptyFilters } from './Lista';

export function VInicio(): React.ReactElement {
  const { abonos, meId, meName, go } = useApp();
  const [f, set] = React.useState<Filters>(emptyFilters());
  const setF = (p: Partial<Filters>): void => set(x => ({ ...x, ...p }));
  const mine = abonos.filter(a => a.authorId === meId);
  const mk = monthKey(Date.now());
  const mes = mine.filter(a => monthKey(a.created) === mk);
  const env = mine.filter(a => a.estado === 'Enviado');
  const val = mes.filter(a => a.estado === 'Validado');
  const obs = mine.filter(a => a.estado === 'Observado');
  const first = meName.split(' ')[0];
  return (
    <>
      <div className="between" style={{ alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h1 className="h1">Hola{first ? `, ${first}` : ''}</h1>
          <p style={{ margin: 0, fontSize: 15 }} className="muted">Gestiona y realiza seguimiento a los abonos de tus clientes.</p>
        </div>
        <button type="button" className="btn btn-p btn-lg" onClick={() => go('nuevo')}><Icon n="add" />Registrar nuevo abono</button>
      </div>
      <div className="kpis">
        <Kpi label="Registrados este mes" value={mes.length} sub={sumTxt(sumBy(mes)) + ' registrados'} icon="file" tone="acc" />
        <Kpi label="Pendientes de validación" value={env.length} sub={env.length ? sumTxt(sumBy(env)) + ' en revisión' : 'Nada pendiente'} icon="clock" tone="env" />
        <Kpi label="Validados" value={val.length} sub={mes.length ? Math.round(val.length * 100 / mes.length) + '% de lo registrado este mes' : 'Aún sin registros este mes'} icon="checkc" tone="val" />
        <Kpi label="Observados" value={obs.length} sub={obs.length ? <span style={{ color: 'var(--obs-fg)', fontWeight: 600 }}>Requiere tu corrección</span> : 'Sin observaciones'} icon="alert" tone="obs" />
      </div>
      {obs.slice(0, 3).map(a => (
        <div className="alert obs" key={a.id}>
          <span className="a-ic"><Icon n="warn" /></span>
          <div style={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span className="ttl">{a.code} fue observado por Gestión</span>
            <p style={{ fontSize: 13 }}>“{a.observacion}” · {a.responsableName || 'Gestión'}, {fmtTs(a.fechaEstado, true)}</p>
          </div>
          <button type="button" className="btn btn-sm btn-bad" onClick={() => go('detalle', a.code)}>Corregir información</button>
        </div>
      ))}
      <AbonosTable title="Abonos recientes" list={mine} full={false} limit={8} f={f} setF={setF} />
    </>
  );
}

export function VGInicio(): React.ReactElement {
  const { abonos, go } = useApp();
  const env = abonos.filter(a => a.estado === 'Enviado');
  const obs = abonos.filter(a => a.estado === 'Observado');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const valHoy = abonos.filter(a => a.estado === 'Validado' && (a.fechaEstado || 0) >= today.getTime());
  const hoy = env.filter(a => a.created >= today.getTime()).length;
  const since = (a: { fechaEstado: number | null; created: number }): number => a.fechaEstado || a.created;
  const old = env.filter(a => Date.now() - since(a) > 48 * 3600e3).length;
  const pend = env.slice().sort((a, b) => since(a) - since(b));
  const amt = sumBy(env);
  const byV: Record<string, { n: number; name: string }> = {};
  env.forEach(a => { const k = String(a.authorId); byV[k] = byV[k] || { n: 0, name: a.authorName }; byV[k].n++; });
  const vRows = Object.keys(byV).map(k => byV[k]).sort((a, b) => b.n - a.n);
  const vmax = Math.max(1, ...vRows.map(r => r.n));
  const ageCls = (ms: number): string => { const h = (Date.now() - ms) / 3600e3; return h > 48 ? 'hi' : h > 24 ? 'md' : ''; };
  return (
    <>
      <div className="between" style={{ alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h1 className="h1">Gestión de Abonos</h1>
          <p style={{ margin: 0, fontSize: 15 }} className="muted">Revisa y valida los abonos registrados por el equipo comercial.</p>
        </div>
        <button type="button" className="btn btn-s btn-lg" onClick={() => go('bandeja')}><Icon n="inbox" />Abrir bandeja completa</button>
      </div>
      <div className="kpis">
        <Kpi label="Pendientes de validación" value={env.length} sub={`${hoy} ingresaron hoy${old ? ` · ${old} con más de 48 h` : ''}`} icon="clock" tone="env" />
        <Kpi label="Validados hoy" value={valHoy.length} sub={sumTxt(sumBy(valHoy)) + ' validados'} icon="checkc" tone="val" />
        <Kpi label="Observados" value={obs.length} sub="Esperando corrección del vendedor" icon="alert" tone="obs" />
        <div className="card kpi dark">
          <div className="kpi-h"><span>Monto pendiente de validar</span><span className="kpi-ic" style={{ background: 'rgba(111,211,220,.16)', color: 'var(--nav-active)' }}><Icon n="cash" /></span></div>
          <div className="kpi-v mono">{money(amt.PEN, 'PEN')}</div>
          <div className="kpi-s mono">{amt.USD ? '+ ' + money(amt.USD, 'USD') : 'Sin montos en dólares'}</div>
        </div>
      </div>
      <section className="card" style={{ overflow: 'hidden' }}>
        <div className="bar" style={{ justifyContent: 'space-between' }}>
          <div className="row"><h2 className="h2">Pendientes de revisión</h2><span className="chip"><Icon n="sort" />Más antiguos primero</span></div>
          {pend.length > 12 ? <button type="button" className="btn btn-g btn-sm" onClick={() => go('bandeja')}>Ver los {pend.length} pendientes <Icon n="fwd" /></button> : null}
        </div>
        {pend.length ? (
          <div className="tw">
            <table className="t">
              <thead><tr><th>Código</th><th>Fecha registro</th><th>Vendedor</th><th>Cliente</th><th>Banco</th><th>Operación</th><th className="num">Importe</th><th>Estado</th><th>Tiempo pendiente</th><th /></tr></thead>
              <tbody>
                {pend.slice(0, 12).map(a => (
                  <tr key={a.id} onClick={() => go('detalle', a.code)}>
                    <td className="code">{a.code}</td><td className="mono" style={{ fontSize: 12 }}>{fmtTs(a.created)}</td><td>{a.authorName}</td><td className="strong">{a.clienteRazon}</td>
                    <td>{a.banco}</td><td className="op">{a.operacion}</td><td className="amt">{money(a.importe, a.moneda)}</td><td><Badge e={a.estado} /></td>
                    <td><span className={'age ' + ageCls(since(a))}>{ago(since(a))}</span></td>
                    <td><button type="button" className="btn btn-p btn-sm" onClick={e => { e.stopPropagation(); go('detalle', a.code); }}>Revisar</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty icon="checkc" title="Todo al día" text="No hay abonos esperando validación." />}
      </section>
      <div className="grid2" style={{ gap: 16 }}>
        <section className="card pad" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="between"><h2 className="h2" style={{ fontSize: 15 }}>Observados esperando corrección</h2><Badge e="Observado" label={String(obs.length)} /></div>
          {obs.length ? obs.slice(0, 6).map(a => (
            <button type="button" key={a.id} className="cli-opt" style={{ border: 0, borderBottom: '1px solid var(--line-2)', borderRadius: 0, padding: '10px 0' }} onClick={() => go('detalle', a.code)}>
              <span style={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontWeight: 600, fontSize: 13.5 }}>{a.clienteRazon} <span className="mono" style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 500 }}>· {a.code}</span></span>
                <span className="muted" style={{ fontSize: 12.5 }}>{a.authorName} · “{a.observacion}”</span>
              </span>
              <span className="muted" style={{ fontSize: 12 }}>hace {ago(a.fechaEstado || a.modified)}</span>
            </button>
          )) : <p className="note" style={{ margin: 0 }}>No hay abonos observados.</p>}
        </section>
        <section className="card pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="between"><h2 className="h2" style={{ fontSize: 15 }}>Pendientes por vendedor</h2><span className="muted" style={{ fontSize: 12.5 }}>{env.length} en total</span></div>
          {vRows.length ? vRows.map(r => (
            <div className="hbar" key={r.name}><div className="t"><span style={{ fontWeight: 600 }}>{r.name}</span><span className="mono">{r.n}</span></div><div className="tr"><div style={{ width: Math.round(r.n * 100 / vmax) + '%' }} /></div></div>
          )) : <p className="note" style={{ margin: 0 }}>Sin pendientes.</p>}
        </section>
      </div>
    </>
  );
}
