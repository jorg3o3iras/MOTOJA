/**
 * Fluxo do motoqueiro:
 * online/offline → receber oferta → aceitar → chegar → iniciar → finalizar
 */
import { $, haversine, formatMoney } from '../lib/utils.js';
import { supabase } from '../lib/supabase.js';
import { atualizarMinhaPosicao } from '../services/motoqueiro.js';
import {
  aceitarCorrida, recusarCorrida, expirarOferta,
  motoqueiroChegou, iniciarCorrida, finalizarCorrida, cancelarCorrida
} from '../services/corrida.js';
import { mostrarToast } from '../ui/toast.js';
import { app } from '../stores/app.js';

const state = {
  canalOfertas: null,
  canalMinhaCorrida: null,
  ofertaAtual: null,
  timerOferta: null,
  timerHeartbeat: null,
  _pollOferta: null,
  corridaAtual: null
};

/* ---------- UI status ---------- */
export function atualizarUIMotoqueiro() {
  const painel = $('painel-motoqueiro');
  const btnToggle = $('btn-toggle-online');
  const texto = $('moto-status-texto');
  const sheet = $('sheet');

  if (!app.motoqueiroCadastro) {
    painel?.classList.add('hidden');
    sheet?.classList.remove('hidden');
    return;
  }

  sheet?.classList.add('hidden');
  painel?.classList.remove('hidden');

  const c = app.motoqueiroCadastro;
  if (c.status !== 'aprovado') {
    texto.textContent = `Status: ${c.status} · Aguarde aprovação`;
    btnToggle.disabled = true;
    btnToggle.className = 'bg-zinc-500 text-white rounded-full px-3 py-1.5 text-[11px] font-bold cursor-not-allowed';
    btnToggle.textContent = 'Aguardando';
    return;
  }
  texto.textContent = `Status: aprovado · ${c.disponivel ? 'Online' : 'Offline'}`;
  btnToggle.disabled = false;
  btnToggle.className = c.disponivel
    ? 'bg-red-500 text-white rounded-full px-3 py-1.5 text-[11px] font-bold'
    : 'bg-[#FF6A00] text-white rounded-full px-3 py-1.5 text-[11px] font-bold';
  btnToggle.textContent = c.disponivel ? 'Ficar offline' : 'Ficar online';
}

/* ---------- Heartbeat ---------- */
export function iniciarHeartbeat() {
  pararHeartbeat();
  const ping = () => {
    navigator.geolocation.getCurrentPosition(
      (pos) => atualizarMinhaPosicao(pos.coords.latitude, pos.coords.longitude, true),
      () => {},
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };
  ping();
  state.timerHeartbeat = setInterval(ping, 30000);
}

export function pararHeartbeat() {
  if (state.timerHeartbeat) { clearInterval(state.timerHeartbeat); state.timerHeartbeat = null; }
}

/* ---------- Toggle online/offline ---------- */
async function toggleOnline() {
  const c = app.motoqueiroCadastro;
  if (!c) return;
  const novoEstado = !c.disponivel;

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const ok = await atualizarMinhaPosicao(pos.coords.latitude, pos.coords.longitude, novoEstado);
      if (!ok) { mostrarToast('Erro ao atualizar status', 'error'); return; }

      c.disponivel = novoEstado;
      atualizarUIMotoqueiro();

      if (novoEstado) {
        iniciarHeartbeat();
        ouvirMinhasOfertas();
        mostrarToast('🟢 Você está online!', 'success');
      } else {
        pararHeartbeat();
        if (state.canalOfertas) { supabase.removeChannel(state.canalOfertas); state.canalOfertas = null; }
        if (state._pollOferta) { clearInterval(state._pollOferta); state._pollOferta = null; }
        fecharModalOferta();
        mostrarToast('🔴 Você está offline');
      }
    },
    () => mostrarToast('Ative o GPS para ficar online', 'error'),
    { enableHighAccuracy: true, timeout: 8000 }
  );
}

/* ---------- Ouvir ofertas ---------- */
export function ouvirMinhasOfertas() {
  const meuMotId = app.motoqueiroCadastro?.id;
  if (!meuMotId) return;
  if (state.canalOfertas) supabase.removeChannel(state.canalOfertas);

  state.canalOfertas = supabase
    .channel('minhas-ofertas-' + meuMotId)
    .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'corridas',
        filter: `offer_motoqueiro_id=eq.${meuMotId}` },
      ({ new: c }) => {
        if (c.status === 'oferecida' && c.offer_expires_at) {
          abrirModalOferta(c);
        } else if (state.ofertaAtual?.id === c.id && c.status !== 'oferecida') {
          fecharModalOferta();
        }
      })
    .subscribe();

  if (state._pollOferta) clearInterval(state._pollOferta);
  state._pollOferta = setInterval(async () => {
    if (!app.motoqueiroCadastro?.disponivel || state.ofertaAtual || state.corridaAtual) return;
    const { data } = await supabase
      .from('corridas')
      .select('id, status, motoqueiro_id, offer_motoqueiro_id, codigo_embarque, origem_nome, destino_nome, preco_total, distancia_km, duracao_min, offer_expires_at, origem_lat, origem_lng')
      .eq('offer_motoqueiro_id', meuMotId)
      .eq('status', 'oferecida')
      .gte('offer_expires_at', new Date().toISOString())
      .order('offer_expires_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (data) abrirModalOferta(data);
  }, 15000);
}

/* ---------- Modal de oferta ---------- */
function abrirModalOferta(c) {
  state.ofertaAtual = c;
  const el = $('modal-oferta');
  el.classList.remove('hidden');
  el.classList.add('flex');

  $('of-valor').textContent   = formatMoney(c.preco_total);
  $('of-origem').textContent  = c.origem_nome || '—';
  $('of-destino').textContent = c.destino_nome || '—';
  $('of-dist').textContent    = `${Number(c.distancia_km).toFixed(1)} km · ${Math.round(c.duracao_min)} min`;

  navigator.geolocation.getCurrentPosition((pos) => {
    const d = haversine(
      { lat: pos.coords.latitude, lng: pos.coords.longitude },
      { lat: c.origem_lat, lng: c.origem_lng }
    );
    $('of-ate-embarque').textContent = `a ${d.toFixed(1)} km de você`;
  }, () => { $('of-ate-embarque').textContent = ''; }, { timeout: 4000 });

  clearInterval(state.timerOferta);
  const expiry = new Date(c.offer_expires_at).getTime();
  const atualizar = () => {
    const restam = Math.max(0, Math.floor((expiry - Date.now()) / 1000));
    $('of-timer').textContent = restam + 's';
    $('of-progress').style.width = Math.min(100, (restam / 25) * 100) + '%';
    if (restam <= 0) {
      clearInterval(state.timerOferta);
      expirarOferta(c.id).then(fecharModalOferta).catch(fecharModalOferta);
    }
  };
  atualizar();
  state.timerOferta = setInterval(atualizar, 250);
}

function fecharModalOferta() {
  clearInterval(state.timerOferta);
  state.timerOferta = null;
  state.ofertaAtual = null;
  const el = $('modal-oferta');
  el.classList.add('hidden');
  el.classList.remove('flex');
}

/* ---------- Aceitar / recusar ---------- */
async function handleAceitar() {
  const c = state.ofertaAtual;
  if (!c) return;
  const btn = $('of-aceitar');
  btn.disabled = true; btn.textContent = 'Aceitando...';
  try {
    const data = await aceitarCorrida(c.id);
    fecharModalOferta();
    state.corridaAtual = data;
    mostrarToast('✅ Corrida aceita! Código ' + data.codigo_embarque, 'success');
    renderCorridaEmAndamento(data);
    ouvirMinhaCorrida(data.id);
  } catch (e) {
    mostrarToast(e.message, 'error');
    btn.disabled = false; btn.textContent = 'Aceitar';
    fecharModalOferta();
  }
}

async function handleRecusar() {
  const c = state.ofertaAtual;
  if (!c) return;
  fecharModalOferta();
  await recusarCorrida(c.id).catch(e => console.warn(e));
}

/* ---------- Corrida em andamento ---------- */
function ouvirMinhaCorrida(corridaId) {
  if (state.canalMinhaCorrida) supabase.removeChannel(state.canalMinhaCorrida);
  state.canalMinhaCorrida = supabase
    .channel('minha-corrida-' + corridaId)
    .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'corridas', filter: `id=eq.${corridaId}` },
      ({ new: c }) => {
        if (c.status === 'em_andamento') {
          renderCorridaRodando(c);
          mostrarToast('Corrida iniciada 🛵', 'success');
        }
        if (c.status === 'cancelada') {
          mostrarToast('Passageiro cancelou', 'error');
          limparCorridaAtual();
        }
      })
    .subscribe();
}

function renderCorridaEmAndamento(data) {
  const box = $('ofertas-box');
  box.innerHTML = `
    <div class="bg-black text-white rounded-2xl p-4 shadow-premium-lg">
      <div class="text-[11px] text-white/60 uppercase font-bold">Indo ao embarque</div>
      <div class="text-[12px] text-white/70 mt-2">📍 ${data.origem_nome}</div>
      <div class="text-[12px] text-white/70">🏁 ${data.destino_nome}</div>
      <div class="sora font-extrabold text-[22px] mt-3 text-[#FF6A00]">
        ${formatMoney(data.preco_total)}
      </div>
      <div class="flex gap-2 mt-4">
        <button id="btn-cheguei" class="flex-1 bg-[#FF6A00] text-white rounded-xl py-3 font-bold text-[13px]">
          Cheguei no embarque
        </button>
        <button id="btn-cancelar-mot" class="bg-red-600 text-white rounded-xl px-4 py-3 font-bold text-[13px]">✕</button>
      </div>
    </div>`;

  $('btn-cheguei').onclick = async () => {
    try {
      await motoqueiroChegou(data.id);
      mostrarToast('Aguardando passageiro informar o código…', 'info');
      pedirCodigoEmbarque(data);
    } catch (e) { mostrarToast(e.message, 'error'); }
  };
  $('btn-cancelar-mot').onclick = async () => {
    await cancelarCorrida(data.id, 'motoqueiro').catch(() => {});
    limparCorridaAtual();
  };
}

function pedirCodigoEmbarque(data) {
  const box = $('ofertas-box');
  box.innerHTML = `
    <div class="bg-amber-500 text-white rounded-2xl p-4 shadow-premium-lg">
      <div class="text-[11px] text-white/80 uppercase font-bold">Embarque</div>
      <div class="sora font-bold text-[15px] mt-1">Digite o código que o passageiro vai mostrar</div>
      <input id="inp-codigo" inputmode="numeric" maxlength="4"
        class="w-full mt-3 text-center text-[28px] sora font-extrabold tracking-[0.4em]
               bg-white/20 text-white rounded-xl py-3 outline-none border-2 border-white/30
               focus:border-white"
        placeholder="••••">
      <div class="flex gap-2 mt-3">
        <button id="btn-iniciar" class="flex-1 bg-white text-amber-700 rounded-xl py-3 font-bold">Iniciar corrida</button>
        <button id="btn-cancelar-mot2" class="bg-red-600 text-white rounded-xl px-4 py-3 font-bold">✕</button>
      </div>
    </div>`;

  $('inp-codigo').focus();
  $('btn-iniciar').onclick = async () => {
    const cod = $('inp-codigo').value.trim();
    if (cod.length !== 4) { mostrarToast('Código tem 4 dígitos', 'error'); return; }
    try { await iniciarCorrida(data.id, cod); }
    catch (e) { mostrarToast(e.message, 'error'); }
  };
  $('btn-cancelar-mot2').onclick = async () => {
    await cancelarCorrida(data.id, 'motoqueiro').catch(() => {});
    limparCorridaAtual();
  };
}

function renderCorridaRodando(c) {
  const box = $('ofertas-box');
  box.innerHTML = `
    <div class="bg-emerald-600 text-white rounded-2xl p-4 shadow-premium-lg">
      <div class="text-[11px] text-white/80 uppercase font-bold">Em andamento</div>
      <div class="sora font-extrabold text-[18px] mt-1">Levando passageiro</div>
      <div class="text-[12px] text-white/70 mt-1">🏁 ${c.destino_nome || ''}</div>
      <button id="btn-finalizar" class="w-full mt-3 bg-white text-emerald-700 rounded-xl py-3 font-bold">
        Finalizar corrida
      </button>
    </div>`;
  $('btn-finalizar').onclick = async () => {
    try {
      const data = await finalizarCorrida(c.id);
      mostrarToast(
        `💰 Receberá ${formatMoney(data.liquido_motoqueiro)} (comissão ${formatMoney(data.comissao)})`,
        'success'
      );
      limparCorridaAtual();
    } catch (e) { mostrarToast(e.message, 'error'); }
  };
}

function limparCorridaAtual() {
  state.corridaAtual = null;
  if (state.canalMinhaCorrida) {
    supabase.removeChannel(state.canalMinhaCorrida);
    state.canalMinhaCorrida = null;
  }
  const box = $('ofertas-box');
  if (box) box.innerHTML = '';
  ouvirMinhasOfertas();
}

/* ---------- Init ---------- */
export function initMotoqueiro() {
  $('btn-toggle-online')?.addEventListener('click', toggleOnline);
  $('of-aceitar')?.addEventListener('click', handleAceitar);
  $('of-recusar')?.addEventListener('click', handleRecusar);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (state.timerHeartbeat) { clearInterval(state.timerHeartbeat); state.timerHeartbeat = null; }
      if (state._pollOferta) { clearInterval(state._pollOferta); state._pollOferta = null; }
    } else {
      if (app.motoqueiroCadastro?.status === 'aprovado' && app.motoqueiroCadastro?.disponivel) {
        iniciarHeartbeat();
        ouvirMinhasOfertas();
      }
    }
  });

  window.addEventListener('beforeunload', pararHeartbeat);
}

export { toggleOnline };