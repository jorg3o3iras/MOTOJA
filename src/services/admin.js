import { supabase } from '../lib/supabase.js';

export async function validarSenhaAdmin(senha) {
  const { data, error } = await supabase.rpc('validar_senha_admin', { p_senha: senha });
  if (error) throw error;
  return !!data;
}

export async function souAdmin() {
  const { data, error } = await supabase.rpc('sou_admin');
  if (error) throw error;
  return !!data;
}

export async function carregarPendentes() {
  const { data, error } = await supabase
    .from('motoqueiros')
    .select('id, status, moto_marca, moto_modelo, moto_placa, criado_em, profiles(nome_completo, telefone)')
    .eq('status', 'pendente')
    .order('criado_em', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function carregarMotoqueiros(filtro) {
  let q = supabase
    .from('motoqueiros')
    .select('id, status, moto_marca, moto_modelo, moto_placa, disponivel, total_corridas, criado_em, profiles(nome_completo, telefone)')
    .order('criado_em', { ascending: false });
  if (filtro) q = q.eq('status', filtro);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function carregarCorridas() {
  const { data, error } = await supabase
    .from('corridas')
    .select(`
      id, status, origem_nome, destino_nome, distancia_km, preco_total, criado_em,
      passageiro:profiles!corridas_passageiro_id_fkey (nome_completo, telefone),
      motoqueiro:motoqueiros!corridas_motoqueiro_id_fkey (
        moto_marca, moto_modelo, moto_placa,
        profiles (nome_completo, telefone)
      )
    `)
    .order('criado_em', { ascending: false })
    .limit(100);
  if (error) throw error;
  return data || [];
}

export async function carregarStats() {
  const { data, error } = await supabase.rpc('admin_stats');
  if (error) throw error;
  return data || {};
}