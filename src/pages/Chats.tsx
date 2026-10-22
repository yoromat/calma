// src/pages/Chats.tsx
import { useEffect, useState, useRef } from 'react';
import { getMyMatches, getMessagesWith, sendMessage } from '../lib/api';
import type { Message } from '../lib/api';
import type { Profile } from '../types/database';
import { supabase } from '../lib/supabase';

export function Chats() {
  const [matches, setMatches] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [openMatch, setOpenMatch] = useState<Profile | null>(() => {
    // Recuperar el chat abierto de la sesión anterior
    const saved = sessionStorage.getItem('calma_open_chat');
    return saved ? JSON.parse(saved) : null;
  });
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const channelRef = useRef<any>(null);

  useEffect(() => {
    getMyMatches().then((m) => {
      setMatches(m);
      setLoading(false);
    });
  }, []);

  // Cargar mensajes cuando se abre un chat
  useEffect(() => {
    if (!openMatch) {
      setMessages([]);
      sessionStorage.removeItem('calma_open_chat');
      return;
    }

    // Guardar el chat abierto en sesión
    sessionStorage.setItem('calma_open_chat', JSON.stringify(openMatch));

    // Cargar mensajes iniciales
    getMessagesWith(openMatch.id).then(setMessages);

    // ⭐ Suscripción en tiempo real a nuevos mensajes
    const channel = supabase
      .channel(`chat:${openMatch.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `or(and(sender_id.eq.${openMatch.id},receiver_id.eq.${(supabase as any).auth.currentUser?.id}),and(sender_id.eq.${(supabase as any).auth.currentUser?.id},receiver_id.eq.${openMatch.id}))`,
        },
        (payload) => {
          const newMsg = payload.new as Message;
          setMessages((prev) => {
            // Evitar duplicados
            if (prev.some(m => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
        }
      )
      .subscribe();

    channelRef.current = channel;

    // Limpieza al salir del chat
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [openMatch?.id]);

  const openChat = async (p: Profile) => {
    setOpenMatch(p);
  };

  const closeChat = () => {
    setOpenMatch(null);
    sessionStorage.removeItem('calma_open_chat');
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!openMatch || !draft.trim()) return;
    setSending(true);

    const result = await sendMessage(openMatch.id, draft.trim());

    if (result.error) {
      alert('Error al enviar: ' + result.error);
      setSending(false);
      return;
    }

    // El mensaje propio también se añade localmente (el realtime lo ignorará por duplicado)
    if (result.message) {
      setMessages((prev) => {
        if (prev.some(m => m.id === result.message!.id)) return prev;
        return [...prev, result.message!];
      });
    }

    setDraft('');
    setSending(false);
  };

  if (loading) return <p className="muted">Cargando chats…</p>;

  if (openMatch) {
    return (
      <>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <button className="ghost" onClick={closeChat}>
            ← Volver
          </button>
          <b>{openMatch.username || 'Chat'}</b>
          <span style={{ width: '40px' }} />
        </div>

        {openMatch.limit_text && (
          <div className="limit">
            <b>Sus límites:</b> {openMatch.limit_text}
          </div>
        )}

        <div className="chat">
          {messages.length === 0 && (
            <p className="muted" style={{ textAlign: 'center', padding: '20px' }}>
              Aún no hay mensajes. Rompe el hielo con calma.
            </p>
          )}
          {messages.map((m) => {
            const isMe = m.sender_id !== openMatch.id;
            return (
              <div key={m.id} className={`msg ${isMe ? 'me' : ''}`}>
                {m.content}
                {m.karma_delta !== 0 && (
                  <span className="val">
                    {m.karma_delta > 0 ? '🔺' : '🔻'} {m.karma_delta > 0 ? '+' : ''}{m.karma_delta}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <form className="compose" onSubmit={handleSend}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Escribe con calma…"
            disabled={sending}
            autoComplete="off"
          />
          <button className="primary" type="submit" disabled={sending || !draft.trim()}>
            {sending ? '…' : 'Enviar'}
          </button>
        </form>
        <div style={{ height: '60px' }} />
      </>
    );
  }

  if (matches.length === 0) {
    return (
      <div className="card">
        <h2>Aún no hay chats</h2>
        <p className="muted">Cuando haya interés mutuo, aparecerá aquí. Ve a Descubrir para conocer gente.</p>
      </div>
    );
  }

  return (
    <div className="list">
      {matches.map((p) => (
        <button key={p.id} className="item" onClick={() => openChat(p)}>
          <span className="avatar sm" style={{ background: p.avatar_color || '#6b3fa0' }}>
            {(p.username || '?')[0].toUpperCase()}
          </span>
          <span className="meta">
            <b>{p.username || 'Anónimo'}</b>
            <span className="preview">{p.bio || 'Sin bio'}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
