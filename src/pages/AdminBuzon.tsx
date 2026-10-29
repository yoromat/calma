// src/pages/AdminBuzon.tsx
import { useEffect, useState, useRef } from 'react';
import { esAdmin, getTodosLosMensajesBuzon, responderMensajeBuzon } from '../lib/api';
import type { MensajeBuzon } from '../lib/api';
import type { Profile } from '../types/database';
import { supabase } from '../lib/supabase';

type MensajeConPerfil = MensajeBuzon & { perfil: Profile };

export function AdminBuzon() {
  const [esAdminUser, setEsAdminUser] = useState<boolean | null>(null);
  const [mensajes, setMensajes] = useState<MensajeConPerfil[]>([]);
  const [respuestas, setRespuestas] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<any>(null);

  const load = async () => {
    const admin = await esAdmin();
    setEsAdminUser(admin);
    if (admin) {
      const m = await getTodosLosMensajesBuzon();
      setMensajes(m);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  // ⭐ Auto-refresco cuando llega un mensaje nuevo o se responde
  useEffect(() => {
    if (!esAdminUser) return;

    const channel = supabase
      .channel('admin-buzon-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'buzon' },
        () => {
          // Recargar la lista completa cuando hay cualquier cambio
          getTodosLosMensajesBuzon().then(setMensajes);
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [esAdminUser]);

  const handleResponder = async (id: string) => {
    const texto = respuestas[id];
    if (!texto?.trim()) return;
    const ok = await responderMensajeBuzon(id, texto.trim());
    if (ok) {
      setRespuestas(prev => ({ ...prev, [id]: '' }));
      // La recarga la hará el realtime automáticamente
    }
  };

  if (loading) return <p className="muted">Comprobando permisos…</p>;
  if (!esAdminUser) return <p className="muted">No tienes permiso para ver esta página.</p>;

  return (
    <div className="card">
      <h2>🛡️ Buzón de administración</h2>
      <p className="muted">Solo los administradores pueden ver esto. Se actualiza solo.</p>
      {mensajes.length === 0 ? (
        <p className="muted">No hay mensajes en el buzón.</p>
      ) : (
        mensajes.map(m => (
          <div key={m.id} style={{ borderBottom: '1px solid var(--line)', padding: '12px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <b>De: {m.perfil.username || 'Anónimo'}</b>
              <span className="pill" style={{ fontSize: '0.75rem' }}>{m.status}</span>
            </div>
            <p style={{ margin: '4px 0' }}><b>{m.asunto}</b></p>
            <p className="muted" style={{ fontSize: '0.9rem' }}>{m.mensaje}</p>

            {m.respuesta ? (
              <div style={{ background: 'var(--soft)', padding: '8px 12px', borderRadius: '8px', marginTop: '6px' }}>
                <b style={{ fontSize: '0.8rem', color: 'var(--acc)' }}>Tu respuesta:</b>
                <p style={{ fontSize: '0.9rem', margin: '4px 0 0' }}>{m.respuesta}</p>
              </div>
            ) : (
              <div style={{ marginTop: '8px' }}>
                <textarea
                  rows={2}
                  placeholder="Escribe una respuesta…"
                  value={respuestas[m.id] || ''}
                  onChange={e => setRespuestas(prev => ({ ...prev, [m.id]: e.target.value }))}
                />
                <button className="primary" style={{ marginTop: '4px' }} onClick={() => handleResponder(m.id)}>
                  Responder
                </button>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
