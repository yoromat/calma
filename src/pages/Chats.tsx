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
  const [otherTyping, setOtherTyping] = useState(false);
  const [myId, setMyId] = useState<string | null>(null);

  const channelRef = useRef<any>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopTypingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setMyId(data.user?.id ?? null);
    });
  }, []);

  useEffect(() => {
    getMyMatches().then((m) => {
      setMatches(m);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!openMatch || !myId) return;

    let cancelled = false;

    getMessagesWith(openMatch.id).then((msgs) => {
      if (!cancelled) setMessages(msgs);
    });

    const channelName = `chat:${[myId, openMatch.id].sort().join(':')}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const newMsg = payload.new as Message;
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
      .on('broadcast', { event: 'typing' }, (payload) => {
        if (cancelled) return;
        const data = payload.payload as { user_id?: string; is_typing?: boolean };
        if (data.user_id !== openMatch.id) return;

        setOtherTyping(Boolean(data.is_typing));

        if (stopTypingTimerRef.current) clearTimeout(stopTypingTimerRef.current);
        if (data.is_typing) {
          stopTypingTimerRef.current = setTimeout(() => {
            if (!cancelled) setOtherTyping(false);
          }, 3000);
        }
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      cancelled = true;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      if (stopTypingTimerRef.current) clearTimeout(stopTypingTimerRef.current);
      setOtherTyping(false);
    };
  }, [openMatch?.id, myId]);

  // Auto-scroll al último mensaje
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Mantener el foco en el input al abrir el chat
  useEffect(() => {
    if (openMatch && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [openMatch?.id]);

  const handleDraftChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setDraft(value);

    const channel = channelRef.current;
    if (!channel || !myId || !openMatch) return;

    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      const c = channelRef.current;
      if (!c) return;
      void c.send({
        type: 'broadcast',
        event: 'typing',
        payload: { user_id: myId, is_typing: value.trim().length > 0 },
      });
    }, 250);

    if (stopTypingTimerRef.current) clearTimeout(stopTypingTimerRef.current);
    stopTypingTimerRef.current = setTimeout(() => {
      const c = channelRef.current;
      if (c) {
        void c.send({
          type: 'broadcast',
          event: 'typing',
          payload: { user_id: myId, is_typing: false },
        });
      }
    }, 1800);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!openMatch || !draft.trim()) return;
    setSending(true);

    const result = await sendMessage(openMatch.id, draft.trim());

    if (result.error) {
      alert('Error al enviar: ' + result.error);
      setSending(false);
      // Recuperar foco incluso en error
      setTimeout(() => inputRef.current?.focus(), 50);
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

    // ⭐ Recuperar el foco después de enviar
    setTimeout(() => inputRef.current?.focus(), 50);

    const c = channelRef.current;
    if (c && myId) {
      void c.send({
        type: 'broadcast',
        event: 'typing',
        payload: { user_id: myId, is_typing: false },
      });
    }
  };

  // ⭐ Manejar Enter para enviar sin perder el foco
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!sending && draft.trim()) {
        handleSend(e as any);
      }
    }
  };

  const closeChat = () => {
    setOpenMatch(null);
    setMessages([]);
    setOtherTyping(false);
  };

  if (loading) return <p className="muted">Cargando chats…</p>;

  // ====== Vista de chat abierto ======
  if (openMatch) {
    return (
      <div className="chat-screen">
        <header className="chat-header">
          <button className="ghost" onClick={closeChat}>← Volver</button>
          <div className="chat-user">
            <b>{openMatch.username || 'Chat'}</b>
            <span className="chat-status">
              {otherTyping ? '✍️ Está escribiendo…' : '● Conectado'}
            </span>
          </div>
          <span style={{ width: '40px' }} />
        </header>

        {openMatch.limit_text && (
          <div className="limit" style={{ margin: '0 12px' }}>
            <b>Sus límites:</b> {openMatch.limit_text}
          </div>
        )}

        <div className="chat chat-messages">
          {messages.length === 0 && (
            <p className="muted" style={{ textAlign: 'center', padding: '20px' }}>
              Aún no hay mensajes. Rompe el hielo con calma.
            </p>
          )}
          {messages.map((m) => {
            const isMe = m.sender_id === myId;
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
          <div ref={bottomRef} />
        </div>

        <form className="compose chat-compose" onSubmit={handleSend}>
          <input
            ref={inputRef}
            value={draft}
            onChange={handleDraftChange}
            onKeyDown={handleKeyDown}
            placeholder="Escribe con calma…"
            // ⭐ Ya no deshabilitamos el input mientras se envía
            autoComplete="off"
          />
          <button className="primary" type="submit" disabled={sending || !draft.trim()}>
            {sending ? '…' : '➤'}
          </button>
        </form>
      </div>
    );
  }

  // ====== Vista de lista de matches ======
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
