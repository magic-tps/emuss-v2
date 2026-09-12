import { Link, NavLink, Outlet } from 'react-router-dom';
import { LogOut, Waves, ArrowUpRight } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Button, ErrorState } from './ui';

export function PublicLayout() {
  const { user, signOut } = useAuth(); const [error, setError] = useState<unknown>(null);
  return <div className="app"><a className="skip-link" href="#main-content">Ir al contenido</a><header className="site-header"><div className="container header-inner"><Link to="/" className="brand" aria-label="EMUSS, inicio"><span className="brand-symbol"><Waves size={28} /></span><span>EMUSS<small>COMPLEJOS ACUÁTICOS</small></span></Link><nav aria-label="Navegación principal"><NavLink to="/" end>Reservar carril</NavLink><NavLink to="/mis-reservas">Mis reservas</NavLink>{user && <Button variant="ghost" aria-label="Cerrar sesión" title="Cerrar sesión" onClick={() => { void signOut().catch(setError); }}><LogOut size={18} /></Button>}</nav></div></header>{error != null && <div className="container"><ErrorState error={error} /></div>}<main id="main-content"><Outlet /></main><footer className="site-footer container"><div className="row"><Waves size={21} /><strong>EMUSS</strong><span>Un espacio para tu bienestar.</span></div><Link to="/admin/login">Acceso al personal <ArrowUpRight size={14} /></Link><p>Horarios expresados en la hora de Lima, Perú.</p></footer></div>;
}
