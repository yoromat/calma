// src/pages/Register.tsx
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (username.trim().length < 2) {
      setError('El nombre debe tener al menos 2 caracteres.');
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username: username.trim() },
      },
    });

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
        <h2>Crear cuenta</h2>

        <label>Nombre</label>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          style={{ width: '100%', padding: '10px', marginBottom: '12px' }}
        />

        <label>Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          style={{ width: '100%', padding: '10px', marginBottom: '12px' }}
        />

        <label>Contraseña (mín. 6 caracteres)</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          autoComplete="new-password"
          style={{ width: '100%', padding: '10px', marginBottom: '12px' }}
        />

        {error && (
          <p style={{ color: 'var(--bad)', fontSize: '0.9rem', marginBottom: '12px' }}>
            {error}
          </p>
        )}

        <button className="primary" type="submit" disabled={loading} style={{ width: '100%' }}>
          {loading ? 'Creando…' : 'Crear cuenta'}
        </button>

        <p style={{ marginTop: '16px', fontSize: '0.9rem', color: 'var(--mute)' }}>
          ¿Ya tienes cuenta? <Link to="/login" style={{ color: 'var(--acc)' }}>Entrar</Link>
        </p>
      </form>
    </div>
  );
}
