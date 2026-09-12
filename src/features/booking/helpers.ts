import type { Availability } from '../../types/domain';

export function bookingDateLimit(today: string, days: number) {
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function alternatives(rows: Availability[], selected?: Availability | null) {
  const available = rows.filter(row => row.status === 'AVAILABLE' && Date.parse(row.starts_at) > Date.now() && !(row.lane_id === selected?.lane_id && row.time_slot_id === selected?.time_slot_id));
  const rank = (row: Availability) => !selected ? 0 : row.time_slot_id === selected.time_slot_id ? 0 : row.venue_id === selected.venue_id ? 1 : 2;
  return available.sort((a, b) => rank(a) - rank(b) || Math.abs(Date.parse(a.starts_at) - Date.parse(selected?.starts_at || a.starts_at)) - Math.abs(Date.parse(b.starts_at) - Date.parse(selected?.starts_at || b.starts_at)) || a.number - b.number).slice(0, 6);
}
