export type Profile = {
  id: string;
  username: string | null;
  bio: string | null;
  limit_text: string | null;
  avatar_color: string | null;
  tags: string[] | null;
  karma_score: number;
  strikes: number;
  polite_count: number;
  sent_count: number;
  mood: string;
  energia: number;
  created_at: string;
};

export const KARMA_TIERS = [
  { min: 80, id: 'normal', label: 'Todo normal', color: 'var(--ok)' },
  { min: 50, id: 'limit', label: 'Límite de 5 mensajes al día', color: 'var(--warn)' },
  { min: 20, id: 'reply', label: 'Solo puedes responder, no iniciar', color: 'var(--warn)' },
  { min: 0, id: 'frozen', label: 'Cuenta congelada: revisión manual', color: 'var(--bad)' },
];

export const MOODS = {
  sereno:      { emoji: '🌿', label: 'Sereno',      desc: 'Frases cortas, metáforas suaves, tono calmado.' },
  jugueton:    { emoji: '✨', label: 'Juguetón',    desc: 'Insinúas, provocas con elegancia, dobles sentidos.' },
  melancolico: { emoji: '🌧️', label: 'Melancólico', desc: 'Silencios, frases más largas, preguntas existenciales.' },
  cansado:     { emoji: '😴', label: 'Cansado',     desc: 'Respuestas mínimas, menos energía.' },
  neutro:      { emoji: '💬', label: 'Neutro',      desc: 'Respondes con naturalidad, sin extremos.' },
  enfadado:    { emoji: '🔥', label: 'Enfadado',    desc: 'Directo, cortante, sin metáforas. Pero no cruel.' },
} as const;
