import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState, ErrorState, Field, Input, Loading, Select } from '../../components/ui';
import { useAvailability, useCatalog } from '../../hooks/useAvailability';
import { bookingService } from '../../services/booking';
import type { Reservation } from '../../types/domain';
import { formatDate, money, shortTime, todayLima } from '../../utils/date';
import { bookingDateLimit } from './helpers';

export function RescheduleForm({ reservation, onSuccess }: { reservation: Reservation; onSuccess: () => void }) {
  const client = useQueryClient(); const [date, setDate] = useState(reservation.date < todayLima() ? todayLima() : reservation.date); const [venue, setVenue] = useState(reservation.venue_id); const [choice, setChoice] = useState('');
  const catalog = useCatalog(); const availability = useAvailability(date);
  const rows = (availability.data || []).filter(row => row.venue_id === venue && row.status === 'AVAILABLE' && Date.parse(row.starts_at) > Date.now());
  const selected = rows.find(row => `${row.lane_id}:${row.time_slot_id}` === choice);
  const mutation = useMutation({ mutationFn: () => bookingService.reschedule(reservation.id, selected!.lane_id, selected!.time_slot_id), onSuccess: () => { void client.invalidateQueries({ queryKey: ['reservations'] }); void client.invalidateQueries({ queryKey: ['availability'] }); onSuccess(); }, onError: () => { void availability.refetch(); } });
  return <div className="stack"><p className="muted">Actual: {formatDate(reservation.date)} · {shortTime(reservation.start_time)} · {reservation.venue_name}, carril {reservation.lane_number}. Tu reserva actual se conserva si el cambio no se completa.</p>{catalog.isError && <ErrorState error={catalog.error} onRetry={() => { void catalog.refetch(); }} />}<div className="grid-2"><Field label="Nueva fecha"><Input type="date" value={date} min={todayLima()} max={catalog.data ? bookingDateLimit(todayLima(), catalog.data.settings.booking_days) : undefined} onChange={event => { if (event.target.value) { setDate(event.target.value); setChoice(''); } }} /></Field><Field label="Sede"><Select value={venue} onChange={event => { setVenue(event.target.value); setChoice(''); }}>{catalog.data?.venues.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field></div>{availability.isPending ? <Loading /> : availability.isError ? <ErrorState error={availability.error} onRetry={() => { void availability.refetch(); }} /> : !rows.length ? <EmptyState title="No hay carriles disponibles" description="Prueba otra sede o fecha." /> : <Field label="Nuevo horario y carril"><Select value={selected ? choice : ''} onChange={event => setChoice(event.target.value)}><option value="">Elige una opción disponible</option>{rows.map(row => <option value={`${row.lane_id}:${row.time_slot_id}`} key={`${row.lane_id}:${row.time_slot_id}`}>{shortTime(row.start_time)} – {shortTime(row.end_time)} · {row.pool_name} · Carril {row.number} · {money(row.price)}</option>)}</Select></Field>}{mutation.isError && <ErrorState error={mutation.error} />}<Button disabled={!selected} loading={mutation.isPending} onClick={() => mutation.mutate()}>Confirmar reprogramación</Button></div>;
}
