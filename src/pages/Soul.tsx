// src/pages/Soul.tsx
import { useEffect, useState } from 'react';
import { getMyProfile, getMyMemories, getQuestStatus, claimQuest } from '../lib/api';
import type { Profile } from '../types/database';
import type { Memory } from '../lib/api';
import { MOODS } from '../types/database';

// Función de scoring triple (relevancia + recencia + importancia)
function scoreMemory(memory: Memory, currentMood: string): number {
  // Relevancia: 1 si el recuerdo es sobre alguien con quien has hablado recientemente, 0 si no
  // Como no tenemos esa info fácil, usamos 0.5 base
  const relevancia = 0.5;

  // Recencia: decaimiento exponencial, vida media 7 días
  const dias = (Date.now() - new Date(memory.created_at).getTime()) / (1000 * 60 * 60 * 24);
  const recencia = Math.exp(-dias / 7);

  // Importancia: valor absoluto de la valencia / 2
  const importancia = Math.abs(memory.valence) / 2;

  // Bonus por mood: si el mood coincide con la valencia del recuerdo
  let moodBonus = 0;
  if (currentMood === 'melancolico' && memory.valence < 0) moodBonus = 0.2;
  if (currentMood === 'sereno' && memory.valence > 0) moodBonus = 0.2;

  return 0.4 * relevancia + 0.3 * recencia + 0.3 * importancia + moodBonus;
}

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
    const result = await claimQuest(questId);
    if (result.success) {
      setProfile((prev) => prev ? { ...prev, karma_score: result.newKarma } : prev);
      window.dispatchEvent(
        new CustomEvent('karma-updated', { detail: { karma: result.newKarma } })
      );
      const q = await getQuestStatus();
      setQuests(q);
    }
    setClaiming(null);
  };

  if (loading) return <p className="muted">Cargando tu alma…</p>;
  if (!profile) return <p className="muted">No se encontró tu perfil.</p>;

  const mood = MOODS[profile.mood as keyof typeof MOODS] || MOODS.neutro;

  // Separar núcleos de recuerdos normales
  const nucleos = memories.filter(m => m.is_nucleo);
  const noNucleos = memories.filter(m => !m.is_nucleo);

  // Scoring triple para los no-núcleos
  const scored = noNucleos
    .map(m => ({ memory: m, score: scoreMemory(m, profile.mood) }))
    .sort((a, b) => b.score - a.score);

  // Top 6 recuerdos más relevantes (excluyendo núcleos que ya se muestran aparte)
  const topMemories = scored.slice(0, 6).map(s => s.memory);

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
        <p className="muted" style={{ marginTop: '8px', fontSize: '0.88rem', textAlign: 'center' }}>
          {mood.desc}
        </p>
      </div>

      <div className="card">
        <h3>Estadísticas del alma</h3>
        <div className="stats">
          <div className="stat"><b>{memories.length}</b><span>Recuerdos totales</span></div>
          <div className="stat"><b>{positivas}</b><span>Recuerdos positivos</span></div>
          <div className="stat"><b>{negativas}</b><span>Recuerdos negativos</span></div>
          <div className="stat"><b>{nucleos.length}</b><span>Núcleos</span></div>
        </div>
      </div>

      {/* Núcleos: siempre visibles */}
      {nucleos.length > 0 && (
        <div className="card">
          <h3>Recuerdos núcleo</h3>
          <p className="muted" style={{ fontSize: '0.85rem', marginBottom: '8px' }}>
            Lo que define quién eres. Nunca se olvida.
          </p>
          {nucleos.map((m) => (
            <div key={m.id} className="mem-item">
              <span className="val">
                {m.valence > 0 ? '💚' : m.valence < 0 ? '💔' : '🤍'}
              </span>
              <span>{m.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* Top 6 recuerdos por scoring triple */}
      <div className="card">
        <h3>Recuerdos que te definen</h3>
        <p className="muted" style={{ fontSize: '0.85rem', marginBottom: '8px' }}>
          Los 6 más relevantes según tu estado actual.
        </p>
        {topMemories.length === 0 ? (
          <p className="muted">Aún no hay recuerdos suficientes. Habla con alguien y empieza a construir tu alma.</p>
        ) : (
          topMemories.map((m) => (
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
