import { Check, LockKeyhole, Waves } from 'lucide-react';
import { EmptyState, StatusBadge } from '../../components/ui';
import type { Availability } from '../../types/domain';
import { money, shortTime } from '../../utils/date';
import { alternatives } from './helpers';

export function LanePicker({ rows, selected, onSelect, disabled = false }: { rows: Availability[]; selected?: Availability | null; onSelect: (row: Availability) => void; disabled?: boolean }) {
  if (!rows.length) return <EmptyState title="No hay horarios para esta selección" description="Prueba otra fecha o piscina para encontrar tu próximo espacio de entrenamiento." />;
  return <div className="pool-map" aria-label="Selecciona un carril"><div className="pool-edge"><Waves size={18} /><span>Un carril completo para ti</span></div>{rows.map(row => {
    const active = row.lane_id === selected?.lane_id && row.time_slot_id === selected?.time_slot_id;
    const available = row.status === 'AVAILABLE' || (row.status === 'HELD' && row.is_mine);
    return <button key={`${row.time_slot_id}:${row.lane_id}`} type="button" className={`lane lane-${row.status.toLowerCase()} ${active ? 'lane-selected' : ''}`} aria-pressed={active} disabled={disabled || !available} onClick={() => onSelect(row)}><span className="lane-number">{String(row.number).padStart(2, '0')}</span><span className="lane-name">Carril {row.number}<span className="lane-track" aria-hidden="true" /></span><StatusBadge status={row.status} /><span className="lane-choice" aria-hidden="true">{active ? <Check size={17} /> : available ? <span /> : <LockKeyhole size={15} />}</span></button>;
  })}<div className="pool-edge bottom"><span>Selecciona un carril disponible para continuar</span></div></div>;
}

export function Alternatives({ rows, selected, onSelect }: { rows: Availability[]; selected?: Availability | null; onSelect: (row: Availability) => void }) {
  const options = alternatives(rows, selected);
  if (!options.length) return <p className="muted">No hay otras opciones disponibles para esta fecha. Prueba otro día.</p>;
  return <section className="alternatives"><h3>También puedes reservar</h3><p className="muted">Otros carriles, horarios cercanos y sedes con disponibilidad.</p><div className="alternative-list">{options.map(row => <button type="button" key={`${row.lane_id}:${row.time_slot_id}`} onClick={() => onSelect(row)}><span><strong>{row.venue_name}</strong><small>{row.pool_name} · Carril {row.number}</small></span><span>{shortTime(row.start_time)} – {shortTime(row.end_time)}<small>{money(row.price)}</small></span></button>)}</div></section>;
}
