import { supabase } from '../lib/supabase.js';

export async function criarCorridaBackend(origem, destino, distancia, duracao) {
  const { data, error } = await supabase.rpc('criar_corrida', {
    p_origem_nome: origem.nome, p_origem_lat: origem.lat, p_origem_lng: origem.lng,
    p_destino_nome: destino.nome, p_destino_lat: destino.lat, p_destino_lng: destino.lng,
    p_distancia_km: distancia, p_duracao_min: duracao
  });
  if (error) throw error;
  return data;
}

export async function cancelarCorrida(corridaId, por = 'passageiro') {
  const { error } = await supabase.rpc('cancelar_corrida', {
    p_corrida_id: corridaId, p_por: por
  });
  if (error) throw error;
}

export async function aceitarCorrida(corridaId) {
  const { data, error } = await supabase.rpc('aceitar_corrida', { p_corrida_id: corridaId });
  if (error) throw error;
  return data;
}

export async function recusarCorrida(corridaId) {
  const { error } = await supabase.rpc('recusar_corrida', { p_corrida_id: corridaId });
  if (error) throw error;
}

export async function expirarOferta(corridaId) {
  const { error } = await supabase.rpc('expirar_oferta', { p_corrida_id: corridaId });
  if (error) throw error;
}

export async function motoqueiroChegou(corridaId) {
  const { error } = await supabase.rpc('motoqueiro_chegou', { p_corrida_id: corridaId });
  if (error) throw error;
}

export async function iniciarCorrida(corridaId, codigo) {
  const { error } = await supabase.rpc('iniciar_corrida', {
    p_corrida_id: corridaId, p_codigo: codigo
  });
  if (error) throw error;
}

export async function finalizarCorrida(corridaId) {
  const { data, error } = await supabase.rpc('finalizar_corrida', { p_corrida_id: corridaId });
  if (error) throw error;
  return data;
}

export async function confirmarPagamento(corridaId, forma) {
  const { error } = await supabase.rpc('confirmar_pagamento', {
    p_corrida_id: corridaId, p_forma: forma
  });
  if (error) throw error;
}

export async function avaliarCorrida(corridaId, nota, comentario) {
  const { error } = await supabase.rpc('avaliar_corrida', {
    p_corrida_id: corridaId, p_nota: nota, p_comentario: comentario || null
  });
  if (error) throw error;
}

export async function buscarCorridaPorId(corridaId) {
  const { data } = await supabase
    .from('corridas')
    .select('id, status, motoqueiro_id, offer_motoqueiro_id, codigo_embarque, origem_nome, destino_nome, preco_total, distancia_km, duracao_min')
    .eq('id', corridaId)
    .maybeSingle();
  return data;
}