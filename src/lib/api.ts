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

// ============================================================
// ALMA: RECUERDOS Y MISIONES
// ============================================================

export type Memory = {
  id: string;
  user_id: string;
  about_user_id: string;
  text: string;
  valence: number;
  is_nucleo: boolean;
  created_at: string;
};

export async function getMyMemories(): Promise<Memory[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('memories')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error('Error cargando recuerdos:', error);
    return [];
  }
  return (data || []) as Memory[];
}

export async function getQuestStatus(): Promise<{
  login: boolean;
  firstMsg: boolean;
  polite: boolean;
}> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { login: false, firstMsg: false, polite: false };

  const today = new Date().toISOString().split('T')[0];

  // Login: si se ha registrado actividad hoy
  const { data: loginQuest } = await supabase
    .from('quests')
    .select('completed_at')
    .eq('user_id', user.id)
    .eq('quest_id', 'login')
    .eq('day', today)
    .maybeSingle();

  // Primer mensaje: si ha enviado un mensaje hoy
  const { count: msgCount } = await supabase
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('sender_id', user.id)
    .gte('created_at', `${today}T00:00:00`);

  // Educado: si ha enviado 3 mensajes con palabras respetuosas hoy
  const { count: politeCount } = await supabase
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('sender_id', user.id)
    .eq('karma_delta', 3)
    .gte('created_at', `${today}T00:00:00`);

  return {
    login: !!loginQuest,
    firstMsg: (msgCount ?? 0) > 0,
    polite: (politeCount ?? 0) >= 3,
  };
}

export async function claimQuest(questId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const today = new Date().toISOString().split('T')[0];

  const { error } = await supabase
    .from('quests')
    .insert({
      user_id: user.id,
      quest_id: questId,
      day: today,
    });

  if (error) {
    console.error('Error reclamando misión:', error);
    return false;
  }

  // Dar recompensa en karma
  const rewards: Record<string, number> = {
    login: 2,
    firstMsg: 5,
    polite: 10,
  };

  const reward = rewards[questId] ?? 0;
  if (reward > 0) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('karma_score')
      .eq('id', user.id)
      .single();

    if (profile) {
      await supabase
        .from('profiles')
        .update({ karma_score: Math.min(100, (profile.karma_score ?? 0) + reward) })
        .eq('id', user.id);
    }
  }

  return true;
}
