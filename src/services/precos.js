import { supabase } from '../lib/supabase.js';
import { $ } from '../lib/utils.js';
import { CATEGORIA_MOTO, PRECOS_PADRAO } from '../lib/config.js';
import { mostrarToast } from '../ui/toast.js';

export function aplicarConfigPrecos(cfg) {
  if (!cfg) return;
  CATEGORIA_MOTO.base   = Number(cfg.preco_base)   || PRECOS_PADRAO.preco_base;
  CATEGORIA_MOTO.porKm  = Number(cfg.preco_por_km) || PRECOS_PADRAO.preco_por_km;
  CATEGORIA_MOTO.espera = Number(cfg.espera_min)   || PRECOS_PADRAO.espera_min;
}

export async function carregarConfigPrecos() {
  try {
    const { data, error } = await supabase.rpc('obter_config_precos');
    if (error) throw error;
    if (data) aplicarConfigPrecos(data);
    return data;
  } catch (e) {
    console.warn('[Config] usando padrão:', e.message);
    return null;
  }
}

/* ---------- Admin: painel de preços ---------- */

export async function carregarConfigPrecosAdmin() {
  const { data } = await supabase.rpc('obter_config_precos');
  const cfg = data || PRECOS_PADRAO;
  $('cfg-preco-base').value = cfg.preco_base;
  $('cfg-preco-km').value   = cfg.preco_por_km;
  $('cfg-espera').value     = cfg.espera_min;
  $('cfg-comissao').value   = cfg.comissao_pct ?? 20;
  atualizarSimulacao();
  const info = $('cfg-info');
  if (info) {
    info.textContent = cfg.atualizado_em
      ? 'Atualizado em ' + new Date(cfg.atualizado_em).toLocaleString('pt-BR')
      : '';
  }
}

export function atualizarSimulacao() {
  const base   = Number($('cfg-preco-base')?.value) || 0;
  const km     = Number($('cfg-preco-km')?.value)   || 0;
  const espera = Number($('cfg-espera')?.value)     || 0;
  const sim5  = base + km * 5;
  const sim10 = base + km * 10;
  const sim20 = base + km * 20;
  const el = $('cfg-simulacao');
  if (!el) return;
  el.innerHTML =
    `Base <b>R$ ${base.toFixed(2)}</b> + <b>R$ ${km.toFixed(2)}</b>/km + <b>${espera} min</b><br>` +
    `• 5 km → <b>R$ ${sim5.toFixed(2)}</b><br>` +
    `• 10 km → <b>R$ ${sim10.toFixed(2)}</b><br>` +
    `• 20 km → <b>R$ ${sim20.toFixed(2)}</b>`;
}

export function initPainelPrecos() {
  ['cfg-preco-base','cfg-preco-km','cfg-espera','cfg-comissao'].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener('input', atualizarSimulacao);
  });

  $('btn-cfg-restaurar')?.addEventListener('click', () => {
    $('cfg-preco-base').value = PRECOS_PADRAO.preco_base;
    $('cfg-preco-km').value   = PRECOS_PADRAO.preco_por_km;
    $('cfg-espera').value     = PRECOS_PADRAO.espera_min;
    $('cfg-comissao').value   = PRECOS_PADRAO.comissao_pct;
    atualizarSimulacao();
    mostrarToast('Padrão restaurado (não salvo ainda)');
  });

  $('btn-cfg-salvar')?.addEventListener('click', async () => {
    const btn = $('btn-cfg-salvar');
    const base = Number($('cfg-preco-base').value);
    const km   = Number($('cfg-preco-km').value);
    const esp  = Number($('cfg-espera').value);
    const com  = Number($('cfg-comissao').value);

    if ([base, km, esp, com].some(v => isNaN(v) || v < 0)) {
      mostrarToast('Preencha valores válidos', 'error');
      return;
    }

    const txt = btn.textContent;
    btn.disabled = true; btn.textContent = 'Salvando...';
    try {
      const { data, error } = await supabase.rpc('atualizar_config_precos', {
        p_preco_base: base, p_preco_por_km: km,
        p_espera_min: esp,  p_comissao_pct: com
      });
      if (error) throw error;
      aplicarConfigPrecos(data);
      atualizarSimulacao();
      $('cfg-info').textContent = 'Atualizado em ' + new Date().toLocaleString('pt-BR');
      mostrarToast('✓ Preços atualizados!', 'success');
    } catch (e) {
      mostrarToast('Erro: ' + e.message, 'error');
    } finally {
      btn.disabled = false; btn.textContent = txt;
    }
  });
}