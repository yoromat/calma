// src/pages/Chats.tsx
import { useEffect, useState, useRef } from 'react';
import { getMyMatches, getMessagesWith, sendMessage } from '../lib/api';
import type { Message } from '../lib/api';
import type { Profile } from '../types/database';
import { supabase } from '../lib/supabase';

export function Chats() {
  const [matches, setMatches] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [openMatch, setOpenMatch] = useState<Profile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const channelRef = useRef<any>(null);

  // Cargar matches al montar
  useEffect(() => {
    getMyMatches().then((m) => {
      setMatches(m);
      setLoading(false);
    });
  }, []);

  // Cargar mensajes y suscripción cuando se abre un chat
  useEffect(() => {
    if (!openMatch) {
      setMessages([]);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      return;
    }

    let cancelled = false;

    // Cargar mensajes iniciales
    getMessagesWith(openMatch.id).then((msgs) => {
      if (!cancelled) setMessages(msgs);
    });

    // Suscripción en tiempo real (sin filtro complejo)
    const channel = supabase
      .channel(`chat:${openMatch.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const newMsg = payload.new as Message;
          const myId = (supabase as any).auth.currentUser?.id;

          const isRelevant =
            (newMsg.sender_id === openMatch.id && newMsg.receiver_id === myId) ||
            (newMsg.sender_id === myId && newMsg.receiver_id === openMatch.id);

          if (isRelevant) {
            setMessages((prev) => {
              if (prev.some(m => m.id === newMsg.id)) return prev;
              return [...prev, newMsg];
            });
          }
        }
      )
      .subscribe((status) => {
        console.log('Realtime status:', status);
      });

    channelRef.current = channel;

    return () => {
      cancelled = true;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [openMatch?.id]);

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

    if (result.message) {
      setMessages((prev) => {
        if (prev.some(m => m.id === result.message!.id)) return prev;
        return [...prev, result.message!];
      });
    }

    setDraft('');
    setSending(false);
  };

  const closeChat = () => {
    setOpenMatch(null);
  };

  if (loading) return <p className="muted">Cargando chats…</p>;

  // Vista de chat abierto
  if (openMatch) {
    return (
      <>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <button className="ghost" onClick={closeChat}>← Volver</button>
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

  // Vista de lista de matches
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
        <button key={p.id} className="item" onClick={() => setOpenMatch(p)}>
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
