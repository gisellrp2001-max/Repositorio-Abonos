/* Tablas de abonos: Mis abonos (vendedor) y Bandeja (Gestión), con filtros, búsqueda y orden. */
import * as React from 'react';
import { Abono, Estado, fmtDate, fmtTs, money, norm, sumBy, sumTxt, pad2 } from '../../model';
import { useApp } from '../ctx';
import { Badge, Empty, Icon } from '../ui';

export interface Filters { q: string; estado: 'todos' | Estado; cliente: string; banco: string; moneda: string; vendedor: string; desde: string; hasta: string; sort: keyof Abono; dir: number; }
export const emptyFilters = (): Filters => ({ q: '', estado: 'todos', cliente: '', banco: '', moneda: '', vendedor: '', desde: '', hasta: '', sort: 'created', dir: -1 });

function applyFilters(list: Abono[], f: Filters, full: boolean): Abono[] {
  const q = norm(f.q);
  const out = list.filter(a => {
    if (f.estado !== 'todos' && a.estado !== f.estado) return false;
    if (full) {
      if (f.cliente && a.clienteRuc !== f.cliente) return false;
      if (f.banco && a.banco !== f.banco) return false;
      if (f.moneda && a.moneda !== f.moneda) return false;
      if (f.vendedor && String(a.authorId) !== f.vendedor) return false;
      const d = new Date(a.created); const iso = d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
      if (f.desde && iso < f.desde) return false;
      if (f.hasta && iso > f.hasta) return false;
    }
    return !q || [a.code, a.clienteRazon, a.clienteRuc, a.operacion, a.banco, a.ordenante].some(x => norm(x).indexOf(q) > -1);
  });
  const k = f.sort;
  return out.sort((a, b) => {
    let x = a[k] as unknown, y = b[k] as unknown;
    if (k === 'importe') { x = Number(x) || 0; y = Number(y) || 0; }
    if (x === null || x === undefined || x === '') return 1;
    if (y === null || y === undefined || y === '') return -1;
    return ((x as number) > (y as number) ? 1 : (x as number) < (y as number) ? -1 : 0) * f.dir;
  });
}

function StatusTabs(props: { list: Abono[]; f: Filters; set: (p: Partial<Filters>) => void }): React.ReactElement {
  const n = (e: string): number => props.list.filter(a => e === 'todos' || a.estado === e).length;
  const t: Array<[Filters['estado'], string, string]> = [['todos', 'Todos', 'var(--accent)'], ['Enviado', 'Enviados', 'var(--env-dot)'], ['Validado', 'Validados', 'var(--val-dot)'], ['Observado', 'Observados', 'var(--obs-dot)']];
  return (
    <div className="tabs" role="tablist" aria-label="Filtrar por estado">
      {t.map(([k, l, c]) => (
        <button type="button" role="tab" key={k} aria-selected={props.f.estado === k} className={props.f.estado === k ? 'on' : ''} onClick={() => props.set({ estado: k })}>
          <span className="dotc" style={{ background: c }} />{l}<span className="n">{n(k)}</span>
        </button>
      ))}
    </div>
  );
}

export function AbonosTable(props: { title: string; list: Abono[]; full: boolean; showVendor?: boolean; limit?: number; f: Filters; setF: (p: Partial<Filters>) => void }): React.ReactElement {
  const { go, clientes, abonos } = useApp();
  const { f, setF, full, list } = props;
  const rows = applyFilters(list, f, full);
  const shown = props.limit ? rows.slice(0, props.limit) : rows;
  const sh = (k: keyof Abono, l: string): React.ReactElement => (
    <button type="button" className={'sort ' + (f.sort === k ? 'on' : '')} onClick={() => setF(f.sort === k ? { dir: -f.dir } : { sort: k, dir: -1 })}>{l}<Icon n="sort" /></button>
  );
  const open = (a: Abono): void => go('detalle', a.code);
  const bancos = Array.from(new Set(abonos.map(a => a.banco).filter(Boolean))).sort();
  const vendedores = Array.from(new Map(abonos.map(a => [String(a.authorId), a.authorName] as [string, string])).entries());
  const search = (
    <label className="srch" style={{ flex: '1 1 240px', maxWidth: full ? undefined : 320 }}>
      <Icon n="search" /><input type="search" placeholder="Buscar código, cliente, RUC u operación" value={f.q} onChange={e => setF({ q: e.target.value })} aria-label="Buscar abonos" />
    </label>
  );
  return (
    <section className="card" style={{ overflow: 'hidden' }}>
      <div className="bar" style={{ justifyContent: 'space-between' }}>
        <h2 className="h2" style={{ marginRight: 'auto' }}>{props.title}</h2>
        {!full ? <><StatusTabs list={list} f={f} set={setF} />{search}</> : null}
      </div>
      {full ? (
        <div className="bar">
          {search}
          <select className="fsel" value={f.cliente} onChange={e => setF({ cliente: e.target.value })} aria-label="Cliente">
            <option value="">Cliente: todos</option>{clientes.map(c => <option key={c.id} value={c.ruc}>{c.razon}</option>)}
          </select>
          <select className="fsel" value={f.banco} onChange={e => setF({ banco: e.target.value })} aria-label="Banco">
            <option value="">Banco: todos</option>{bancos.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <select className="fsel" value={f.moneda} onChange={e => setF({ moneda: e.target.value })} aria-label="Moneda">
            <option value="">Moneda: todas</option><option value="PEN">Soles</option><option value="USD">Dólares</option>
          </select>
          {props.showVendor ? (
            <select className="fsel" value={f.vendedor} onChange={e => setF({ vendedor: e.target.value })} aria-label="Vendedor">
              <option value="">Vendedor: todos</option>{vendedores.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
            </select>
          ) : null}
          <label className="row" style={{ gap: 6, fontSize: 12.5 }}><span className="muted">Desde</span><input className="fsel" type="date" value={f.desde} onChange={e => setF({ desde: e.target.value })} /></label>
          <label className="row" style={{ gap: 6, fontSize: 12.5 }}><span className="muted">Hasta</span><input className="fsel" type="date" value={f.hasta} onChange={e => setF({ hasta: e.target.value })} /></label>
          <button type="button" className="btn btn-g btn-sm" onClick={() => setF({ ...emptyFilters(), estado: f.estado })}>Limpiar</button>
        </div>
      ) : null}
      {shown.length ? (
        <div className="tw">
          <table className="t">
            <thead>
              {full ? (
                <tr><th>Código</th><th>{sh('created', 'Fecha registro')}</th>{props.showVendor ? <th>Vendedor</th> : null}<th>Cliente</th><th>RUC</th><th>Banco</th><th>{sh('fecha', 'Fecha op.')}</th><th>N° operación</th><th className="num">{sh('importe', 'Importe')}</th><th>Estado</th>{props.showVendor ? <th>Responsable</th> : null}<th>{sh('modified', 'Últ. actualización')}</th></tr>
              ) : (
                <tr><th>Código</th><th>Cliente</th><th>RUC</th><th>{sh('fecha', 'Fecha')}</th><th>Banco</th><th>N° operación</th><th className="num">{sh('importe', 'Importe')}</th><th>Estado</th><th>{sh('created', 'Registro')}</th><th /></tr>
              )}
            </thead>
            <tbody>
              {shown.map(a => full ? (
                <tr key={a.id} onClick={() => open(a)}>
                  <td className="code">{a.code}</td><td className="mono" style={{ fontSize: 12 }}>{fmtTs(a.created)}</td>{props.showVendor ? <td>{a.authorName}</td> : null}
                  <td className="strong">{a.clienteRazon}</td><td className="op">{a.clienteRuc}</td><td>{a.banco}</td><td className="mono" style={{ fontSize: 12 }}>{fmtDate(a.fecha)}</td>
                  <td className="op">{a.operacion}</td><td className="amt">{money(a.importe, a.moneda)}</td><td><Badge e={a.estado} /></td>
                  {props.showVendor ? <td className={a.responsableName ? '' : 'muted'}>{a.responsableName || 'Sin asignar'}</td> : null}
                  <td className="muted" style={{ fontSize: 12 }}>{fmtTs(a.modified)}</td>
                </tr>
              ) : (
                <tr key={a.id} onClick={() => open(a)}>
                  <td className="code">{a.code}</td><td className="strong">{a.clienteRazon}</td><td className="op">{a.clienteRuc}</td><td>{fmtDate(a.fecha)}</td><td>{a.banco}</td>
                  <td className="op">{a.operacion}</td><td className="amt">{money(a.importe, a.moneda)}</td><td><Badge e={a.estado} /></td><td className="muted">{fmtTs(a.created)}</td>
                  <td><button type="button" className={'btn btn-sm ' + (a.estado === 'Observado' ? 'btn-bad' : 'btn-s')} onClick={e => { e.stopPropagation(); open(a); }}>{a.estado === 'Observado' ? 'Corregir' : 'Ver detalle'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : list.length ? (
        <Empty icon="search" title="Sin resultados" text="Ningún abono coincide con los filtros aplicados."><button type="button" className="btn btn-s btn-sm" onClick={() => setF(emptyFilters())}>Limpiar filtros</button></Empty>
      ) : (
        <Empty icon="file" title="Aún no hay abonos" text={props.showVendor ? 'Cuando el equipo comercial registre abonos, aparecerán aquí.' : 'Sube las fotos de tus vouchers y el registro se completa en menos de un minuto.'}>
          {!props.showVendor ? <button type="button" className="btn btn-p" onClick={() => go('nuevo')}><Icon n="add" />Registrar el primero</button> : null}
        </Empty>
      )}
      {shown.length ? (
        <div className="t-foot">
          <span>Mostrando {shown.length} de {rows.length} abonos</span>
          {props.limit && rows.length > props.limit ? <button type="button" className="btn btn-g btn-sm" onClick={() => go('mis')}>Ver todos mis abonos <Icon n="fwd" /></button> : null}
        </div>
      ) : null}
    </section>
  );
}

export function VLista(props: { bandeja: boolean }): React.ReactElement {
  const { abonos, meId, go } = useApp();
  const [f, set] = React.useState<Filters>(emptyFilters());
  React.useEffect(() => { set(emptyFilters()); }, [props.bandeja]);
  const setF = (p: Partial<Filters>): void => set(x => ({ ...x, ...p }));
  const list = props.bandeja ? abonos : abonos.filter(a => a.authorId === meId);
  const kb = (k: Filters['estado'], l: string, c: string): React.ReactElement => {
    const L = list.filter(a => k === 'todos' || a.estado === k);
    return (
      <button type="button" key={k} className={'card kpi ' + (f.estado === k ? 'on' : '')} onClick={() => setF({ estado: k })} aria-pressed={f.estado === k}>
        <div className="kpi-h"><span className="row" style={{ gap: 7 }}><span className="dotc" style={{ background: c }} />{l}</span></div>
        <div className="kpi-v">{L.length}</div>
        <div className="kpi-s mono">{sumTxt(sumBy(L))}</div>
      </button>
    );
  };
  return (
    <>
      <div className="between" style={{ alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h1 className="h1">{props.bandeja ? 'Bandeja de abonos' : 'Mis abonos'}</h1>
          <p style={{ margin: 0 }} className="muted">{props.bandeja ? 'Todos los abonos registrados por el equipo comercial.' : 'Historial de los abonos que registraste.'}</p>
        </div>
        <button type="button" className="btn btn-p btn-lg" onClick={() => go('nuevo')}><Icon n="add" />Registrar abonos</button>
      </div>
      <div className="kpis">{kb('todos', 'Todos', 'var(--accent)')}{kb('Enviado', 'Enviados', 'var(--env-dot)')}{kb('Validado', 'Validados', 'var(--val-dot)')}{kb('Observado', 'Observados', 'var(--obs-dot)')}</div>
      <AbonosTable title={props.bandeja ? 'Registros' : 'Tus registros'} list={list} full={true} showVendor={props.bandeja} f={f} setF={setF} />
    </>
  );
}
