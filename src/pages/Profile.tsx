// src/pages/Profile.tsx
import { useEffect, useState } from 'react';
import { getMyProfile, updateMyProfile } from '../lib/api';
import type { Profile } from '../types/database';
import { KARMA_TIERS } from '../types/database';

export function Profile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [limitText, setLimitText] = useState('');

  useEffect(() => {
    getMyProfile().then((p) => {
      setProfile(p);
      if (p) {
        setUsername(p.username || '');
        setBio(p.bio || '');
        setLimitText(p.limit_text || '');
      }
      setLoading(false);
    });
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);

    const updated = await updateMyProfile({
      username: username.trim(),
      bio: bio.trim(),
      limit_text: limitText.trim(),
    });

    setSaving(false);
    if (updated) {
      setProfile(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
  };

  if (loading) return <p className="muted">Cargando perfil…</p>;
  if (!profile) return <p className="muted">No se encontró tu perfil.</p>;

  const karma = profile.karma_score ?? 100;
  const tier = KARMA_TIERS.find(t => karma >= t.min) ?? KARMA_TIERS[KARMA_TIERS.length - 1];

  const badges = [
    { label: 'Respetuoso', unlocked: (profile.polite_count ?? 0) >= 3 },
    { label: 'Buen conversador', unlocked: (profile.sent_count ?? 0) >= 10 },
    { label: 'Aliado', unlocked: karma === 100 && (profile.polite_count ?? 0) >= 5 },
  ];

  return (
    <>
      <div className="card">
        <h2>Tu respeto: {karma}/100</h2>
        <div className="bar" role="progressbar" aria-valuenow={karma} aria-valuemin={0} aria-valuemax={100}>
          <i style={{ width: `${karma}%`, background: tier.color }} />
        </div>
        <p style={{ color: tier.color, fontWeight: 600 }}>{tier.label}</p>
        <p className="muted" style={{ fontSize: '0.9rem' }}>
          Sube si respondes con educación y respetas un "no". Baja con mensajes no solicitados o si insistes tras un rechazo.
        </p>
        <div style={{ marginTop: '8px' }}>
          {badges.map((b, i) => (
            <span key={i} className={`badge ${b.unlocked ? '' : 'off'}`}>
              {b.label}{b.unlocked ? '' : ' (bloqueada)'}
            </span>
          ))}
        </div>
      </div>

      <form className="card" onSubmit={handleSave}>
        <h2>Mi perfil</h2>

        <label>Nombre</label>
        <input value={username} onChange={(e) => setUsername(e.target.value)} />

        <label>Sobre mí</label>
        <textarea rows={3} value={bio} onChange={(e) => setBio(e.target.value)} />

        <label>Mis límites (se muestran en tu perfil)</label>
        <input value={limitText} onChange={(e) => setLimitText(e.target.value)} />

        <div className="row">
          <button className="primary" type="submit" disabled={saving}>
            {saving ? 'Guardando…' : saved ? '✓ Guardado' : 'Guardar'}
          </button>
        </div>
      </form>

      <div className="card soft">
        <h3>Privacidad</h3>
        <p className="muted" style={{ fontSize: '0.88rem' }}>
          Tu karma es privado. Solo tú lo ves. Los demás ven tu perfil y tus límites, nunca tu puntuación.
        </p>
      </div>
    </>
  );
}
