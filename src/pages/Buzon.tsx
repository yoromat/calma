// src/pages/Buzon.tsx
import { useEffect, useState } from 'react';
import { enviarAlBuzon, getMisMensajesBuzon } from '../lib/api';
import type { MensajeBuzon } from '../lib/api';

export function Buzon() {
  const [mensajes, setMensajes] = useState<MensajeBuzon[]>([]);
  const [asunto, setAsunto] = useState('');
  const [texto, setTexto] = useState('');
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const load = async () => {
    const m = await getMisMensajesBuzon();
    setMensajes(m);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleEnviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!asunto.trim() || !texto.trim()) return;
    setEnviando(true);
    const ok = await enviarAlBuzon(asunto.trim(), texto.trim());
    if (ok) {
      setAviso('Mensaje enviado. Te responderemos pronto.');
      setAsunto(''); setTexto('');
      await load();
      setTimeout(() => setAviso(null), 3000);
    } else {
      setAviso('No se pudo enviar. Inténtalo de nuevo.');
    }
    setEnviando(false);
  };

  if (loading) return <p className="muted">Cargando buzón…</p>;

  return (
    <>
      <div className="card">
        <h2>📬 Buzón de moderación</h2>
        <p className="muted">Envía un mensaje privado al equipo de moderación. Solo ellos lo leerán.</p>
        {aviso && <p style={{ color: 'var(--ok)', fontWeight: 600 }}>{aviso}</p>}
        <form onSubmit={handleEnviar}>
          <label>Asunto</label>
          <input value={asunto} onChange={e => setAsunto(e.target.value)} placeholder="Ej: Reporte de usuario, sugerencia…" />
          <label>Mensaje</label>
          <textarea rows={4} value={texto} onChange={e => setTexto(e.target.value)} placeholder="Cuéntanos con detalle…" />
          <div className="row">
            <button className="primary" type="submit" disabled={enviando || !asunto.trim() || !texto.trim()}>
              {enviando ? 'Enviando…' : 'Enviar al buzón'}
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <h3>Mis mensajes</h3>
        {mensajes.length === 0 ? (
          <p className="muted">Aún no has enviado nada.</p>
        ) : (
          mensajes.map(m => (
            <div key={m.id} style={{ borderBottom: '1px solid var(--line)', padding: '10px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <b>{m.asunto}</b>
                <span className="pill" style={{ fontSize: '0.75rem' }}>{m.status}</span>
              </div>
              <p className="muted" style={{ fontSize: '0.85rem', margin: '4px 0' }}>{m.mensaje}</p>
              {m.respuesta && (
                <div style={{ background: 'var(--soft)', padding: '8px 12px', borderRadius: '8px', marginTop: '6px' }}>
                  <b style={{ fontSize: '0.8rem', color: 'var(--acc)' }}>Respuesta del equipo:</b>
                  <p style={{ fontSize: '0.9rem', margin: '4px 0 0' }}>{m.respuesta}</p>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </>
  );
}
