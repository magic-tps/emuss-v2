import { Route, Routes, Link } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { PublicLayout } from './components/PublicLayout';
import { Loading } from './components/ui';
import { BookingPage } from './pages/public/BookingPage';
import { ReservationsPage } from './pages/public/ReservationsPage';
import { ReceiptPage } from './pages/public/ReceiptPage';
const AdminRoutes = lazy(() => import('./pages/admin/AdminRoutes').then(module => ({ default: module.AdminRoutes })));

export function App() {
  return <Routes><Route element={<PublicLayout />}><Route index element={<BookingPage />} /><Route path="mis-reservas" element={<ReservationsPage />} /><Route path="reserva/:code" element={<ReceiptPage />} /><Route path="*" element={<div className="container public-section"><h1>Esta página no está disponible</h1><p>Vuelve al inicio para encontrar tu carril.</p><Link to="/" className="button button-primary">Ir al inicio</Link></div>} /></Route><Route path="admin/*" element={<Suspense fallback={<Loading label="Cargando administración…" />}><AdminRoutes /></Suspense>} /></Routes>;
}
