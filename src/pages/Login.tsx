// src/pages/Login.tsx
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    navigate('/descubrir');
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'grid',
      placeItems: 'center',
      padding: '20px'
    }}>
      <form onSubmit={handleSubmit} className="card" style={{ width: '100%', maxWidth: '400px' }}>
        <h1 style={{ marginBottom: '20px' }}>
          Calma<span style={{ color: 'var(--acc)' }}>.</span>
        </h1>
        <h2>Entrar</h2>

        <label>Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          style={{ width: '100%', padding: '10px', marginBottom: '12px' }}
        />

        <label>Contraseña</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          style={{ width: '100%', padding: '10px', marginBottom: '12px' }}
        />

        {error && (
          <p style={{ color: 'var(--bad)', fontSize: '0.9rem', marginBottom: '12px' }}>
            {error}
          </p>
        )}

        <button className="primary" type="submit" disabled={loading} style={{ width: '100%' }}>
          {loading ? 'Entrando…' : 'Entrar'}
        </button>

        <p style={{ marginTop: '16px', fontSize: '0.9rem', color: 'var(--mute)' }}>
          ¿No tienes cuenta? <Link to="/register" style={{ color: 'var(--acc)' }}>Crear una</Link>
        </p>
      </form>
    </div>
  );
}
