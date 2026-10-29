// src/pages/Chats.tsx
import { useEffect, useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  getMyMatches,
  getMessagesWith,
  sendMessage,
  getSolicitudesPendientes,
  responderSolicitud,
} from '../lib/api';
import type { Message, Solicitud } from '../lib/api';
import type { Profile } from '../types/database';
import { supabase } from '../lib/supabase';

type SolicitudConPerfil = Solicitud & { perfil: Profile };

export function Chats() {
  const [matches, setMatches] = useState<Profile[]>([]);
  const [solicitudes, setSolicitudes] = useState<SolicitudConPerfil[]>([]);
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

  const location = useLocation();
  const navigate = useNavigate();

  const loadAll = async () => {
    const [m, s] = await Promise.all([getMyMatches(), getSolicitudesPendientes()]);
    setMatches(m);
    setSolicitudes(s);
    setLoading(false);
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setMyId(data.user?.id ?? null);
    });
  }, []);

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    const state = location.state as { openWith?: string } | null;
    if (state?.openWith && matches.length > 0) {
      const target = matches.find(m => m.id === state.openWith);
      if (target) setOpenMatch(target);
      navigate(location.pathname, { replace: true });
    }
  }, [matches, location.state]);

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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!sending && draft.trim()) handleSend(e as any);
    }
  };

  const handleResponderSolicitud = async (solicitud: SolicitudConPerfil, aceptar: boolean) => {
    const ok = await responderSolicitud(solicitud.id, aceptar);
    if (ok) {
      setSolicitudes(prev => prev.filter(s => s.id !== solicitud.id));
      if (aceptar) {
        await loadAll();
      }
    }
  };
  // ⭐ Auto-refresco de solicitudes
  useEffect(() => {
    if (!myId) return;

    const channel = supabase
      .channel(`solicitudes-${myId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'solicitudes_chat',
          filter: `to_user_id=eq.${myId}`,
        },
        () => {
          getSolicitudesPendientes().then(setSolicitudes);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [myId]);

  const closeChat = () => {
    setOpenMatch(null);
    setMessages([]);
    setOtherTyping(false);
  };

  if (loading) return <p className="muted">Cargando chats…</p>;

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
            autoComplete="off"
          />
          <button className="primary" type="submit" disabled={sending || !draft.trim()}>
            {sending ? '…' : '➤'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <>
      {solicitudes.length > 0 && (
        <div className="card">
          <h3>Solicitudes de chat</h3>
          {solicitudes.map((s) => (
            <div key={s.id} className="item" style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '8px' }}>
              <span className="avatar sm" style={{ background: s.perfil.avatar_color || '#6b3fa0' }}>
                {(s.perfil.username || '?')[0].toUpperCase()}
              </span>
              <div style={{ flex: 1 }}>
                <b>{s.perfil.username || 'Anónimo'}</b> quiere hablar contigo.
              </div>
              <button className="primary" onClick={() => handleResponderSolicitud(s, true)}>Aceptar</button>
              <button className="ghost" onClick={() => handleResponderSolicitud(s, false)}>Rechazar</button>
            </div>
          ))}
        </div>
      )}

      {matches.length === 0 ? (
        <div className="card">
          <h2>Aún no hay chats</h2>
          <p className="muted">Cuando haya interés mutuo, aparecerá aquí. Ve a Descubrir o a la Taberna para conocer gente.</p>
        </div>
      ) : (
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
      )}
    </>
  );
}
