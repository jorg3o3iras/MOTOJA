import { supabase } from '../lib/supabase.js';

export async function buscarMotoqueirosProximos(lat, lng, raioKm = 5, limite = 10) {
  try {
    const { data, error } = await supabase.rpc('buscar_motoqueiros_proximos', {
      p_lat: lat, p_lng: lng, p_raio_km: raioKm, p_limite: limite
    });
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.warn('[MotoJá] buscar motoqueiros:', e.message);
    return [];
  }
}

export async function atualizarMinhaPosicao(lat, lng, disponivel = true) {
  try {
    const { error } = await supabase.rpc('atualizar_posicao_motoqueiro', {
      p_lat: lat, p_lng: lng, p_disponivel: disponivel
    });
    if (error) throw error;
    return true;
  } catch (e) {
    console.warn('[MotoJá] atualizar posição:', e.message);
    return false;
  }
}

export async function buscarMeuCadastroMotoqueiro(userId) {
  if (!userId) return null;
  const { data, error } = await supabase
    .from('motoqueiros')
    .select('id, status, moto_marca, moto_modelo, moto_placa, disponivel, nota_media, total_corridas')
    .eq('profile_id', userId)
    .maybeSingle();
  if (error) return null;
  return data;
}

export async function salvarCadastroMotoqueiro(userId, dados) {
  if (!userId) throw new Error('Faça login primeiro');
  const payload = {
    profile_id: userId,
    status: 'pendente',
    moto_marca:  dados.marca  || null,
    moto_modelo: dados.modelo || null,
    moto_ano:    parseInt(dados.ano) || null,
    moto_cor:    dados.cor    || null,
    moto_placa:  dados.placa  || null,
    moto_cc:     parseInt(dados.cc)  || null
  };
  const { data, error } = await supabase
    .from('motoqueiros')
    .upsert(payload, { onConflict: 'profile_id' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function uploadDocumento(userId, motoqueiroId, tipo, arquivo) {
  if (!userId) throw new Error('Faça login primeiro');
  const ext = (arquivo.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${userId}/${motoqueiroId}/${tipo}.${ext}`;
  const { error: errUpload } = await supabase.storage
    .from('documentos')
    .upload(path, arquivo, { upsert: true, contentType: arquivo.type });
  if (errUpload) throw errUpload;
  await supabase.from('documentos').insert({
    motoqueiro_id: motoqueiroId, tipo, url_storage: path, status: 'enviado'
  });
  return path;
}

export async function carregarDocumentosMotoqueiro(motoqueiroId) {
  const { data, error } = await supabase
    .from('documentos')
    .select('id, tipo, url_storage, status, criado_em')
    .eq('motoqueiro_id', motoqueiroId);
  if (error || !data?.length) return [];

  return Promise.all(data.map(async (d) => {
    const { data: signed } = await supabase.storage
      .from('documentos')
      .createSignedUrl(d.url_storage, 3600);
    return { ...d, url_assinada: signed?.signedUrl || null };
  }));
}

export async function carregarMotoqueiroParaCorrida(motoqueiroId) {
  const { data } = await supabase
    .from('motoqueiros')
    .select(`
      id, moto_marca, moto_modelo, moto_ano, moto_cor, moto_placa,
      nota_media, total_corridas, lat, lng,
      profiles(nome_completo, telefone)
    `)
    .eq('id', motoqueiroId)
    .single();
  return data;
}

/* ---------- Admin: ações sobre motoqueiros ---------- */

export async function mudarStatusMotoqueiro(id, novoStatus) {
  const { error } = await supabase
    .from('motoqueiros')
    .update({
      status: novoStatus,
      aprovado_em: novoStatus === 'aprovado' ? new Date().toISOString() : null
    })
    .eq('id', id);
  if (error) throw error;
}

export async function suspenderMotoqueiro(id) {
  const { error } = await supabase.rpc('suspender_motoqueiro', { p_motoqueiro_id: id });
  if (error) throw error;
}

export async function reativarMotoqueiro(id) {
  const { error } = await supabase.rpc('reativar_motoqueiro', { p_motoqueiro_id: id });
  if (error) throw error;
}

export async function excluirMotoqueiro(id) {
  const { data, error } = await supabase.rpc('excluir_motoqueiro', { p_motoqueiro_id: id });
  if (error) throw error;
  return data;
}