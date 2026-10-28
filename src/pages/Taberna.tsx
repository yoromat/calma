// src/pages/Taberna.tsx
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Profile } from '../types/database';

type AvatarState = {
  user_id: string;
  username: string;
  color: string;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
};

type Burbuja = { texto: string; timestamp: number };
type HistorialItem = { user_id: string; username: string; texto: string; timestamp: number };

type ChatPrivado = {
  conUserId: string;
  conUsername: string;
  mensajes: { from: string; texto: string; timestamp: number }[];
  pendiente: boolean; // true si esperamos aceptación
};

const SALA = 'taberna-principal';
const VELOCIDAD = 3;
const DISTANCIA_HABLAR = 80;
const DISTANCIA_BURBUJA = 180;
const DISTANCIA_CHAT_PRIVADO = 120;
const DURACION_BURBUJA = 8000;
const INTERVALO_BROADCAST = 33;
const FACTOR_INTERPOLACION = 0.35;
const MAX_HISTORIAL = 50;

export function Taberna() {
  const [myProfile, setMyProfile] = useState<Profile | null>(null);
  const [avatares, setAvatares] = useState<Record<string, AvatarState>>({});
  const [conectado, setConectado] = useState(false);
  const [cercaDe, setCercaDe] = useState<AvatarState | null>(null);
  const [burbujas, setBurbujas] = useState<Record<string, Burbuja>>({});
  const [historial, setHistorial] = useState<HistorialItem[]>([]);
  const [mostrarHistorial, setMostrarHistorial] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [chatPrivado, setChatPrivado] = useState<ChatPrivado | null>(null);
  const [solicitudRecibida, setSolicitudRecibida] = useState<{ fromUserId: string; fromUsername: string } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const channelRef = useRef<any>(null);
  const myPosRef = useRef({ x: 300, y: 300 });
  const targetPosRef = useRef({ x: 300, y: 300 });
  const avataresRef = useRef<Record<string, AvatarState>>({});
  const burbujasRef = useRef<Record<string, Burbuja>>({});
  const animationRef = useRef<number>(0);
  const lastBroadcastRef = useRef(0);
  const historialRef = useRef<HistorialItem[]>([]);
  const chatPrivadoRef = useRef<ChatPrivado | null>(null);
  const solicitudRecibidaRef = useRef<{ fromUserId: string; fromUsername: string } | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        supabase.from('profiles').select('*').eq('id', data.user.id).single()
          .then(({ data: p }) => setMyProfile(p as Profile));
      }
    });
  }, []);

  useEffect(() => {
    if (!myProfile) return;
    const myId = myProfile.id;

    const channel = supabase.channel(`sala:${SALA}`, {
      config: { presence: { key: myId } },
    });

    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      const nuevos: Record<string, AvatarState> = {};

      Object.keys(state).forEach((key) => {
        const presence = state[key][0] as any;
        if (presence && presence.user_id !== myId) {
          const existing = avataresRef.current[presence.user_id];
          nuevos[presence.user_id] = {
            user_id: presence.user_id,
            username: presence.username,
            color: presence.color,
            x: existing ? existing.x : 300,
            y: existing ? existing.y : 300,
            targetX: existing ? existing.x : 300,
            targetY: existing ? existing.y : 300,
          };
        }
      });

      avataresRef.current = nuevos;
      setAvatares(nuevos);
    });

    channel.on('broadcast', { event: 'movimiento' }, (payload) => {
      const { user_id, x, y } = payload.payload as any;
      if (user_id === myId) return;
      const existing = avataresRef.current[user_id];
      if (existing) {
        existing.targetX = x;
        existing.targetY = y;
      }
    });

    channel.on('broadcast', { event: 'mensaje' }, (payload) => {
      const { user_id, username, texto } = payload.payload as any;
      if (user_id === myId) return;

      burbujasRef.current[user_id] = { texto, timestamp: Date.now() };
      setBurbujas({ ...burbujasRef.current });

      const item: HistorialItem = { user_id, username, texto, timestamp: Date.now() };
      historialRef.current = [...historialRef.current, item].slice(-MAX_HISTORIAL);
      setHistorial([...historialRef.current]);
    });

    // ⭐ Solicitud de chat privado
    channel.on('broadcast', { event: 'solicitud_privado' }, (payload) => {
      const { user_id, username } = payload.payload as any;
      if (user_id === myId) return;
      // Si ya estamos en un chat privado, ignorar
      if (chatPrivadoRef.current) return;
      const nueva = { fromUserId: user_id, fromUsername: username };
      solicitudRecibidaRef.current = nueva;
      setSolicitudRecibida(nueva);
    });

    // ⭐ Aceptación / rechazo de solicitud
    channel.on('broadcast', { event: 'respuesta_privado' }, (payload) => {
      const { user_id, acepta } = payload.payload as any;
      if (user_id === myId) return;
      const actual = chatPrivadoRef.current;
      if (!actual) return;
      if (actual.conUserId !== user_id) return;

      if (acepta) {
        const nuevo = { ...actual, pendiente: false };
        chatPrivadoRef.current = nuevo;
        setChatPrivado(nuevo);
        setAviso(`${actual.conUsername} ha aceptado el chat privado.`);
        setTimeout(() => setAviso(null), 3000);
      } else {
        chatPrivadoRef.current = null;
        setChatPrivado(null);
        setAviso(`${actual.conUsername} ha rechazado el chat privado.`);
        setTimeout(() => setAviso(null), 3000);
      }
    });

    // ⭐ Mensaje de chat privado
    channel.on('broadcast', { event: 'mensaje_privado' }, (payload) => {
      const { user_id, texto } = payload.payload as any;
      if (user_id === myId) return;
      const actual = chatPrivadoRef.current;
      if (!actual || actual.pendiente) return;
      if (actual.conUserId !== user_id) return;

      const nuevo: ChatPrivado = {
        ...actual,
        mensajes: [...actual.mensajes, { from: user_id, texto, timestamp: Date.now() }],
      };
      chatPrivadoRef.current = nuevo;
      setChatPrivado(nuevo);
    });

    // ⭐ Cierre de chat privado (cuando alguien se aleja o lo cierra)
    channel.on('broadcast', { event: 'cerrar_privado' }, (payload) => {
      const { user_id } = payload.payload as any;
      if (user_id === myId) return;
      const actual = chatPrivadoRef.current;
      if (!actual) return;
      if (actual.conUserId !== user_id) return;
      chatPrivadoRef.current = null;
      setChatPrivado(null);
    });

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        setConectado(true);
        await channel.track({
          user_id: myId,
          username: myProfile.username || 'Anónimo',
          color: myProfile.avatar_color || '#6b3fa0',
        });
      }
    });

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [myProfile]);

  useEffect(() => {
    if (!myProfile) return;
    const myId = myProfile.id;

    const loop = () => {
      const pos = myPosRef.current;
      const target = targetPosRef.current;
      const dx = target.x - pos.x;
      const dy = target.y - pos.y;
      const dist = Math.hypot(dx, dy);

      if (dist > 2) {
        const move = Math.min(VELOCIDAD, dist);
        myPosRef.current = {
          x: pos.x + (dx / dist) * move,
          y: pos.y + (dy / dist) * move,
        };

        const now = Date.now();
        if (channelRef.current && now - lastBroadcastRef.current > INTERVALO_BROADCAST) {
          lastBroadcastRef.current = now;
          channelRef.current.send({
            type: 'broadcast',
            event: 'movimiento',
            payload: { user_id: myId, x: myPosRef.current.x, y: myPosRef.current.y },
          });
        }
      }

      Object.values(avataresRef.current).forEach(av => {
        const adx = av.targetX - av.x;
        const ady = av.targetY - av.y;
        const adist = Math.hypot(adx, ady);
        if (adist > 1) {
          av.x += adx * FACTOR_INTERPOLACION;
          av.y += ady * FACTOR_INTERPOLACION;
        } else {
          av.x = av.targetX;
          av.y = av.targetY;
        }
      });

      // Limpiar burbujas
      const ahoraMs = Date.now();
      let huboCambios = false;
      Object.keys(burbujasRef.current).forEach(id => {
        if (ahoraMs - burbujasRef.current[id].timestamp > DURACION_BURBUJA) {
          delete burbujasRef.current[id];
          huboCambios = true;
        }
      });
      if (huboCambios) setBurbujas({ ...burbujasRef.current });

      // ⭐ Comprobar si el chat privado sigue activo (distancia)
      const actualPrivado = chatPrivadoRef.current;
      if (actualPrivado && !actualPrivado.pendiente) {
        const otro = avataresRef.current[actualPrivado.conUserId];
        if (otro) {
          const d = Math.hypot(otro.x - myPosRef.current.x, otro.y - myPosRef.current.y);
          if (d > DISTANCIA_CHAT_PRIVADO) {
            // Cerrar chat privado
            chatPrivadoRef.current = null;
            setChatPrivado(null);
            if (channelRef.current) {
              channelRef.current.send({
                type: 'broadcast',
                event: 'cerrar_privado',
                payload: { user_id: myId },
              });
            }
          }
        } else {
          // El otro se ha ido de la sala
          chatPrivadoRef.current = null;
          setChatPrivado(null);
        }
      }

      let cercano: AvatarState | null = null;
      let minDist = DISTANCIA_HABLAR;
      Object.values(avataresRef.current).forEach(av => {
        const d = Math.hypot(av.x - myPosRef.current.x, av.y - myPosRef.current.y);
        if (d < minDist) {
          minDist = d;
          cercano = av;
        }
      });
      setCercaDe(cercano);

      setAvatares({ ...avataresRef.current });

      animationRef.current = requestAnimationFrame(loop);
    };

    animationRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationRef.current);
  }, [myProfile]);

  const handleFloorClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    targetPosRef.current = { x, y };
  };

  const handleEnviarMensaje = (e: React.FormEvent) => {
    e.preventDefault();
    if (!mensaje.trim() || !myProfile || !channelRef.current) return;

    const texto = mensaje.trim();
    const myId = myProfile.id;

    channelRef.current.send({
      type: 'broadcast',
      event: 'mensaje',
      payload: { user_id: myId, username: myProfile.username || 'Anónimo', texto },
    });

    burbujasRef.current[myId] = { texto, timestamp: Date.now() };
    setBurbujas({ ...burbujasRef.current });

    const item: HistorialItem = { user_id: myId, username: myProfile.username || 'Anónimo', texto, timestamp: Date.now() };
    historialRef.current = [...historialRef.current, item].slice(-MAX_HISTORIAL);
    setHistorial([...historialRef.current]);

    setMensaje('');
  };

  // ⭐ Enviar solicitud de chat privado
  const handleSolicitarPrivado = () => {
    if (!cercaDe || !myProfile || !channelRef.current) return;

    const nuevo: ChatPrivado = {
      conUserId: cercaDe.user_id,
      conUsername: cercaDe.username,
      mensajes: [],
      pendiente: true,
    };
    chatPrivadoRef.current = nuevo;
    setChatPrivado(nuevo);

    channelRef.current.send({
      type: 'broadcast',
      event: 'solicitud_privado',
      payload: { user_id: myProfile.id, username: myProfile.username || 'Anónimo' },
    });

    setAviso(`Solicitud enviada a ${cercaDe.username}. Esperando respuesta…`);
    setTimeout(() => setAviso(null), 4000);
  };

  // ⭐ Responder a solicitud recibida
  const handleResponderSolicitud = (acepta: boolean) => {
    const sol = solicitudRecibidaRef.current;
    if (!sol || !myProfile || !channelRef.current) return;

    channelRef.current.send({
      type: 'broadcast',
      event: 'respuesta_privado',
      payload: { user_id: myProfile.id, acepta },
    });

    if (acepta) {
      const nuevo: ChatPrivado = {
        conUserId: sol.fromUserId,
        conUsername: sol.fromUsername,
        mensajes: [],
        pendiente: false,
      };
      chatPrivadoRef.current = nuevo;
      setChatPrivado(nuevo);
    }

    solicitudRecibidaRef.current = null;
    setSolicitudRecibida(null);
  };

  // ⭐ Enviar mensaje de chat privado
  const handleEnviarPrivado = (e: React.FormEvent) => {
    e.preventDefault();
    const actual = chatPrivadoRef.current;
    if (!actual || actual.pendiente || !myProfile || !channelRef.current) return;

    const input = (e.target as HTMLFormElement).elements.namedItem('privado') as HTMLInputElement;
    const texto = input.value.trim();
    if (!texto) return;

    channelRef.current.send({
      type: 'broadcast',
      event: 'mensaje_privado',
      payload: { user_id: myProfile.id, texto },
    });

    const nuevo: ChatPrivado = {
      ...actual,
      mensajes: [...actual.mensajes, { from: myProfile.id, texto, timestamp: Date.now() }],
    };
    chatPrivadoRef.current = nuevo;
    setChatPrivado(nuevo);
    input.value = '';
  };

  const handleCerrarPrivado = () => {
    const actual = chatPrivadoRef.current;
    if (actual && channelRef.current && myProfile) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'cerrar_privado',
        payload: { user_id: myProfile.id },
      });
    }
    chatPrivadoRef.current = null;
    setChatPrivado(null);
  };

  if (!myProfile) return <p className="muted">Cargando taberna…</p>;

  return (
    <div style={{ padding: '8px', position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <h2 style={{ margin: 0 }}>🍻 La Taberna</h2>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span className="muted" style={{ fontSize: '0.85rem' }}>
            {conectado ? `● ${Object.keys(avatares).length + 1} en la sala` : 'Conectando…'}
          </span>
          <button className="pill" onClick={() => setMostrarHistorial(!mostrarHistorial)}>
            {mostrarHistorial ? '📜' : '📖'}
          </button>
        </div>
      </div>

      {aviso && (
        <div style={{ background: 'var(--ok)', color: '#fff', padding: '8px 12px', borderRadius: '8px', marginBottom: '8px', fontSize: '0.85rem' }}>
          {aviso}
        </div>
      )}

      {solicitudRecibida && (
        <div style={{ background: 'var(--warn)', color: '#fff', padding: '10px 14px', borderRadius: '8px', marginBottom: '8px', display: 'flex', gap: '10px', alignItems: 'center', justifyContent: 'space-between' }}>
          <span><b>{solicitudRecibida.fromUsername}</b> quiere hablar en privado contigo.</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="primary" onClick={() => handleResponderSolicitud(true)}>Aceptar</button>
            <button className="ghost" onClick={() => handleResponderSolicitud(false)} style={{ color: '#fff' }}>Rechazar</button>
          </div>
        </div>
      )}

      <div
        style={{
          background: 'rgba(107, 63, 160, 0.12)',
          border: '1px solid var(--acc)',
          borderRadius: '12px',
          padding: '10px 14px',
          marginBottom: '10px',
          fontSize: '0.82rem',
          lineHeight: 1.4,
        }}
      >
        <b style={{ color: 'var(--acc)' }}>Normas de la taberna:</b>{' '}
        Respeto los tiempos y los «no». Sin contenido sexual no solicitado. Si algo te incomoda, usa el botón de reporte. Este es un espacio tranquilo.
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        <div
          onClick={handleFloorClick}
          style={{
            position: 'relative',
            flex: 1,
            height: '55vh',
            background: 'linear-gradient(135deg, #2c1810 0%, #4a2c1a 100%)',
            borderRadius: '16px',
            overflow: 'hidden',
            cursor: 'crosshair',
            border: '2px solid #5a3a2a',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: myPosRef.current.x - 16,
              top: myPosRef.current.y - 16,
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: myProfile.avatar_color || '#6b3fa0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontWeight: 'bold',
              fontSize: '14px',
              border: '2px solid #fff',
              boxShadow: '0 0 8px rgba(0,0,0,0.5)',
              zIndex: 10,
              transition: 'left 0.05s linear, top 0.05s linear',
            }}
          >
            {(myProfile.username || '?')[0].toUpperCase()}
          </div>

          {burbujas[myProfile.id] && (
            <div
              style={{
                position: 'absolute',
                left: myPosRef.current.x,
                top: myPosRef.current.y - 50,
                transform: 'translateX(-50%)',
                background: 'var(--acc)',
                color: '#fff',
                padding: '6px 10px',
                borderRadius: '12px',
                fontSize: '0.8rem',
                maxWidth: '180px',
                whiteSpace: 'normal',
                zIndex: 20,
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              }}
            >
              {burbujas[myProfile.id].texto}
            </div>
          )}

          {Object.values(avatares).map((av) => {
            const burbuja = burbujas[av.user_id];
            const distancia = Math.hypot(av.x - myPosRef.current.x, av.y - myPosRef.current.y);
            const mostrarBurbuja = burbuja && distancia < DISTANCIA_BURBUJA;

            return (
              <div key={av.user_id}>
                <div
                  style={{
                    position: 'absolute',
                    left: av.x - 16,
                    top: av.y - 16,
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: av.color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontWeight: 'bold',
                    fontSize: '14px',
                    border: '2px solid rgba(255,255,255,0.5)',
                    transition: 'left 0.05s linear, top 0.05s linear',
                  }}
                  title={av.username}
                >
                  {av.username[0].toUpperCase()}
                </div>

                {mostrarBurbuja && (
                  <div
                    style={{
                      position: 'absolute',
                      left: av.x,
                      top: av.y - 50,
                      transform: 'translateX(-50%)',
                      background: 'var(--surface)',
                      color: 'var(--ink)',
                      padding: '6px 10px',
                      borderRadius: '12px',
                      fontSize: '0.8rem',
                      maxWidth: '180px',
                      whiteSpace: 'normal',
                      zIndex: 20,
                      boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                      border: '1px solid var(--line)',
                    }}
                  >
                    <b style={{ fontSize: '0.7rem', color: 'var(--mute)', display: 'block' }}>
                      {av.username}
                    </b>
                    {burbuja.texto}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Panel lateral: historial o chat privado */}
        {mostrarHistorial && !chatPrivado && (
          <div
            style={{
              width: '220px',
              height: '55vh',
              background: 'var(--surface)',
              border: '1px solid var(--line)',
              borderRadius: '16px',
              padding: '10px',
              overflowY: 'auto',
              fontSize: '0.82rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <b>Historial</b>
              <button className="pill" onClick={() => setMostrarHistorial(false)}>✕</button>
            </div>
            {historial.length === 0 ? (
              <p className="muted">Aún no se ha dicho nada.</p>
            ) : (
              historial.map((h, i) => (
                <div key={i} style={{ marginBottom: '6px', lineHeight: 1.3 }}>
                  <b style={{ color: 'var(--acc)' }}>{h.username}:</b>{' '}
                  <span>{h.texto}</span>
                </div>
              ))
            )}
          </div>
        )}

        {chatPrivado && (
          <div
            style={{
              width: '220px',
              height: '55vh',
              background: 'var(--surface)',
              border: '1px solid var(--acc)',
              borderRadius: '16px',
              padding: '10px',
              display: 'flex',
              flexDirection: 'column',
              fontSize: '0.82rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <b style={{ color: 'var(--acc)' }}>💬 {chatPrivado.conUsername}</b>
              <button className="pill" onClick={handleCerrarPrivado}>✕</button>
            </div>

            {chatPrivado.pendiente ? (
              <p className="muted">Esperando a que acepte…</p>
            ) : (
              <>
                <div style={{ flex: 1, overflowY: 'auto', marginBottom: '8px' }}>
                  {chatPrivado.mensajes.length === 0 ? (
                    <p className="muted">Decid algo con calma.</p>
                  ) : (
                    chatPrivado.mensajes.map((m, i) => {
                      const esMio = m.from === myProfile.id;
                      return (
                        <div
                          key={i}
                          style={{
                            textAlign: esMio ? 'right' : 'left',
                            marginBottom: '6px',
                          }}
                        >
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '5px 9px',
                              borderRadius: '10px',
                              background: esMio ? 'var(--acc)' : 'var(--soft)',
                              color: esMio ? '#fff' : 'var(--ink)',
                              maxWidth: '85%',
                              textAlign: 'left',
                            }}
                          >
                            {m.texto}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
                <form onSubmit={handleEnviarPrivado} style={{ display: 'flex', gap: '4px' }}>
                  <input
                    name="privado"
                    placeholder="Susurro…"
                    style={{
                      flex: 1,
                      font: 'inherit',
                      padding: '6px 8px',
                      borderRadius: '8px',
                      border: '1px solid var(--line)',
                      background: 'var(--bg)',
                      color: 'var(--ink)',
                      fontSize: '0.8rem',
                    }}
                  />
                  <button className="primary" type="submit" style={{ padding: '6px 10px', minHeight: 0 }}>→</button>
                </form>
              </>
            )}
          </div>
        )}
      </div>

      <form onSubmit={handleEnviarMensaje} style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
        <input
          value={mensaje}
          onChange={(e) => setMensaje(e.target.value)}
          placeholder="Di algo en la taberna…"
          style={{
            flex: 1,
            font: 'inherit',
            padding: '10px 12px',
            borderRadius: '12px',
            border: '1px solid var(--line)',
            background: 'var(--bg)',
            color: 'var(--ink)',
          }}
        />
        <button className="primary" type="submit" disabled={!mensaje.trim()}>
          Decir
        </button>
      </form>

      <div style={{ marginTop: '10px', minHeight: '40px' }}>
        {cercaDe ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'center' }}>
            <span>Estás cerca de <b>{cercaDe.username}</b></span>
            {!chatPrivado && (
              <button className="primary" onClick={handleSolicitarPrivado}>Susurrar en privado</button>
            )}
          </div>
        ) : (
          <p className="muted" style={{ textAlign: 'center', fontSize: '0.85rem' }}>
            Toca en la taberna para moverte. Acércate a alguien para susurrar.
          </p>
        )}
      </div>
    </div>
  );
}
