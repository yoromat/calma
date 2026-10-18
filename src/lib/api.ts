// src/lib/api.ts
import { supabase } from './supabase';
import type { Profile } from '../types/database';

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

export async function getDiscoverProfiles(): Promise<Profile[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .neq('id', user.id)
    .limit(20);

  if (error) {
    console.error('Error descubriendo perfiles:', error);
    return [];
  }
  return (data || []) as Profile[];
}

// ============================================================
// TEST DE KARMA (Fase 3 - solo para probar el backend)
// ============================================================

export type TestKarmaResult = {
  karma_after: number;
  delta: number;
  flagged: boolean;
};

export async function testKarma(content: string): Promise<TestKarmaResult | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.error('testKarma: no hay usuario autenticado');
    return null;
  }

  const { data, error } = await supabase.rpc('test_karma', {
    p_content: content,
    p_user_id: user.id,
  });

  if (error) {
    console.error('Error en test_karma:', error);
    return null;
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;

  return {
    karma_after: row.karma_after,
    delta: row.delta,
    flagged: row.flagged,
  };
}
