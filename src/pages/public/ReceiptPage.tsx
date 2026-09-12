import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { bookingService } from '../../services/booking';
import { EmptyState, ErrorState, Loading } from '../../components/ui';
import { Receipt } from '../../features/booking/Receipt';
import { OtpForm } from '../../features/auth/OtpForm';

export function ReceiptPage() {
  const { code } = useParams(); const { user, loading } = useAuth();
  const query = useQuery({ queryKey: ['reservations', user?.id], queryFn: bookingService.reservations, enabled: !!user });
  const reservation = query.data?.find(row => row.reservation_code === code);
  return <div className="container public-section receipt-page"><Link to="/mis-reservas" className="back-link no-print">← Volver a mis reservas</Link>{loading ? <Loading /> : !user ? <section className="panel auth-panel"><h1>Consulta tu comprobante</h1><OtpForm /></section> : query.isPending ? <Loading /> : query.isError ? <ErrorState error={query.error} onRetry={() => { void query.refetch(); }} /> : reservation ? <Receipt reservation={reservation} /> : <EmptyState title="No encontramos este comprobante" description="Verifica que ingresaste con el correo de la reserva." />}</div>;
}
