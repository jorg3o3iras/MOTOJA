import { supabase } from '../lib/supabase.js';
import { safeLocalGet, safeLocalSet } from '../lib/utils.js';
import { STORAGE } from '../lib/config.js';

export function carregarFavoritosLocais() {
  try {
    const raw = safeLocalGet(STORAGE.FAV, '[]');
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}

export function salvarFavoritosLocais(favoritos) {
  safeLocalSet(STORAGE.FAV, JSON.stringify(favoritos));
}

export async function carregarFavoritosDoBackend() {
  const { data, error } = await supabase
    .from('favoritos')
    .select('id, nome, lat, lng, icone, endereco')
    .order('criado_em', { ascending: false });
  if (error) return [];
  return data || [];
}

export async function salvarFavoritoNoBackend(userId, fav) {
  if (!userId) return null;
  const { data, error } = await supabase.from('favoritos').insert({
    profile_id: userId,
    nome: fav.nome,
    lat: fav.lat,
    lng: fav.lng,
    icone: fav.icone,
    endereco: fav.endereco
  }).select().single();
  if (error) throw error;
  return data;
}

export async function deletarFavoritoDoBackend(id) {
  const { error } = await supabase.from('favoritos').delete().eq('id', id);
  return !error;
}