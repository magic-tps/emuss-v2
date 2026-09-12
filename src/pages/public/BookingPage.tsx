import { useCallback, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CalendarDays, MapPin, ShieldCheck, Waves } from 'lucide-react';
import { Button, EmptyState, ErrorState, Field, Input, Loading, Select, StatusBadge } from '../../components/ui';
import { useAuth } from '../../hooks/useAuth';
import { useAvailability, useCatalog } from '../../hooks/useAvailability';
import { bookingService } from '../../services/booking';
import type { Availability, BookingProfile, Hold, Reservation } from '../../types/domain';
import { formatDate, money, shortTime, todayLima } from '../../utils/date';
import { OtpForm } from '../../features/auth/OtpForm';
import { LanePicker, Alternatives } from '../../features/booking/LanePicker';
import { BookingForm } from '../../features/booking/BookingForm';
import { HoldCountdown } from '../../features/booking/HoldCountdown';
import { Receipt } from '../../features/booking/Receipt';
import { bookingDateLimit } from '../../features/booking/helpers';

export function BookingPage() {
  const { user, loading: authLoading } = useAuth(); const client = useQueryClient();
  const [date, setDate] = useState(todayLima); const [venueId, setVenue] = useState(''); const [poolId, setPool] = useState(''); const [slotId, setSlot] = useState('');
  const [selected, setSelected] = useState<Availability | null>(null); const [showAuth, setShowAuth] = useState(false); const [confirmed, setConfirmed] = useState<Reservation | null>(null); const [actionError, setActionError] = useState<unknown>(null);
  const [expiredHoldId, setExpiredHoldId] = useState<string | null>(null);
  const catalog = useCatalog(); const availability = useAvailability(date);
  const holds = useQuery({ queryKey: ['holds', user?.id], queryFn: bookingService.holds, enabled: !!user, refetchInterval: 15_000 });
  const profile = useQuery({ queryKey: ['profile', user?.id], queryFn: bookingService.profile, enabled: !!user });
  const hold = user ? holds.data?.[0] : undefined;
  const heldRow = availability.data?.find(row => row.lane_id === hold?.lane_id && row.time_slot_id === hold?.time_slot_id);
  const choice = heldRow || selected;
  const venue = catalog.data?.venues.find(item => item.id === (heldRow?.venue_id || venueId)) || catalog.data?.venues[0];
  const pools = catalog.data?.pools.filter(item => item.venue_id === venue?.id) || [];
  const pool = pools.find(item => item.id === (heldRow?.pool_id || poolId)) || pools[0];
  const rows = (availability.data || []).filter(row => row.pool_id === pool?.id && Date.parse(row.starts_at) > Date.now());
  const slots = [...new Map(rows.map(row => [row.time_slot_id, row])).values()].sort((a, b) => a.start_time.localeCompare(b.start_time));
  const slot = slots.find(item => item.time_slot_id === (heldRow?.time_slot_id || slotId)) || slots[0];
  const laneRows = rows.filter(row => row.time_slot_id === slot?.time_slot_id);
  const selectedCurrent = availability.data?.find(row => row.lane_id === selected?.lane_id && row.time_slot_id === selected?.time_slot_id);
  const unavailable = !!selectedCurrent && selectedCurrent.status !== 'AVAILABLE' && !selectedCurrent.is_mine;

  useEffect(() => { if (hold?.date && hold.date !== date) setDate(hold.date); }, [hold?.date, date]);
  const refresh = useCallback(() => { void client.invalidateQueries({ queryKey: ['availability'] }); void client.invalidateQueries({ queryKey: ['holds'] }); void client.invalidateQueries({ queryKey: ['reservations'] }); }, [client]);
  const expire = useCallback(() => { if (hold) setExpiredHoldId(hold.id); if (heldRow) setSelected(heldRow); setActionError(new Error('HOLD_EXPIRED')); refresh(); }, [refresh, hold, heldRow]);
  const acquire = useMutation({ mutationFn: (row: Availability) => bookingService.acquire(row.lane_id, row.time_slot_id), onSuccess: (value: Hold) => { client.setQueryData(['holds', user?.id], [value]); setActionError(null); refresh(); }, onError: error => { setActionError(error); refresh(); } });
  const release = useMutation({ mutationFn: () => bookingService.release(hold!.id), onSuccess: () => { client.setQueryData(['holds', user?.id], []); setSelected(null); setActionError(null); refresh(); }, onError: setActionError });
  const confirm = useMutation({ mutationFn: (data: BookingProfile) => bookingService.confirm(hold!.id, data), onSuccess: reservation => { setConfirmed(reservation); setSelected(null); client.setQueryData(['holds', user?.id], []); refresh(); }, onError: error => { setActionError(error); refresh(); } });
  function choose(row: Availability) {
    if (hold || acquire.isPending || availability.isPending || availability.isError || (user && (holds.isPending || holds.isError))) return;
    if (Date.parse(row.starts_at) <= Date.now()) { setActionError(new Error('INVALID_SLOT')); refresh(); return; }
    setSelected(row); setVenue(row.venue_id); setPool(row.pool_id); setSlot(row.time_slot_id); setActionError(null);
    if (user) acquire.mutate(row); else setShowAuth(false);
  }
  function clearChoice() { setSelected(null); setActionError(null); setShowAuth(false); }
  if (confirmed && confirmed.user_id === user?.id) return <div className="container public-section receipt-page"><Receipt reservation={confirmed} confirmed /><Button variant="ghost" onClick={() => setConfirmed(null)}>Hacer otra reserva</Button></div>;
  return <div className="container public-section"><header className="booking-intro"><div><p className="eyebrow"><span />TU PRÓXIMO MOMENTO EN EL AGUA</p><h1>Reserva tu carril<span>.</span></h1><p>Elige tu sede, encuentra tu horario y disfruta de un carril completo para ti.</p></div><div className="intro-note"><ShieldCheck size={22} /><span>Una reserva, un carril<br /><strong>Confirmación con código QR</strong></span></div></header>
    <ol className="booking-steps" aria-label="Pasos de reserva"><li className={!hold ? 'current' : 'done'}><span>1</span>Elige tu carril</li><li className={hold ? 'current' : ''}><span>2</span>Completa tus datos</li><li><span>3</span>Recibe tu QR</li></ol>
    {catalog.isPending ? <Loading label="Cargando sedes y piscinas…" /> : catalog.isError ? <ErrorState error={catalog.error} onRetry={() => { void catalog.refetch(); }} /> : !catalog.data.venues.length ? <EmptyState title="Próximamente podrás reservar" description="Las sedes publicarán aquí sus piscinas y horarios disponibles." /> : <>
      <section className="booking-filters panel" aria-label="Filtros de disponibilidad"><Field label="Fecha"><Input type="date" value={date} min={todayLima()} max={bookingDateLimit(todayLima(), catalog.data.settings.booking_days)} disabled={!!hold || acquire.isPending} onChange={event => { if (event.target.value) { setDate(event.target.value); setSlot(''); clearChoice(); } }} /></Field><Field label="Sede"><Select value={venue?.id || ''} disabled={!!hold || acquire.isPending} onChange={event => { setVenue(event.target.value); setPool(''); setSlot(''); clearChoice(); }}>{catalog.data.venues.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field><Field label="Piscina"><Select value={pool?.id || ''} disabled={!!hold || acquire.isPending} onChange={event => { setPool(event.target.value); setSlot(''); clearChoice(); }}>{!pools.length && <option value="">Sin piscinas activas</option>}{pools.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field><Field label="Horario"><Select value={slot?.time_slot_id || ''} disabled={!!hold || acquire.isPending || availability.isPending} onChange={event => { setSlot(event.target.value); clearChoice(); }}>{!slots.length && <option value="">Sin horarios</option>}{slots.map(item => <option key={item.time_slot_id} value={item.time_slot_id}>{shortTime(item.start_time)} – {shortTime(item.end_time)}</option>)}</Select></Field></section>
      <div className="booking-layout"><section className="availability-section"><div className="section-heading"><div><h2>{pool?.name || 'Piscina'}</h2><p className="muted"><MapPin size={15} />{venue?.name}{venue?.address ? ` · ${venue.address}` : ''}</p></div><span className="live-indicator">{availability.isError ? 'Sin conexión' : availability.isFetching ? 'Actualizando…' : 'Disponibilidad en vivo'}</span></div>{availability.isPending ? <Loading label="Consultando carriles…" /> : availability.isError ? <ErrorState error={availability.error} onRetry={() => { void availability.refetch(); }} /> : <LanePicker rows={laneRows} selected={choice} onSelect={choose} disabled={!!hold || acquire.isPending || authLoading || (!!user && (holds.isPending || holds.isError))} />}<div className="lane-legend" aria-label="Estados del carril">{['AVAILABLE', 'HELD', 'RESERVED', 'CHECKED_IN', 'MAINTENANCE'].map(status => <StatusBadge key={status} status={status} />)}</div>{!hold && !availability.isError && !availability.isPending && (unavailable || actionError || !laneRows.some(row => row.status === 'AVAILABLE')) ? <Alternatives rows={availability.data || []} selected={choice || slot} onSelect={choose} /> : null}</section>
      <aside className="booking-summary panel" aria-label="Resumen de tu reserva"><p className="eyebrow">TU RESERVA</p>{choice ? <><h2>Carril {choice.number}</h2><dl className="detail-list"><div><dt>Sede</dt><dd>{choice.venue_name}</dd></div><div><dt>Piscina</dt><dd>{choice.pool_name}</dd></div><div><dt>Fecha</dt><dd>{formatDate(choice.date)}</dd></div><div><dt>Horario</dt><dd>{shortTime(choice.start_time)} – {shortTime(choice.end_time)}</dd></div><div className="summary-price"><dt>Tarifa</dt><dd>{money(choice.price)}</dd></div></dl></> : <div className="summary-placeholder"><Waves size={35} /><h3>Tu espacio te espera</h3><p>Selecciona un carril en la piscina para ver el detalle y continuar.</p></div>}
      {user && holds.isError && <ErrorState error={holds.error} onRetry={() => { void holds.refetch(); }} />}
      {hold ? <div className="stack"><HoldCountdown key={hold.id} hold={hold} receivedAt={holds.dataUpdatedAt} onExpire={expire} />{profile.isPending ? <Loading label="Cargando tus datos…" /> : profile.isError ? <ErrorState error={profile.error} onRetry={() => { void profile.refetch(); }} /> : <BookingForm key={`${hold.id}:${user?.id}`} profile={profile.data || null} email={user?.email || ''} busy={confirm.isPending} expired={expiredHoldId === hold.id || Date.parse(hold.expires_at) <= Date.parse(hold.server_now)} error={actionError} onConfirm={data => confirm.mutate(data)} />}<Button variant="ghost" loading={release.isPending} disabled={confirm.isPending} onClick={() => release.mutate()}>Liberar y cambiar carril</Button></div> : choice ? <div className="stack">{actionError != null && <ErrorState error={actionError} />}{!user && showAuth ? <OtpForm /> : <Button loading={acquire.isPending || authLoading} disabled={unavailable || availability.isPending || availability.isError || (!!user && (holds.isPending || holds.isError))} onClick={() => { if (user) acquire.mutate(choice); else setShowAuth(true); }}>Reservar este carril<ArrowRight size={18} /></Button>}<p className="privacy-note"><CalendarDays size={16} />Tendrás 5 minutos para confirmar después de verificar tu correo.</p></div> : null}</aside></div>
      <div className="booking-policy"><ShieldCheck size={19} /><p>Una reserva, un carril. Puedes cancelar hasta {catalog.data.settings.cancellation_hours} horas antes del inicio.{catalog.data.settings.reschedule_enabled ? ' La reprogramación está disponible dentro del mismo plazo.' : ''}</p></div>
    </>}
  </div>;
}
