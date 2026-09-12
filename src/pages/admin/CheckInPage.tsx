import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { IScannerControls } from '@zxing/browser';
import { Camera, CameraOff, CheckCircle2, ScanLine, Search } from 'lucide-react';
import { Button, Field, Input, StatusBadge } from '../../components/ui';
import { admin } from '../../services/admin';
import { shortTime, formatDate } from '../../utils/date';
import { AdminHeading, dateTime, Notice, useRefreshAdmin } from './common';
import type { Reservation } from '../../types/domain';

function QrScanner({ onRead, onStop }: { onRead: (text: string) => void; onStop: () => void }) {
  const video = useRef<HTMLVideoElement>(null); const [error, setError] = useState<string>(''); const callback = useRef(onRead); callback.current = onRead;
  useEffect(() => {
    let stopped = false; let controls: IScannerControls | undefined; let detected = false;
    async function start() {
      try { const { BrowserQRCodeReader } = await import('@zxing/browser'); if (stopped || !video.current) return; const reader = new BrowserQRCodeReader(); controls = await reader.decodeFromVideoDevice(undefined, video.current, result => { if (result && !stopped && !detected) { detected = true; callback.current(result.getText()); } }); if (stopped) controls.stop(); }
      catch { if (!stopped) setError('No pudimos acceder a la cámara. Revisa el permiso del navegador o ingresa el código manualmente.'); }
    }
    void start(); return () => { stopped = true; controls?.stop(); };
  }, []);
  return <div className="admin-camera"><video ref={video} muted playsInline aria-label="Vista de la cámara para escanear QR" /><div className="admin-camera-target" aria-hidden="true"><ScanLine size={64} /></div>{error && <div className="admin-notice error" role="alert">{error}</div>}<Button variant="secondary" onClick={onStop}><CameraOff size={17} /> Cerrar cámara</Button></div>;
}
export function CheckInPage() {
  const [camera, setCamera] = useState(false); const [code, setCode] = useState(''); const [reservation, setReservation] = useState<Reservation | null>(null); const refresh = useRefreshAdmin();
  const lookup = useMutation({ mutationFn: (value: string) => admin.lookup(value.trim().toUpperCase()), onSuccess: setReservation });
  const checkIn = useMutation({ mutationFn: () => admin.checkIn(reservation!.reservation_code), onSuccess: result => { setReservation(result); void refresh(); } });
  function search(value: string) { setReservation(null); checkIn.reset(); lookup.mutate(value); }
  function submit(event: FormEvent) { event.preventDefault(); search(code); }
  return <div className="admin-page"><AdminHeading title="Recepción y check-in" description="Valida el código de la reserva y registra la llegada del nadador." /><div className="admin-checkin-grid"><section className="panel admin-checkin-search"><span className="admin-feature-icon"><ScanLine size={27} /></span><h2>Escanear una reserva</h2><p className="muted">El QR contiene únicamente el código de reserva.</p>{camera ? <QrScanner onStop={() => setCamera(false)} onRead={value => { setCamera(false); setCode(value); search(value); }} /> : <Button variant="secondary" onClick={() => setCamera(true)}><Camera size={18} /> Activar cámara</Button>}<div className="admin-divider"><span>o ingresa el código</span></div><form className="stack" onSubmit={submit}><Field label="Código de reserva"><Input value={code} onChange={event => setCode(event.target.value.toUpperCase())} placeholder="EMUSS-X7D8K2" autoCapitalize="characters" autoComplete="off" required maxLength={80} /></Field><Button type="submit" loading={lookup.isPending}><Search size={17} /> Buscar reserva</Button></form><Notice error={lookup.error} /></section><section className="panel admin-checkin-result">{!reservation ? <div className="admin-empty"><CalendarTicket /><h2>{lookup.isPending ? 'Buscando la reserva…' : 'Listo para recibir'}</h2><p className="muted">Escanea el QR o busca un código para consultar los datos y confirmar el ingreso.</p></div> : <><div className="admin-section-heading"><p className="kicker">{reservation.reservation_code}</p><StatusBadge status={reservation.status} /></div><h2>{reservation.first_name} {reservation.last_name}</h2><p className="muted">DNI {reservation.dni_masked}</p><div className="admin-checkin-ticket"><WavesLabel /><div><strong>{reservation.venue_name}</strong><span>{reservation.pool_name}</span></div><span className="admin-checkin-lane">C{reservation.lane_number}</span></div><dl className="admin-detail-grid"><div><dt>Fecha</dt><dd>{formatDate(reservation.date)}</dd></div><div><dt>Horario</dt><dd>{shortTime(reservation.start_time)} – {shortTime(reservation.end_time)}</dd></div></dl><Notice error={checkIn.error} success={checkIn.isSuccess ? 'Ingreso registrado. ¡Bienvenido a la piscina!' : undefined} />{reservation.status === 'CONFIRMED' ? <Button loading={checkIn.isPending} onClick={() => checkIn.mutate()}><CheckCircle2 size={18} /> Confirmar check-in</Button> : <p className="admin-insight">{reservation.checked_in_at ? `Ingreso registrado: ${dateTime(reservation.checked_in_at)}` : 'Esta reserva no está habilitada para check-in.'}</p>}<Button variant="ghost" onClick={() => { setReservation(null); setCode(''); checkIn.reset(); lookup.reset(); }}>Buscar otra reserva</Button></>}</section></div></div>;
}
function CalendarTicket() { return <ScanLine size={46} strokeWidth={1.2} />; }
function WavesLabel() { return <span className="admin-feature-icon"><ScanLine size={22} /></span>; }
