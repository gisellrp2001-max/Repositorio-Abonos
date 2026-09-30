/* Configuración: diagnóstico de listas y columnas mapeadas (visible para administradores del sitio). */
import * as React from 'react';
import { ABONO_LABELS } from '../../model';
import { useApp } from '../ctx';
import { Icon } from '../ui';

const CLI_LABELS: Record<string, string> = { razon: 'Razón social', ruc: 'RUC', vendedor: 'Vendedor asignado', estado: 'Estado' };

export function VConfig(props: { mappingError: string }): React.ReactElement {
  const { diag, sp, ocr, isG } = useApp();
  if (!diag) return <div className="card pad">Cargando…</div>;
  const cfg = sp.cfg;
  const row = (label: string, col: string, found: boolean, type: string): React.ReactElement => (
    <tr key={label + col}>
      <td>{label}</td><td className="op">{col || '—'}</td><td className="muted">{type || '—'}</td>
      <td>{found ? <span className="b b-val"><i />Encontrada</span> : col ? <span className="b b-obs"><i />No existe</span> : <span className="b b-neu"><i />Sin asignar</span>}</td>
    </tr>
  );
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}><h1 className="h1">Configuración</h1><p className="muted" style={{ margin: 0 }}>Revisa que la app encuentre tus listas y columnas. Los cambios se hacen en el panel de propiedades del web part (Editar página › Editar web part).</p></div>
      {props.mappingError ? <div className="alert obs"><span className="a-ic"><Icon n="alert" /></span><p>{props.mappingError}</p></div> : null}
      {diag.listErrors.length ? <div className="alert obs"><span className="a-ic"><Icon n="alert" /></span><div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>{diag.listErrors.map(e => <p key={e}>{e}</p>)}</div></div>
        : <div className="alert ok"><span className="a-ic"><Icon n="checkc" /></span><p>Listas y biblioteca encontradas.</p></div>}
      <div className="kpis" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <div className="card kpi"><span className="lbl">Lista de abonos</span><b>{cfg.listaAbonos}</b></div>
        <div className="card kpi"><span className="lbl">Lista de clientes</span><b>{cfg.listaClientes}</b></div>
        <div className="card kpi"><span className="lbl">Historial</span><b>{cfg.listaHistorial}</b><span className="kpi-s">{diag.historial ? 'Listo' : 'Revisar'}</span></div>
        <div className="card kpi"><span className="lbl">Biblioteca de vouchers</span><b>{cfg.biblioteca}</b><span className="kpi-s">{diag.biblioteca ? 'Lista' : 'No encontrada'}</span></div>
        <div className="card kpi"><span className="lbl">Grupo de Gestión</span><b>{cfg.grupoGestion}</b><span className="kpi-s">Tú: {isG ? 'Gestión' : 'Vendedor'}</span></div>
        <div className="card kpi"><span className="lbl">Lectura automática</span><b>{ocr.enabled ? 'Configurada' : 'Sin configurar'}</b><span className="kpi-s" style={{ overflowWrap: 'anywhere' }}>{cfg.ocrUrl || 'Agrega la URL de la función'}</span></div>
      </div>
      <section className="card" style={{ overflow: 'hidden' }}>
        <div className="bar"><h2 className="h2">Columnas de “{cfg.listaAbonos}”</h2></div>
        <div className="tw"><table className="t"><thead><tr><th>Dato</th><th>Columna (nombre interno)</th><th>Tipo</th><th>Estado</th></tr></thead>
          <tbody>{diag.abonos.map(r => row(ABONO_LABELS[r.key] || r.key, r.column, r.found, r.type))}</tbody></table></div>
      </section>
      <section className="card" style={{ overflow: 'hidden' }}>
        <div className="bar"><h2 className="h2">Columnas de “{cfg.listaClientes}”</h2></div>
        <div className="tw"><table className="t"><thead><tr><th>Dato</th><th>Columna (nombre interno)</th><th>Tipo</th><th>Estado</th></tr></thead>
          <tbody>{diag.clientes.map(r => row(CLI_LABELS[r.key] || r.key, r.column, r.found, r.type))}</tbody></table></div>
      </section>
      <p className="note">Para cambiar a qué columna va cada dato, edita “Mapeo de columnas (JSON)” en el panel del web part. Usa el nombre interno de la columna (el que aparece en la URL al editarla, después de “Field=”).</p>
    </>
  );
}
