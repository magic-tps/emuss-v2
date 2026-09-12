import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, NavLink, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { Activity, ArrowUpRight, Building2, CalendarCheck, ChartNoAxesCombined, ClipboardList, DoorOpen, LayoutDashboard, LogOut, Menu, Settings2, ShieldCheck, Users, Waves, Wrench, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Field, Input, Loading } from '../../components/ui';
import { useAuth } from '../../hooks/useAuth';
import { supabase, isConfigured } from '../../lib/supabase';
import { Notice, roleNames, usePermissions } from './common';
import { DashboardPage } from './DashboardPage';
import { ReservationsPage } from './ReservationsPage';
import { CheckInPage } from './CheckInPage';
import { ControlPage, MaintenancePage } from './ControlPage';
import { CatalogPage, SettingsPage } from './SettingsPage';
import { UsersPage, StaffPage, AuditPage } from './PeoplePages';
import '../../admin.css';
import { PasswordPage } from './PasswordPage';

function AdminLogin() {
  const auth = useAuth(); const { roles } = usePermissions();
  const [error, setError] = useState<unknown>(); const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); setPending(true); setError(undefined);
    try { const result = await supabase.auth.signInWithPassword({ email: String(data.get('email')).trim(), password: String(data.get('password')) }); if (result.error) throw result.error; } catch (reason) { setError(reason); } finally { setPending(false); }
  }
  if (auth.loading) return <Loading />;
  if (auth.user && roles.length) return <Navigate to="/admin/dashboard" replace />;
  return <main className="admin-login"><section className="admin-login-brand"><NavLink to="/" className="admin-brand"><Waves size={32} /><span>EMUSS<small>RED DE PISCINAS</small></span></NavLink><div><span className="admin-eyebrow">CENTRAL DE OPERACIONES</span><h1>Una red.<br />Todo bajo control.</h1><p>Reservas, asistencia y disponibilidad de nuestras piscinas, en un solo lugar.</p></div><p className="admin-login-note"><ShieldCheck size={19} /> Acceso exclusivo para personal autorizado</p></section><section className="admin-login-form"><div className="admin-login-inner"><p className="kicker">EMUSS ADMIN</p><h2>Bienvenido al equipo</h2><p className="muted">Ingresa con tu cuenta de trabajo.</p>{!isConfigured && <div className="admin-notice error">El servicio todavía no está configurado. Contacta al administrador del sistema.</div>}<Notice error={error || auth.rolesError} />{auth.user ? <div className="stack"><p>Tu cuenta no tiene un rol administrativo activo.</p><Button loading={pending} onClick={() => { setPending(true); void auth.signOut().catch(setError).finally(() => setPending(false)); }}>Usar otra cuenta</Button></div> : <form className="stack" onSubmit={event => void submit(event)}><Field label="Correo de trabajo"><Input name="email" type="email" autoComplete="username" required placeholder="nombre@emuss.pe" /></Field><Field label="Contraseña"><Input name="password" type="password" autoComplete="current-password" required minLength={8} /></Field><Button type="submit" loading={pending} disabled={!isConfigured}>Ingresar al panel <ArrowUpRight size={17} /></Button></form>}<div className="admin-login-links"><NavLink className="admin-back-link" to="/admin/recover">Olvidé mi contraseña</NavLink><NavLink className="admin-back-link" to="/">Volver a reservas públicas</NavLink></div></div></section></main>;
}

function AdminLayout() {
  const auth = useAuth(); const permissions = usePermissions(); const location = useLocation(); const client = useQueryClient();
  const [open, setOpen] = useState(false); const [error, setError] = useState<unknown>();
  useEffect(() => {
    if (!isConfigured || !auth.user) return;
    const channel = supabase.channel(`admin-events:${auth.user.id}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'availability_events' }, () => { void client.invalidateQueries({ queryKey: ['admin'] }); }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [auth.user, client]);
  if (auth.loading) return <Loading />;
  if (!auth.user) return <Navigate to="/admin/login" replace />;
  if (!permissions.roles.length) return <Navigate to="/admin/login" replace />;
  const navigation = [
    { to: 'dashboard', title: 'Resumen', icon: LayoutDashboard, show: permissions.manage },
    { to: 'reservations', title: 'Reservas', icon: CalendarCheck, show: true },
    { to: 'check-in', title: 'Check-in', icon: DoorOpen, show: true },
    { to: 'control', title: 'Control de piscina', icon: Waves, show: permissions.manage },
    { to: 'maintenance', title: 'Mantenimiento', icon: Wrench, show: permissions.manage },
    { to: 'reports', title: 'Reportes', icon: ChartNoAxesCombined, show: permissions.manage },
    { to: 'users', title: 'Clientes', icon: Users, show: permissions.manage },
    { to: 'venues', title: 'Sedes', icon: Building2, show: permissions.superAdmin },
    { to: 'pools', title: 'Piscinas', icon: Waves, show: permissions.manage },
    { to: 'lanes', title: 'Carriles', icon: Activity, show: permissions.manage },
    { to: 'staff', title: 'Equipo', icon: ShieldCheck, show: permissions.superAdmin },
    { to: 'audit', title: 'Auditoría', icon: ClipboardList, show: permissions.superAdmin },
    { to: 'settings', title: 'Configuración', icon: Settings2, show: permissions.manage },
  ];
  const role = permissions.superAdmin ? 'SUPER_ADMIN' : permissions.manage ? 'VENUE_ADMIN' : 'RECEPTIONIST';
  return <div className="admin-shell">{open && <button className="admin-nav-scrim" aria-label="Cerrar navegación" onClick={() => setOpen(false)} />}<aside className={`admin-sidebar ${open ? 'is-open' : ''}`}><NavLink to="/admin/dashboard" className="admin-brand"><Waves size={30} /><span>EMUSS<small>ADMINISTRACIÓN</small></span></NavLink><Button className="admin-mobile-close" variant="ghost" onClick={() => setOpen(false)} aria-label="Cerrar menú"><X size={21} /></Button><p className="admin-nav-label">OPERACIONES</p><nav aria-label="Administración">{navigation.filter(item => item.show).map(({ to, title, icon: Icon }) => <NavLink key={to} to={`/admin/${to}`} onClick={() => setOpen(false)}><Icon size={18} /><span>{title}</span></NavLink>)}</nav><div className="admin-sidebar-bottom"><span className="admin-avatar">{auth.user.email?.slice(0, 2).toUpperCase()}</span><div><strong>{roleNames[role]}</strong><span title={auth.user.email}>{auth.user.email}</span></div><Button variant="ghost" aria-label="Cerrar sesión" onClick={() => void auth.signOut().catch(setError)}><LogOut size={18} /></Button></div></aside><div className="admin-workspace"><header className="admin-topbar"><div className="row"><Button variant="ghost" className="admin-menu-button" aria-label="Abrir menú" onClick={() => setOpen(true)}><Menu size={22} /></Button><span className="admin-breadcrumb">Administración <span>/</span> <strong>{navigation.find(item => location.pathname.startsWith(`/admin/${item.to}`))?.title || 'Operaciones'}</strong></span></div><NavLink to="/" className="admin-public-link">Portal de reservas <ArrowUpRight size={16} /></NavLink></header><main className="admin-main"><Notice error={error} /><Outlet /></main><footer className="admin-footer">EMUSS · Gestión de piscinas <span>Zona horaria: Lima (UTC−5)</span></footer></div></div>;
}
function Guard({ superOnly = false }: { superOnly?: boolean }) { const permissions = usePermissions(); return (superOnly ? permissions.superAdmin : permissions.manage) ? <Outlet /> : <Navigate to="/admin/reservations" replace />; }
export function AdminRoutes() {
  return <Routes><Route path="set-password" element={<PasswordPage />} /><Route path="recover" element={<PasswordPage recovery />} /><Route path="login" element={<AdminLogin />} /><Route element={<AdminLayout />}><Route index element={<Navigate to="dashboard" replace />} /><Route path="reservations" element={<ReservationsPage />} /><Route path="check-in" element={<CheckInPage />} /><Route element={<Guard />}><Route path="dashboard" element={<DashboardPage />} /><Route path="reports" element={<DashboardPage reports />} /><Route path="control" element={<ControlPage />} /><Route path="maintenance" element={<MaintenancePage />} /><Route path="pools" element={<CatalogPage entity="pools" />} /><Route path="lanes" element={<CatalogPage entity="lanes" />} /><Route path="users" element={<UsersPage />} /><Route path="settings" element={<SettingsPage />} /></Route><Route element={<Guard superOnly />}><Route path="venues" element={<CatalogPage entity="venues" />} /><Route path="staff" element={<StaffPage />} /><Route path="audit" element={<AuditPage />} /></Route><Route path="*" element={<Navigate to="/admin/dashboard" replace />} /></Route></Routes>;
}
