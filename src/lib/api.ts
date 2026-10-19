// src/lib/api.ts
import { supabase } from './supabase';
import type { Profile } from '../types/database';

// ============================================================
// PERFIL
// ============================================================

export async function getMyProfile(): Promise<Profile | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error) {
    console.error('Error cargando perfil:', error);
    return null;
  }
  return data as Profile;
}

export async function updateMyProfile(
  updates: Partial<Pick<Profile, 'username' | 'bio' | 'limit_text' | 'avatar_color' | 'tags'>>
): Promise<Profile | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', user.id)
    .select()
    .single();

  if (error) {
    console.error('Error actualizando perfil:', error);
    return null;
  }
  return data as Profile;
}

// ============================================================
// DESCUBRIR
// ============================================================

export async function getDiscoverProfiles(): Promise<Profile[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  // Perfiles que no he likeado ni pasado
  const { data: likes } = await supabase
    .from('likes')
    .select('to_user_id')
    .eq('from_user_id', user.id);

  const likedIds = (likes || []).map(l => l.to_user_id);

  const { data: passed } = await supabase
    .from('passed')
    .select('to_user_id')
    .eq('from_user_id', user.id);

  const passedIds = (passed || []).map(p => p.to_user_id);

  const excluded = [...likedIds, ...passedIds, user.id];

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .not('id', 'in', `(${excluded.join(',')})`)
    .limit(20);

  if (error) {
    console.error('Error descubriendo perfiles:', error);
    return [];
  }
  return (data || []) as Profile[];
}

export async function passUser(toUserId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { error } = await supabase
    .from('passed')
    .insert({ from_user_id: user.id, to_user_id: toUserId });

  if (error) {
    console.error('Error pasando:', error);
    return false;
  }
  return true;
}

export async function likeUser(toUserId: string): Promise<{ matched: boolean }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { matched: false };

  const { error } = await supabase
    .from('likes')
    .insert({ from_user_id: user.id, to_user_id: toUserId });

  if (error) {
    console.error('Error dando like:', error);
    return { matched: false };
  }

  // Comprobar si hay match (el trigger lo crea, pero lo verificamos)
  const { data: match } = await supabase
    .from('matches')
    .select('id')
    .or(`and(user1_id.eq.${user.id},user2_id.eq.${toUserId}),and(user1_id.eq.${toUserId},user2_id.eq.${user.id})`)
    .maybeSingle();

  return { matched: !!match };
}

// ============================================================
// MATCHES
// ============================================================

export async function getMyMatches(): Promise<Profile[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('matches')
    .select('user1_id, user2_id')
    .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`);

  if (error || !data) return [];

  const otherIds = data.map(m => m.user1_id === user.id ? m.user2_id : m.user1_id);
  if (otherIds.length === 0) return [];

  const { data: profiles } = await supabase
    .from('profiles')
    .select('*')
    .in('id', otherIds);

  return (profiles || []) as Profile[];
}

// ============================================================
// MENSAJES
// ============================================================

export type Message = {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  karma_delta: number;
  is_flagged: boolean;
  created_at: string;
};

export async function getMessagesWith(otherUserId: string): Promise<Message[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .or(`and(sender_id.eq.${user.id},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${user.id})`)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error cargando mensajes:', error);
    return [];
  }
  return (data || []) as Message[];
}

export async function sendMessage(
  receiverId: string,
  content: string
): Promise<{ message: Message | null; karmaAfter: number | null; error: string | null }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { message: null, karmaAfter: null, error: 'No autenticado' };

  const { data, error } = await supabase
    .from('messages')
    .insert({
      sender_id: user.id,
      receiver_id: receiverId,
      content,
    })
    .select()
    .single();

  if (error) {
    console.error('Error enviando mensaje:', error);
    return { message: null, karmaAfter: null, error: error.message };
  }

  // Leer el karma actualizado (el trigger lo modificó)
  const { data: profile } = await supabase
    .from('profiles')
    .select('karma_score, strikes')
    .eq('id', user.id)
    .single();

  return {
    message: data as Message,
    karmaAfter: profile?.karma_score ?? null,
    error: null,
  };
}
