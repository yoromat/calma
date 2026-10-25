// src/pages/Soul.tsx
import { useEffect, useState } from 'react';
import { getMyProfile, getMyMemories, getQuestStatus, claimQuest } from '../lib/api';
import type { Profile } from '../types/database';
import type { Memory } from '../lib/api';
import { MOODS } from '../types/database';

export function Soul() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [quests, setQuests] = useState({ login: false, firstMsg: false, polite: false });
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);

  const load = async () => {
    const [p, m, q] = await Promise.all([
      getMyProfile(),
      getMyMemories(),
      getQuestStatus(),
    ]);
    setProfile(p);
    setMemories(m);
    setQuests(q);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleClaim = async (questId: string) => {
    setClaiming(questId);
    const ok = await claimQuest(questId);
    if (ok) {
      // Recargar todo para ver el karma actualizado
      await load();
      window.dispatchEvent(new CustomEvent('karma-updated', { detail: { karma: profile?.karma_score ?? 100 } }));
    }
    setClaiming(null);
  };

  if (loading) return <p className="muted">Cargando tu alma…</p>;
  if (!profile) return <p className="muted">No se encontró tu perfil.</p>;

  const mood = MOODS[profile.mood as keyof typeof MOODS] || MOODS.neutro;
  const positivas = memories.filter(m => m.valence > 0).length;
  const negativas = memories.filter(m => m.valence < 0).length;

  const questDefs = [
    { id: 'login', icon: '🌅', label: 'Inicia sesión', reward: 2, done: quests.login },
    { id: 'firstMsg', icon: '💬', label: 'Envía tu primer mensaje del día', reward: 5, done: quests.firstMsg },
    { id: 'polite', icon: '🤝', label: 'Responde con educación 3 veces', reward: 10, done: quests.polite },
  ];

  return (
    <>
      <div className="card">
        <h2>✨ Tu alma</h2>
        <p className="muted">Cada conversación deja huella. Lo que cultivas, crece. Lo que descuidas, se desvanece.</p>
        <div style={{ marginTop: '12px', textAlign: 'center' }}>
          <span className="mood" style={{ fontSize: '1rem', padding: '8px 16px' }}>
            {mood.emoji} {mood.label} · Energía {profile.energia ?? 7}/10
          </span>
        </div>
        <p className="muted center" style={{ marginTop: '8px', fontSize: '0.88rem', textAlign: 'center' }}>
          {mood.desc}
        </p>
      </div>

      <div className="card">
        <h3>Estadísticas del alma</h3>
        <div className="stats">
          <div className="stat"><b>{memories.length}</b><span>Recuerdos totales</span></div>
          <div className="stat"><b>{positivas}</b><span>Recuerdos positivos</span></div>
          <div className="stat"><b>{negativas}</b><span>Recuerdos negativos</span></div>
          <div className="stat"><b>{profile.polite_count ?? 0}</b><span>Gestos de respeto</span></div>
        </div>
      </div>

      <div className="card">
        <h3>Recuerdos recientes</h3>
        {memories.length === 0 ? (
          <p className="muted">Aún no hay recuerdos. Habla con alguien y empieza a construir tu alma.</p>
        ) : (
          memories.slice(0, 10).map((m) => (
            <div key={m.id} className="mem-item">
              <span className="val">
                {m.valence > 0 ? '💚' : m.valence < 0 ? '💔' : '🤍'}
              </span>
              <span>{m.text}</span>
            </div>
          ))
        )}
      </div>

      <div className="card soft">
        <h3>Misiones de hoy</h3>
        {questDefs.map((q) => (
          <div key={q.id} className={`quest ${q.done ? 'done' : ''}`}>
            <span className="q-ico">{q.icon}</span>
            <span className="q-body">
              <b>{q.label}</b>
              <span>{q.done ? 'Completada' : 'Pendiente'} · +{q.reward} respeto</span>
            </span>
            {q.done ? (
              <span style={{ color: 'var(--ok)' }}>✓</span>
            ) : (
              <button
                className="pill"
                onClick={() => handleClaim(q.id)}
                disabled={claiming === q.id}
              >
                {claiming === q.id ? '…' : 'Reclamar'}
              </button>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
