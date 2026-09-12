import { useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { CheckCircle2, Download, Printer } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button, StatusBadge } from '../../components/ui';
import type { Reservation } from '../../types/domain';
import { formatDate, money, shortTime } from '../../utils/date';

export function Receipt({ reservation, confirmed = false }: { reservation: Reservation; confirmed?: boolean }) {
  const qr = useRef<HTMLDivElement>(null);
  function download() {
    const escaped = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
    const r = reservation;
    const document = `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Comprobante ${escaped(r.reservation_code)}</title><style>body{font:16px sans-serif;color:#0f172a;max-width:520px;margin:50px auto;padding:24px}dt{color:#475569;margin-top:18px}dd{margin:5px 0}svg{margin:25px 0}</style><h1>EMUSS · Comprobante</h1><h2>${escaped(r.reservation_code)}</h2>${qr.current?.innerHTML || ''}<dl><dt>Sede / piscina</dt><dd>${escaped(r.venue_name)} / ${escaped(r.pool_name)}</dd><dt>Fecha y horario (Lima)</dt><dd>${escaped(formatDate(r.date))}, ${shortTime(r.start_time)} – ${shortTime(r.end_time)}</dd><dt>Carril</dt><dd>${r.lane_number}</dd><dt>Tarifa</dt><dd>${money(r.price)}</dd><dt>Estado al descargar</dt><dd>${escaped(r.status)}</dd></dl><p>Presenta este código en recepción. Consulta el estado actualizado en Mis reservas.</p></html>`;
    const url = URL.createObjectURL(new Blob([document], { type: 'text/html;charset=utf-8' })); const link = window.document.createElement('a'); link.href = url; link.download = `${r.reservation_code}.html`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className="receipt panel"><div className="receipt-heading">{confirmed && <CheckCircle2 size={38} />}<p className="eyebrow">{confirmed ? 'Reserva confirmada' : 'Tu comprobante'}</p><h2>{reservation.reservation_code}</h2><StatusBadge status={reservation.status} /></div><div className="receipt-qr" ref={qr}><QRCodeSVG value={reservation.reservation_code} size={190} marginSize={3} level="M" title={`Código de reserva ${reservation.reservation_code}`} /></div><p className="muted center">Presenta este QR en recepción.</p><dl className="detail-list"><div><dt>Sede / piscina</dt><dd>{reservation.venue_name} · {reservation.pool_name}</dd></div><div><dt>Fecha</dt><dd>{formatDate(reservation.date)}</dd></div><div><dt>Horario</dt><dd>{shortTime(reservation.start_time)} – {shortTime(reservation.end_time)}</dd></div><div><dt>Carril</dt><dd>{reservation.lane_number}</dd></div><div><dt>Tarifa</dt><dd>{money(reservation.price)}</dd></div></dl><div className="row wrap no-print"><Button variant="secondary" onClick={download}><Download size={17} />Descargar comprobante</Button><Button variant="ghost" onClick={() => window.print()}><Printer size={17} />Imprimir</Button>{confirmed && <Link className="button button-primary" to="/mis-reservas">Mis reservas</Link>}</div></section>;
}
