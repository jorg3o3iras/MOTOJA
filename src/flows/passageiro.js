/**
 * Fluxo do passageiro:
 * destino → rota → buscar motoqueiro → motorista a caminho → pagar → avaliar
 */
import { $, $$, haversine, bearing, initials, formatMoney } from '../lib/utils.js';
import { CATEGORIA_MOTO } from '../lib/config.js';
import { supabase } from '../lib/supabase.js';
import { calcularRota } from '../services/routing.js';
import { criarCorridaBackend, cancelarCorrida, confirmarPagamento, avaliarCorrida, buscarCorridaPorId } from '../services/corrida.js';
import { carregarMotoqueiroParaCorrida } from '../services/motoqueiro.js';
import { mostrarToast, mostrarBanner, esconderBanner } from '../ui/toast.js';
import { abrir as abrirModal, fechar as fecharModal } from '../ui/modals.js';
import { ligarAutocomplete } from '../ui/autocomplete.js';
import { app, setPickup } from '../stores/app.js';
import {
  getMapa, marcarOrigem, marcarDestino,
  desenharRota, limparRotaVisual, voarPara, centralizarEm
} from '../map/index.js';
import { geocodificarReverso } from '../services/geocoding.js';

/* ---------- Estado local do flow ---------- */
const state = {
  destino: null,
  rota: null,
  opcao: null,
  corridaId: null,
  canalCorrida: null,
  canalMotoPos: null,
  pollTimer: null,
  motoqueiroAtual: null,
  timeoutSemAceite: null,
  corridaParaAvaliar: null,
  precoOficial: null,
  markerMoto: null
};

/* ---------- Modal switch ---------- */
function mostrarPasso(n) {
  $$('#sheet section').forEach(s => s.classList.add('hidden'));
  const el = $(`step-${n}`);
  if (el) el.classList.remove('hidden');
}

/* ---------- Pickup / GPS ---------- */
export async function definirPickup(lat, lng, nome, real = false) {
  const nf = nome || await geocodificarReverso(lat, lng);
  setPickup(lat, lng, nf);
  marcarOrigem(lat, lng, real);
  $('pickup-info').innerHTML = `📍 <strong class="text-black">${nf}</strong>`;
  if (!state.destino) voarPara(lat, lng, 15);
}

export function obterLocalizacaoReal() {
  if (!navigator.geolocation) {
    mostrarBanner('Navegador sem GPS', 'erro', 'Padrão', () => {
      definirPickup(-23.5615, -46.6560, 'Av. Paulista, 1578');
      esconderBanner();
    });
    return;
  }
  const isSecure = location.protocol === 'https:'
    || ['localhost', '127.0.0.1'].includes(location.hostname);
  if (!isSecure) {
    mostrarBanner('⚠ Use HTTPS para GPS', 'erro', 'Padrão', () => {
      definirPickup(-23.5615, -46.6560, 'Av. Paulista');
      esconderBanner();
    });
    return;
  }
  mostrarBanner('Localizando com precisão premium...', 'info');
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      await definirPickup(pos.coords.latitude, pos.coords.longitude, null, true);
      mostrarBanner('📍 Você está aqui', 'sucesso');
      setTimeout(esconderBanner, 2500);
    },
    (err) => {
      const msg = err.code === 1 ? 'Permissão negada. Ative o GPS.' : 'GPS indisponível';
      mostrarBanner(msg, 'erro', 'Tentar', obterLocalizacaoReal);
      if (!app.pickup) definirPickup(-23.5615, -46.6560, 'Av. Paulista, 1578 (padrão)');
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
  );
}

/* ---------- Escolher destino ---------- */
export async function escolherDestino(lat, lng, nome) {
  if (!app.pickup) { mostrarToast('Aguarde o GPS', 'error'); return; }
  state.destino = { lat, lng, nome };
  $('sugestoes').innerHTML = '';
  $('destino-input').value = nome;
  marcarDestino(lat, lng);

  $('lista-opcoes').innerHTML = '<div class="p-8 text-center text-zinc-400">Calculando rota...</div>';
  $('rota-resumo').innerHTML = '';
  $('btn-confirmar').disabled = true;
  mostrarPasso('opcoes');

  const rota = await calcularRota(app.pickup, state.destino);
  state.rota = rota;
  desenharRota(rota.coords, rota.aproximada);

  $('rota-resumo').innerHTML = `
    <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
    <span><b class="text-black">${Math.round(rota.duracao)} min</b> • ${rota.distancia.toFixed(1)} km</span>
    <span class="ml-auto truncate max-w-[140px]">${nome}</span>`;

  renderOpcaoUnica();
}

function renderOpcaoUnica() {
  const { distancia, duracao } = state.rota;
  const preco = CATEGORIA_MOTO.base + CATEGORIA_MOTO.porKm * distancia;
  const tempo = Math.round(duracao + CATEGORIA_MOTO.espera);
  state.opcao = CATEGORIA_MOTO;

  $('lista-opcoes').innerHTML = `
    <div class="op-card sel w-full flex items-center gap-4 p-5 rounded-[20px] border-2 border-black bg-black text-white">
      <div class="w-14 h-14 rounded-2xl bg-[#FF6A00] text-white flex items-center justify-center font-bold text-[22px]">🏍</div>
      <div class="flex-1 min-w-0">
        <div class="sora font-extrabold text-[16px]">${CATEGORIA_MOTO.nome}</div>
        <div class="text-[12px] text-white/60 mt-0.5">${CATEGORIA_MOTO.desc}</div>
        <div class="text-[11px] text-white/50 mt-1">Chega em ~${CATEGORIA_MOTO.espera} min • Viagem de ${tempo} min</div>
      </div>
      <div class="text-right">
        <div class="sora font-extrabold text-[20px] text-[#FF6A00]">${formatMoney(preco)}</div>
        <div class="text-[10px] text-white/50 uppercase tracking-widest font-bold mt-1">Total</div>
      </div>
    </div>`;

  const btn = $('btn-confirmar');
  btn.disabled = false;
  btn.className = 'mt-5 w-full bg-black text-white rounded-2xl py-[18px] font-bold sora text-[15px] shadow-premium hover:bg-zinc-900 transition';
  btn.textContent = `Confirmar • ${formatMoney(preco)}`;
}

/* ---------- Confirmar corrida ---------- */
export async function confirmarCorrida() {
  if (!state.opcao || $('btn-confirmar').disabled) return;
  $('btn-confirmar').disabled = true;

  if (!app.user) {
    mostrarToast('Faça login para solicitar', 'error');
    window.dispatchEvent(new CustomEvent('abrir-auth'));
    $('btn-confirmar').disabled = false;
    return;
  }

  try {
    const resp = await criarCorridaBackend(
      app.pickup, state.destino,
      state.rota.distancia, state.rota.duracao
    );
    state.corridaId = resp.corrida_id || resp.id || resp;
    if (!state.corridaId) throw new Error('Backend não retornou id');

    if (resp.preco_total) {
      state.precoOficial = Number(resp.preco_total);
    }

    mostrarPasso('buscando');
    atualizarTextoBusca(
      'Procurando o melhor<br>motoqueiro perto de você',
      'Analisando distância e avaliação'
    );

    if (resp.oferta?.ofertado) {
      atualizarTextoBusca('Enviando solicitação...', 'Aguardando resposta do motoqueiro');
    }
    if (resp.oferta?.motivo === 'sem_motoqueiros') {
      mostrarToast('Nenhum motoqueiro disponível agora', 'error');
      resetCorrida();
      return;
    }

    escutarCorrida(state.corridaId);
    iniciarPolling(state.corridaId);

    state.timeoutSemAceite = setTimeout(async () => {
      if (!state.corridaId) return;
      await cancelarCorrida(state.corridaId, 'timeout').catch(() => {});
      mostrarToast('Nenhum motoqueiro aceitou a tempo', 'error');
      resetCorrida();
    }, 180000);

  } catch (e) {
    console.error('[confirmar]', e);
    mostrarToast('Erro: ' + e.message, 'error');
    $('btn-confirmar').disabled = false;
  }
}

function atualizarTextoBusca(titulo, sub) {
  const t = $('busca-titulo');
  const s = $('busca-sub');
  if (t) t.innerHTML = titulo;
  if (s) s.innerHTML = sub;
}

/* ---------- Realtime + Polling ---------- */
function escutarCorrida(corridaId) {
  if (state.canalCorrida) supabase.removeChannel(state.canalCorrida);
  state.canalCorrida = supabase
    .channel('corrida-' + corridaId)
    .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'corridas', filter: `id=eq.${corridaId}` },
      ({ new: c }) => tratarUpdateCorrida(c))
    .subscribe();
}

async function tratarUpdateCorrida(c) {
  if (!c || c.id !== state.corridaId) return;

  switch (c.status) {
    case 'oferecida':
      await mostrarOferecendo(c);
      break;
    case 'aceita':
      if (!state.motoqueiroAtual) {
        await carregarMotoqueiroReal(c);
        pararPolling();
      }
      break;
    case 'chegou':
      mostrarToast('🏍 Motoqueiro no local! Mostre o código.', 'success');
      if ($('dr-eta')) $('dr-eta').textContent = 'Chegou!';
      break;
    case 'em_andamento':
      mostrarToast('Boa viagem! 🛵', 'success');
      trocarBotaoParaEmAndamento();
      break;
    case 'finalizada':
      pararPolling();
      pararCanaisPassageiro();
      abrirModalPagamento(c);
      break;
    case 'cancelada':
      mostrarToast('Corrida cancelada', 'error');
      resetCorrida();
      break;
    case 'sem_motoqueiro':
      mostrarToast('Nenhum motoqueiro disponível. Tente novamente.', 'error');
      resetCorrida();
      break;
  }
}

async function mostrarOferecendo(c) {
  if (!c.offer_motoqueiro_id) return;
  const { data: mot } = await supabase
    .from('motoqueiros')
    .select('id, profiles(nome_completo)')
    .eq('id', c.offer_motoqueiro_id)
    .maybeSingle();
  const nome = mot?.profiles?.nome_completo?.split(' ')[0] || 'motoqueiro';
  atualizarTextoBusca(
    `Enviando solicitação para<br><span class="text-[#FF6A00]">${nome}</span>`,
    'Aguardando resposta...'
  );
}

function iniciarPolling(corridaId) {
  pararPolling();
  state.pollTimer = setInterval(async () => {
    const data = await buscarCorridaPorId(corridaId);
    if (data) tratarUpdateCorrida(data);
  }, 15000);
}

function pararPolling() {
  if (state.pollTimer) { clearInterval(state.pollTimer); state.pollTimer = null; }
}

function pararCanaisPassageiro() {
  if (state.canalCorrida) { supabase.removeChannel(state.canalCorrida); state.canalCorrida = null; }
  if (state.canalMotoPos) { supabase.removeChannel(state.canalMotoPos); state.canalMotoPos = null; }
  if (state.timeoutSemAceite) { clearTimeout(state.timeoutSemAceite); state.timeoutSemAceite = null; }
}

/* ---------- Motorista encontrado ---------- */
async function carregarMotoqueiroReal(corrida) {
  const mot = await carregarMotoqueiroParaCorrida(corrida.motoqueiro_id);
  if (!mot) { mostrarToast('Erro ao carregar motoqueiro', 'error'); return; }
  state.motoqueiroAtual = mot;

  const nome  = mot.profiles?.nome_completo || 'Motoqueiro';
  const nota  = Number(mot.nota_media ?? 5).toFixed(2).replace('.', ',');
  const trips = (mot.total_corridas ?? 0).toLocaleString('pt-BR');

  $('dr-avatar').textContent   = initials(nome);
  $('dr-nome').textContent     = nome;
  $('dr-nota').textContent     = '★ ' + nota;
  $('dr-viagens').textContent  = '· ' + trips + ' corridas';
  $('dr-moto').textContent     = `${mot.moto_marca || ''} ${mot.moto_modelo || ''}`.trim() || 'Moto';
  $('dr-detalhe').textContent  = `${mot.moto_cor || ''} · ${mot.moto_ano || ''}`;
  $('dr-placa').textContent    = mot.moto_placa || '---';
  $('codigo-embarque').textContent = (corrida.codigo_embarque || '----').split('').join(' ');

  const btnNova = $('btn-nova');
  btnNova.disabled = false;
  btnNova.className = 'mt-4 w-full bg-zinc-100 rounded-2xl py-4 font-bold text-[13px] text-zinc-600';
  btnNova.textContent = 'Cancelar corrida';

  const mapa = getMapa();
  if (mot.lat && mot.lng && mapa) {
    const p = { lat: mot.lat, lng: mot.lng };
    const alvo = { lat: corrida.origem_lat, lng: corrida.origem_lng };
    const eta = Math.max(1, Math.round(haversine(p, alvo) * 60 / 25));
    if (state.markerMoto) mapa.removeLayer(state.markerMoto);
    const { iconeMoto } = await import('../map/markers.js');
    state.markerMoto = L.marker([p.lat, p.lng], {
      icon: iconeMoto(bearing(p, alvo), eta),
      zIndexOffset: 1000
    }).addTo(mapa);
    $('dr-eta').textContent = eta + ' min';
  }

  mostrarPasso('motorista');
  rastrearMotoqueiroRealtime(mot.id, corrida.origem_lat, corrida.origem_lng);
}

function rastrearMotoqueiroRealtime(motoqueiroId, alvoLat, alvoLng) {
  if (state.canalMotoPos) supabase.removeChannel(state.canalMotoPos);
  let ultimoLat = null, ultimoLng = null;

  state.canalMotoPos = supabase
    .channel('pos-moto-' + motoqueiroId)
    .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'motoqueiros', filter: `id=eq.${motoqueiroId}` },
      async ({ new: m }) => {
        if (!m?.lat || !m?.lng || !state.markerMoto) return;
        if (m.lat === ultimoLat && m.lng === ultimoLng) return;
        ultimoLat = m.lat; ultimoLng = m.lng;

        const p = { lat: m.lat, lng: m.lng };
        const alvo = { lat: alvoLat, lng: alvoLng };
        const d = haversine(p, alvo);
        const eta = Math.max(1, Math.round(d * 60 / 25));
        state.markerMoto.setLatLng([p.lat, p.lng]);
        const { iconeMoto } = await import('../map/markers.js');
        state.markerMoto.setIcon(iconeMoto(bearing(p, alvo), eta));
        $('dr-eta').textContent = eta + ' min';
      })
    .subscribe();
}

function trocarBotaoParaEmAndamento() {
  const btn = $('btn-nova');
  btn.disabled = true;
  btn.className = 'mt-4 w-full bg-zinc-100 rounded-2xl py-4 font-bold text-[13px] text-zinc-400 cursor-not-allowed';
  btn.textContent = 'Em andamento — aguarde o motoqueiro finalizar';
}

/* ---------- Cancelar / Reset ---------- */
export async function cancelarBusca(motivo = 'passageiro') {
  pararPolling();
  pararCanaisPassageiro();
  if (state.corridaId) {
    await cancelarCorrida(state.corridaId, motivo).catch(() => {});
    state.corridaId = null;
  }
}

export function resetCorrida() {
  pararCanaisPassageiro();
  state.destino = null;
  state.rota = null;
  state.opcao = null;
  state.corridaId = null;
  state.motoqueiroAtual = null;
  state.precoOficial = null;
  limparRotaVisual();
  if (app.pickup) centralizarEm(app.pickup.lat, app.pickup.lng, 15);
  $('destino-input').value = '';
  $('sugestoes').innerHTML = '';
  $('btn-confirmar').disabled = true;
  $('btn-confirmar').className = 'mt-5 w-full bg-zinc-200 text-zinc-400 rounded-2xl py-[18px] font-bold sora text-[15px]';
  $('btn-confirmar').textContent = 'Selecione uma opção';
  mostrarPasso('destino');
}

/* ---------- Pagamento + Avaliação ---------- */
let formaPagamentoSel = null;
let notaAv = 0;

function abrirModalPagamento(corrida) {
  formaPagamentoSel = null;
  state.corridaParaAvaliar = corrida;
  $('pg-valor').textContent = formatMoney(corrida.preco_total);
  $$('.pg-op').forEach(b => b.classList.remove('!border-[#FF6A00]','!bg-[#FFF7ED]'));
  const btn = $('btn-pagar');
  btn.disabled = true; btn.textContent = 'Escolha a forma';
  btn.className = 'w-full bg-zinc-200 text-zinc-400 rounded-2xl py-4 font-bold sora';
  abrirModal('modal-pagamento');
}

function abrirModalAvaliacao() {
  notaAv = 0;
  $('av-nome-mot').textContent = state.motoqueiroAtual?.profiles?.nome_completo || 'Motoqueiro';
  atualizarEstrelas(0);
  $('av-comentario').value = '';
  $('btn-enviar-av').disabled = true;
  $('btn-enviar-av').className = 'mt-5 w-full bg-zinc-200 text-zinc-400 rounded-2xl py-4 font-bold sora';
  abrirModal('modal-avaliacao');
}

function atualizarEstrelas(n) {
  $$('.av-star').forEach((b, i) => {
    b.textContent = i < n ? '★' : '☆';
    b.classList.toggle('text-[#FF6A00]', i < n);
    b.classList.toggle('text-zinc-300', i >= n);
  });
}

function fecharTudoFinal() {
  ['modal-avaliacao','modal-pagamento'].forEach(id => fecharModal(id));
  state.corridaParaAvaliar = null;
  state.motoqueiroAtual = null;
  state.corridaId = null;
  state.precoOficial = null;
  resetCorrida();
}

/* ---------- Wiring de UI ---------- */
export function initPassageiro() {
  // Autocomplete no destino
  ligarAutocomplete({
    inputId: 'destino-input',
    containerId: 'sugestoes',
    getPickup: () => app.pickup,
    onSelect: ({ lat, lng, nome }) => escolherDestino(lat, lng, nome)
  });

  // Botões
  $('btn-localizar')?.addEventListener('click', () => {
    if (!navigator.geolocation) { obterLocalizacaoReal(); return; }
    navigator.geolocation.getCurrentPosition(
      async (p) => {
        await definirPickup(p.coords.latitude, p.coords.longitude, null, true);
        voarPara(p.coords.latitude, p.coords.longitude, 16);
        mostrarBanner('📍 Local atualizado', 'sucesso');
        setTimeout(esconderBanner, 2000);
      },
      obterLocalizacaoReal,
      { enableHighAccuracy: true, timeout: 8000 }
    );
  });

  $('btn-confirmar')?.addEventListener('click', confirmarCorrida);
  $('btn-cancelar-busca')?.addEventListener('click', async () => {
    await cancelarBusca('passageiro');
    resetCorrida();
  });
  $('btn-nova')?.addEventListener('click', async () => {
    if (state.corridaId) await cancelarBusca('passageiro');
    resetCorrida();
  });
  $('btn-voltar')?.addEventListener('click', () => {
    limparRotaVisual();
    state.destino = null;
    state.rota = null;
    state.opcao = null;
    $('destino-input').value = '';
    $('sugestoes').innerHTML = '';
    if (app.pickup) centralizarEm(app.pickup.lat, app.pickup.lng, 15);
    mostrarPasso('destino');
  });

  // Pagamento
  $$('.pg-op').forEach(b => {
    b.addEventListener('click', () => {
      $$('.pg-op').forEach(x => x.classList.remove('!border-[#FF6A00]','!bg-[#FFF7ED]'));
      b.classList.add('!border-[#FF6A00]','!bg-[#FFF7ED]');
      formaPagamentoSel = b.dataset.forma;
      const btn = $('btn-pagar');
      btn.disabled = false; btn.textContent = 'Confirmar pagamento';
      btn.className = 'w-full bg-black text-white rounded-2xl py-4 font-bold sora';
    });
  });

  $('btn-pagar')?.addEventListener('click', async () => {
    if (!formaPagamentoSel || !state.corridaParaAvaliar) return;
    try {
      await confirmarPagamento(state.corridaParaAvaliar.id, formaPagamentoSel);
      fecharModal('modal-pagamento');
      abrirModalAvaliacao();
    } catch (e) { mostrarToast(e.message, 'error'); }
  });

  // Avaliação
  $$('.av-star').forEach(b => {
    b.addEventListener('click', () => {
      notaAv = Number(b.dataset.nota);
      atualizarEstrelas(notaAv);
      const btn = $('btn-enviar-av');
      btn.disabled = false;
      btn.className = 'mt-5 w-full bg-black text-white rounded-2xl py-4 font-bold sora';
    });
  });

  $('btn-enviar-av')?.addEventListener('click', async () => {
    if (!notaAv || !state.corridaParaAvaliar) return;
    try {
      await avaliarCorrida(
        state.corridaParaAvaliar.id,
        notaAv,
        $('av-comentario').value.trim() || null
      );
      mostrarToast('⭐ Obrigado pela avaliação!', 'success');
      fecharTudoFinal();
    } catch (e) { mostrarToast(e.message, 'error'); }
  });

  $('btn-pular-av')?.addEventListener('click', fecharTudoFinal);

  // Visibilidade (pausa polling quando aba oculta)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (state.pollTimer) { clearInterval(state.pollTimer); state.pollTimer = null; }
    } else {
      if (state.corridaId) iniciarPolling(state.corridaId);
    }
  });

  // Quando o user loga, recarrega pickup
  window.addEventListener('usuario-logado', () => {
    if (!app.pickup) obterLocalizacaoReal();
  });
}

export function getState() { return state; }
export { mostrarPasso };