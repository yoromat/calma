// src/components/Layout.tsx
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getMyProfile } from '../lib/api';
import { KARMA_TIERS } from '../types/database';

export function Layout() {
  const [karma, setKarma] = useState<number>(100);
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    let cancelled = false;
    getMyProfile().then((p) => {
      if (!cancelled && p) setKarma(p.karma_score ?? 100);
    });
    return () => { cancelled = true; };
  }, [location.pathname]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ karma: number }>).detail;
      if (detail && typeof detail.karma === 'number') {
        setKarma(detail.karma);
      }
    };
    window.addEventListener('karma-updated', handler);
    return () => window.removeEventListener('karma-updated', handler);
  }, []);

  const tier = KARMA_TIERS.find(t => karma >= t.min) ?? KARMA_TIERS[KARMA_TIERS.length - 1];

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div id="app">
      <header>
        <h1>Calma<span>.</span></h1>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <NavLink to="/perfil" className="pill" style={{ textDecoration: 'none' }}>
            Respeto <b style={{ color: tier.color }}>{karma}</b>
          </NavLink>
          <button
            className="pill"
            onClick={handleSignOut}
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
          >
            ⎋
          </button>
        </div>
      </header>

      <nav className="top-nav" aria-label="Secciones">
        <NavItem to="/descubrir" icon="🔍" label="Descubrir" />
        <NavItem to="/chats" icon="💬" label="Chats" />
        <NavItem to="/alma" icon="✨" label="Mi alma" />
        <NavItem to="/taberna" icon="🍻" label="Taberna" />
        <NavItem to="/perfil" icon="👤" label="Perfil" />
      </nav>

      <main>
        <Outlet />
      </main>
    </div>
  );
}

function NavItem({ to, icon, label }: { to: string; icon: string; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => `top-nav-item ${isActive ? 'active' : ''}`}
    >
      <span style={{ fontSize: '1rem' }}>{icon}</span>
      <span>{label}</span>
    </NavLink>
  );
}
