// src/pages/Chats.tsx

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import {
  getMyMatches,
  getMessagesWith,
  sendMessage,
} from '../lib/api';

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
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState('');

  const [myId, setMyId] = useState<string | null>(null);
  const [realtimeConnected, setRealtimeConnected] = useState(false);

  const channelRef = useRef<any>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef<HTMLInputElement>(null);

  // Identifica al usuario autenticado.
  useEffect(() => {
    let cancelled = false;

    async function loadUser() {
      try {
        const { data, error } = await supabase.auth.getUser();

        if (error) {
          throw error;
        }

        if (!cancelled) {
          setMyId(data.user?.id ?? null);
        }
      } catch (error) {
        console.error('Error obteniendo el usuario:', error);

        if (!cancelled) {
          setChatError('No se ha podido verificar tu sesión.');
        }
      }
    }

    loadUser();

    // Si la sesión cambia, actualiza el usuario.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) {
        setMyId(session?.user?.id ?? null);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  // Carga la lista de conversaciones.
  useEffect(() => {
    let cancelled = false;

    async function loadMatches() {
      setLoading(true);

      try {
        const result = await getMyMatches();

        if (!cancelled) {
          setMatches(result ?? []);
        }
      } catch (error) {
        console.error('Error cargando conversaciones:', error);

        if (!cancelled) {
          setChatError('No se han podido cargar tus conversaciones.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadMatches();

    return () => {
      cancelled = true;
    };
  }, [myId]);

  // Añade mensajes sin duplicarlos y los ordena cronológicamente.
  function mergeMessages(
    previous: Message[],
    incoming: Message[]
  ): Message[] {
    const unique = new Map<string, Message>();

    for (const message of previous) {
      unique.set(String(message.id), message);
    }

    for (const message of incoming) {
      unique.set(String(message.id), message);
    }

    return Array.from(unique.values()).sort((a, b) => {
      const dateA = (a as any).created_at;
      const dateB = (b as any).created_at;

      if (!dateA || !dateB) {
        return 0;
      }

      return (
        new Date(dateA).getTime() -
        new Date(dateB).getTime()
      );
    });
  }

  // Sincroniza los mensajes de la conversación actual.
  useEffect(() => {
    if (!openMatch || !myId) {
      setMessages([]);
      setRealtimeConnected(false);
      setChatLoading(false);

      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }

      return;
    }

    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const matchId = openMatch.id;

    setMessages([]);
    setChatLoading(true);
    setChatError('');
    setRealtimeConnected(false);

    // Carga los mensajes sin borrar los que ya hayan llegado
    // por Realtime mientras se consultaba la base de datos.
    async function syncMessages() {
      try {
        const result = await getMessagesWith(matchId);

        if (cancelled) return;

        setMessages((previous) =>
          mergeMessages(previous, result ?? [])
        );

        setChatError('');
      } catch (error) {
        console.error('Error sincronizando mensajes:', error);

        if (!cancelled) {
          setChatError('No se han podido cargar los mensajes.');
        }
      } finally {
        if (!cancelled) {
          setChatLoading(false);
        }
      }
    }

    // Suscripción a los nuevos mensajes.
    channel = supabase
      .channel(`chat:${myId}:${matchId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          if (cancelled) return;

          const newMessage = payload.new as Message;

          // Solo acepta mensajes entre el usuario actual
          // y la persona con la que está hablando.
          const relevant =
            (
              newMessage.sender_id === myId &&
              newMessage.receiver_id === matchId
            ) ||
            (
              newMessage.sender_id === matchId &&
              newMessage.receiver_id === myId
            );

          if (!relevant) return;

          setMessages((previous) =>
            mergeMessages(previous, [newMessage])
          );
        }
      )
      .subscribe((status) => {
        if (cancelled) return;

        console.log('Estado del chat:', status);

        if (status === 'SUBSCRIBED') {
          setRealtimeConnected(true);

          // Recupera posibles mensajes perdidos al reconectar.
          void syncMessages();
        } else {
          setRealtimeConnected(false);
        }

        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setChatError(
            'Conexión inestable. Intentando recuperar el chat…'
          );
        }
      });

    channelRef.current = channel;

    // Carga inicial, independientemente de Realtime.
    void syncMessages();

    return () => {
      cancelled = true;

      if (channel) {
        if (channelRef.current === channel) {
          channelRef.current = null;
        }

        void supabase.removeChannel(channel);
      }
    };
  }, [openMatch?.id, myId]);

  // Desplaza la conversación hasta el último mensaje.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'end',
    });
  }, [messages]);

  // Envía mensajes y gestiona posibles errores.
  async function handleSend(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!openMatch || !myId || sending) return;

    const content = draft.trim();

    if (!content) return;

    setSending(true);
    setChatError('');

    try {
      const result = await sendMessage(openMatch.id, content);

      if (result.error) {
        setChatError(`No se pudo enviar el mensaje: ${result.error}`);
        return;
      }

      // Si sendMessage devuelve el mensaje insertado,
      // lo añade inmediatamente sin esperar a Realtime.
      if (result.message) {
        setMessages((previous) =>
          mergeMessages(previous, [result.message!])
        );
      }

      setDraft('');

      requestAnimationFrame(() => {
        draftRef.current?.focus();
      });
    } catch (error) {
      console.error('Error enviando mensaje:', error);

      setChatError(
        'No se ha podido enviar el mensaje. Comprueba tu conexión.'
      );
    } finally {
      setSending(false);
    }
  }

  function closeChat() {
    setOpenMatch(null);
    setMessages([]);
    setDraft('');
    setChatError('');
  }

  if (loading) {
    return <p className="muted">Cargando chats…</p>;
  }

  // Conversación abierta.
  if (openMatch) {
    return (
      <>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '10px',
            gap: '10px',
          }}
        >
          <button className="ghost" onClick={closeChat}>
            ← Volver
          </button>

          <div style={{ textAlign: 'center' }}>
            <b>{openMatch.username || 'Chat'}</b>

            <div
              className="muted"
              style={{ fontSize: '12px', marginTop: '3px' }}
            >
              {realtimeConnected
                ? '● En línea'
                : '○ Conectando…'}
            </div>
          </div>

          <span style={{ width: '40px' }} />
        </div>

        {openMatch.limit_text && (
          <div className="limit">
            <b>Sus límites:</b> {openMatch.limit_text}
          </div>
        )}

        <div className="chat">
          {chatLoading && messages.length === 0 && (
            <p
              className="muted"
              style={{ textAlign: 'center', padding: '20px' }}
            >
              Cargando mensajes…
            </p>
          )}

          {!chatLoading && messages.length === 0 && !chatError && (
            <p
              className="muted"
              style={{ textAlign: 'center', padding: '20px' }}
            >
              Aún no hay mensajes. Rompe el hielo con calma.
            </p>
          )}

          {messages.map((m) => {
            const isMe = m.sender_id === myId;

            return (
              <div
                key={m.id}
                className={`msg ${isMe ? 'me' : ''}`}
              >
                {m.content}

                {m.karma_delta !== 0 && (
                  <span className="val">
                    {m.karma_delta > 0 ? '🔺' : '🔻'}{' '}
                    {m.karma_delta > 0 ? '+' : ''}
                    {m.karma_delta}
                  </span>
                )}
              </div>
            );
          })}

          <div ref={bottomRef} />
        </div>

        {chatError && (
          <div
            role="alert"
            style={{
              padding: '8px 10px',
              color: '#c0392b',
              fontSize: '13px',
            }}
          >
            {chatError}
          </div>
        )}

        <form className="compose" onSubmit={handleSend}>
          <input
            ref={draftRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Escribe un mensaje…"
            disabled={sending || !myId}
            autoComplete="off"
            aria-label="Escribir mensaje"
          />

          <button
            className="primary"
            type="submit"
            disabled={sending || !draft.trim() || !myId}
          >
            {sending ? '…' : 'Enviar'}
          </button>
        </form>

        <div style={{ height: '60px' }} />
      </>
    );
  }

  // Lista de conversaciones.
  if (matches.length === 0) {
    return (
      <div className="card">
        <h2>Aún no hay chats</h2>

        <p className="muted">
          Cuando haya interés mutuo, aparecerá aquí.
          Ve a Descubrir para conocer gente.
        </p>
      </div>
    );
  }

  return (
    <div className="list">
      {matches.map((p) => (
        <button
          key={p.id}
          className="item"
          onClick={() => setOpenMatch(p)}
        >
          <span
            className="avatar sm"
            style={{
              background: p.avatar_color || '#6b3fa0',
            }}
          >
            {(p.username || '?')[0].toUpperCase()}
          </span>

          <span className="meta">
            <b>{p.username || 'Anónimo'}</b>
            <span className="preview">
              {p.bio || 'Sin bio'}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
