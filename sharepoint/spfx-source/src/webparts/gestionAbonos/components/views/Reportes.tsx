/* Reportes para Gestión: indicadores, tendencias y rankings con filtros. */
import * as React from 'react';
import { Abono, MESES, avgValidation, durFmt, monthKey, monthLabel, money, pad2, sumBy } from '../../model';
import { useApp } from '../ctx';
import { Badge, BarChart, Kpi } from '../ui';

interface RF { mes: string; vendedor: string; cliente: string; banco: string; estado: string; }

function HBars(props: { rows: Array<[string, number]>; fmt: (v: number) => string }): React.ReactElement {
  const mx = Math.max(1, ...props.rows.map(r => r[1]));
  if (!props.rows.length) return <span className="note">Sin datos para estos filtros.</span>;
  return (
    <>
      {props.rows.slice(0, 6).map(([k, v]) => (
        <div className="hbar" key={k}>
          <div className="t"><span style={{ fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k}</span><span className="mono">{props.fmt(v)}</span></div>
          <div className="tr"><div style={{ width: Math.max(2, Math.round(v * 100 / mx)) + '%' }} /></div>
        </div>
      ))}
    </>
  );
}

export function VReportes(): React.ReactElement {
  const { abonos, clientes } = useApp();
  const [R, setR] = React.useState<RF>({ mes: '', vendedor: '', cliente: '', banco: '', estado: '' });
  const set = (p: Partial<RF>): void => setR(x => ({ ...x, ...p }));
  const base = abonos.filter(a => (!R.vendedor || String(a.authorId) === R.vendedor) && (!R.cliente || a.clienteRuc === R.cliente) && (!R.banco || a.banco === R.banco) && (!R.estado || a.estado === R.estado));
  const L = base.filter(a => !R.mes || monthKey(a.created) === R.mes);
  const meses = Array.from(new Set(abonos.map(a => monthKey(a.created)))).sort().reverse();
  const reg = sumBy(L), val = sumBy(L.filter(a => a.estado === 'Validado')), pen = sumBy(L.filter(a => a.estado !== 'Validado'));
  const obsEver = L.filter(a => a.estado === 'Observado').length;
  const d = new Date(); d.setDate(1);
  const ms: string[] = [];
  for (let i = 5; i >= 0; i--) { const x = new Date(d.getFullYear(), d.getMonth() - i, 1); ms.push(x.getFullYear() + '-' + pad2(x.getMonth() + 1)); }
  const byMonth = ms.map(m => base.filter(a => monthKey(a.created) === m).length);
  const group = (fn: (a: Abono) => string, amt: boolean): Array<[string, number]> => {
    const r: Record<string, number> = {};
    L.forEach(a => { const k = fn(a); if (!k) return; r[k] = (r[k] || 0) + (amt ? (a.moneda === 'USD' ? 0 : Number(a.importe) || 0) : 1); });
    return Object.keys(r).map(k => [k, r[k]] as [string, number]).sort((a, b) => b[1] - a[1]);
  };
  const est: Array<['Validado' | 'Enviado' | 'Observado', number]> = [['Validado', L.filter(a => a.estado === 'Validado').length], ['Enviado', L.filter(a => a.estado === 'Enviado').length], ['Observado', L.filter(a => a.estado === 'Observado').length]];
  const tot = L.length || 1;
  let acc = 0;
  const grad = est.map(([e, n]) => { const s = acc; acc += n * 100 / tot; return `var(--${e === 'Validado' ? 'val' : e === 'Enviado' ? 'env' : 'obs'}-dot) ${s}% ${acc}%`; }).join(',');
  const vendedores = Array.from(new Map(abonos.map(a => [String(a.authorId), a.authorName] as [string, string])).entries());
  const bancos = Array.from(new Set(abonos.map(a => a.banco).filter(Boolean))).sort();
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}><h1 className="h1">Reportes</h1><p className="muted" style={{ margin: 0 }}>Indicadores de registro y validación de abonos.</p></div>
      <div className="row">
        <select className="fsel" value={R.mes} onChange={e => set({ mes: e.target.value })} aria-label="Fecha"><option value="">Fecha: todo el periodo</option>{meses.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}</select>
        <select className="fsel" value={R.vendedor} onChange={e => set({ vendedor: e.target.value })} aria-label="Vendedor"><option value="">Vendedor: todos</option>{vendedores.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
        <select className="fsel" value={R.cliente} onChange={e => set({ cliente: e.target.value })} aria-label="Cliente"><option value="">Cliente: todos</option>{clientes.map(c => <option key={c.id} value={c.ruc}>{c.razon}</option>)}</select>
        <select className="fsel" value={R.banco} onChange={e => set({ banco: e.target.value })} aria-label="Banco"><option value="">Banco: todos</option>{bancos.map(b => <option key={b} value={b}>{b}</option>)}</select>
        <select className="fsel" value={R.estado} onChange={e => set({ estado: e.target.value })} aria-label="Estado"><option value="">Estado: todos</option><option>Enviado</option><option>Validado</option><option>Observado</option></select>
      </div>
      <div className="kpis" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <Kpi label="Monto registrado" value={money(reg.PEN, 'PEN')} sub={reg.USD ? '+ ' + money(reg.USD, 'USD') : ' '} icon="cash" tone="acc" mono={true} />
        <Kpi label="Monto validado" value={money(val.PEN, 'PEN')} sub={reg.PEN ? Math.round(val.PEN * 1000 / reg.PEN) / 10 + '% del monto registrado' : ' '} icon="checkc" tone="val" mono={true} />
        <Kpi label="Monto pendiente" value={money(pen.PEN, 'PEN')} sub={L.filter(a => a.estado !== 'Validado').length + ' abonos enviados u observados'} icon="clock" tone="env" mono={true} />
        <Kpi label="Cantidad de abonos" value={L.length} sub={R.mes ? monthLabel(R.mes) : 'Todo el periodo'} icon="file" tone="acc" />
        <Kpi label="Tiempo promedio de validación" value={durFmt(avgValidation(L, null))} sub="Desde el registro hasta la validación" icon="clock" tone="acc" />
        <Kpi label="% de abonos observados" value={L.length ? Math.round(obsEver * 1000 / L.length) / 10 + '%' : '—'} sub={`${obsEver} de ${L.length} están observados`} icon="alert" tone="obs" />
      </div>
      <div className="grid2 g21" style={{ gap: 16 }}>
        <section className="card pad" style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div className="between"><h2 className="h2" style={{ fontSize: 15 }}>Abonos por mes</h2><span className="muted" style={{ fontSize: 12.5 }}>Cantidad registrada, últimos 6 meses</span></div>
          <BarChart labels={ms.map(m => MESES[+m.split('-')[1] - 1])} vals={byMonth} />
        </section>
        <section className="card pad" style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center' }}>
          <h2 className="h2" style={{ fontSize: 15, alignSelf: 'flex-start' }}>Estados de registros</h2>
          <div className="donut" style={{ background: L.length ? `conic-gradient(${grad})` : 'var(--line-2)' }}><span><b>{L.length}</b>abonos</span></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignSelf: 'stretch' }}>
            {est.map(([e, n]) => <div className="between" key={e}><Badge e={e} /><span className="mono">{n} · {L.length ? Math.round(n * 1000 / tot) / 10 : 0}%</span></div>)}
          </div>
        </section>
      </div>
      <div className="grid2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
        <section className="card pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}><h2 className="h2" style={{ fontSize: 15 }}>Monto por banco <span className="muted" style={{ fontWeight: 500, fontSize: 12 }}>(S/)</span></h2><HBars rows={group(a => a.banco, true)} fmt={v => money(v, 'PEN')} /></section>
        <section className="card pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}><h2 className="h2" style={{ fontSize: 15 }}>Abonos por vendedor</h2><HBars rows={group(a => a.authorName, false)} fmt={v => String(v)} /></section>
        <section className="card pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}><h2 className="h2" style={{ fontSize: 15 }}>Clientes con mayor monto <span className="muted" style={{ fontWeight: 500, fontSize: 12 }}>(S/)</span></h2><HBars rows={group(a => a.clienteRazon, true).slice(0, 5)} fmt={v => money(v, 'PEN')} /></section>
      </div>
    </>
  );
}
