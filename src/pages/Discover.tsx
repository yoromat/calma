// src/pages/Discover.tsx
import { useEffect, useState } from 'react';
import { getDiscoverProfiles, likeUser, passUser } from '../lib/api';
import type { Profile } from '../types/database';
import { KARMA_TIERS, MOODS } from '../types/database';

export function Discover() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [current, setCurrent] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    getDiscoverProfiles().then((p) => {
      setProfiles(p);
      setLoading(false);
    });
  }, []);

  const handlePass = async () => {
    const p = profiles[current];
    if (!p) return;
    await passUser(p.id);
    next();
  };

  const handleLike = async () => {
    const p = profiles[current];
    if (!p) return;
    const { matched } = await likeUser(p.id);
    if (matched) {
      setMessage(`¡Match con ${p.username || 'alguien'}! Ve a Chats para hablar.`);
      setTimeout(() => setMessage(null), 4000);
    }
    next();
  };

  const next = () => {
    setCurrent(c => c + 1);
  };

  if (loading) return <p className="muted">Cargando perfiles…</p>;

  const profile = profiles[current];

  if (!profile) {
    return (
      <div className="card">
        <h2>Por hoy es todo</h2>
        <p className="muted">Has visto todos los perfiles disponibles. Vuelve más tarde o espera a que se registre más gente.</p>
      </div>
    );
  }

  const karma = profile.karma_score ?? 100;
  const tier = KARMA_TIERS.find(t => karma >= t.min) ?? KARMA_TIERS[KARMA_TIERS.length - 1];
  const mood = MOODS[profile.mood as keyof typeof MOODS] || MOODS.neutro;

  return (
    <>
      {message && (
        <div className="card" style={{ background: 'var(--ok)', color: '#fff' }}>
          {message}
        </div>
      )}

      <article className="card">
        <div
          className="avatar"
          style={{ background: profile.avatar_color || '#6b3fa0' }}
        >
          {(profile.username || '?')[0].toUpperCase()}
        </div>

        <h2>{profile.username || 'Anónimo'}{profile.age ? `, ${profile.age}` : ''}</h2>
        {profile.city && <div className="muted">{profile.city}</div>}

        <div style={{ marginTop: '8px' }}>
          <span className="mood">
            {mood.emoji} {mood.label} · Energía {profile.energia ?? 7}/10
          </span>
        </div>

        {profile.bio && <p style={{ marginTop: '10px' }}>{profile.bio}</p>}

        {profile.tags && profile.tags.length > 0 && (
          <div className="tags">
            {profile.tags.map((t, i) => <span key={i} className="tag">{t}</span>)}
          </div>
        )}

        {profile.limit_text && (
          <div className="limit">
            <b>Sus límites:</b> {profile.limit_text}
          </div>
        )}

        <div className="row">
          <button onClick={handlePass}>Pasar</button>
          <button className="primary" onClick={handleLike}>Me interesa</button>
        </div>
      </article>

      <div className="card soft">
        <h3>Su respeto</h3>
        <div className="bar">
          <i style={{ width: `${karma}%`, background: tier.color }} />
        </div>
        <p style={{ color: tier.color, fontWeight: 600, fontSize: '0.9rem' }}>
          {tier.label}
        </p>
      </div>
    </>
  );
}
