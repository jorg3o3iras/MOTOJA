(function () {
  'use strict';

  /* =========================================================
     CONFIG
     ========================================================= */
  const SUPABASE_URL = 'https://zthpupgggmxwrsfksalw.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_Q0zXHqPXXsUrbzwOxHL5_w_2E1vKdo4';

  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  const $ = (id) => document.getElementById(id);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const STORAGE = { FAV: 'mj_favoritos_v2' };
  const CATEGORIA_MOTO = { id: 'moto', nome: 'Moto', desc: 'Corrida premium de moto', icone: '🏍', base: 4, porKm: 1.6, espera: 3 };
  const PRECOS_PADRAO = { preco_base: 4, preco_por_km: 1.6, espera_min: 3, comissao_pct: 20 };

  /* =========================================================
     HELPERS
     ========================================================= */
  function haversine(a, b) {
    const R = 6371;
    const dLat = (b.lat - a.lat) * Math.PI / 180;
    const dLng = (b.lng - a.lng) * Math.PI / 180;
    const la1 = a.lat * Math.PI / 180;
    const la2 = b.lat * Math.PI / 180;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function bearing(a, b) {
    const φ1 = a.lat * Math.PI / 180, φ2 = b.lat * Math.PI / 180;
    const Δλ = (b.lng - a.lng) * Math.PI / 180;
    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }
  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }
  function formatMoney(v) { return 'R$ ' + Number(v || 0).toFixed(2).replace('.', ','); }
  function initials(name) {
    return (name || '').split(/\s+/).filter(Boolean).map(p => p[0]).join('').slice(0, 2).toUpperCase() || '--';
  }
  function maskCPF(v) {
    const d = v.replace(/\D/g, '').slice(0, 11);
    return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }
  function maskCEP(v) {
    const d = v.replace(/\D/g, '').slice(0, 8);
    return d.replace(/(\d{5})(\d)/, '$1-$2');
  }
  function maskPhone(v) {
    const d = v.replace(/\D/g, '').slice(0, 11);
    if (d.length <= 10) return d.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3').trim();
    return d.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3').trim();
  }
  function isValidEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }

  /* =========================================================
     TOAST / BANNER
     ========================================================= */
  let toastTimer = null;
  function mostrarToast(msg, tipo = 'info') {
    const t = $('toast');
    t.textContent = msg;
    t.className = 'toast on' + (tipo === 'error' ? ' error' : tipo === 'success' ? ' success' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('on'), 2600);
  }
  function mostrarBanner(txt, tipo = 'info', acao = null, cb = null) {
    const b = $('loc-banner');
    b.classList.remove('hidden');
    $('loc-texto').textContent = txt;
    const spinner = $('loc-spinner');
    spinner.style.display = tipo === 'info' ? '' : 'none';
    const btn = $('loc-acao');
    if (acao) { btn.textContent = acao; btn.classList.remove('hidden'); btn.onclick = cb; }
    else { btn.classList.add('hidden'); btn.onclick = null; }
  }
  function esconderBanner() { $('loc-banner').classList.add('hidden'); }

  /* =========================================================
     BIAS DE BUSCA (Photon) — prioriza resultados perto do pickup
     ========================================================= */
  function montarBiasPhoton() {
    if (!state.pickup) return '';
    const { lat, lng } = state.pickup;
    return `&lat=${lat}&lon=${lng}`;
  }

  /* =========================================================
     MAPA + CAMADAS (Mapa / Satélite / Híbrido / Escuro)
     ========================================================= */
  const map = L.map('map', {
    zoomControl: false,
    attributionControl: true
  }).setView([-15.7939, -47.8828], 4);

  const ATTR_OSM   = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
  const ATTR_CART  = '&copy; <a href="https://carto.com/attributions">CARTO</a>';
  const ATTR_ESRI  = 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics';

  // 🔧 Camadas disponíveis
  const CAMADAS = {
    mapa: {
      nome: 'Mapa',
      layer: L.maplibreGL({ style: 'https://tiles.openfreemap.org/styles/liberty' }),
      classe: ''
    },
    satelite: {
      nome: 'Satélite',
      layer: L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { maxZoom: 19, attribution: ATTR_ESRI, className: 'satelite' }
      ),
      classe: 'satelite'
    },
    hibrido: {
      nome: 'Híbrido',
      layer: L.layerGroup([
        L.tileLayer(
          'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          { maxZoom: 19, attribution: ATTR_ESRI, className: 'satelite' }
        ),
        L.tileLayer(
          'https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png',
          { maxZoom: 19, attribution: ATTR_CART, pane: 'shadowPane', opacity: 0.9 }
        )
      ]),
      classe: 'hibrido'
    },
    escuro: {
      nome: 'Escuro',
      layer: L.maplibreGL({ style: 'https://tiles.openfreemap.org/styles/dark' }),
      classe: 'escuro'
    }
  };

  const CAMADA_KEY = 'mj_camada';
  let camadaAtual = null;

  function aplicarCamada(nome) {
    if (!CAMADAS[nome]) nome = 'mapa';

    if (camadaAtual) {
      map.removeLayer(CAMADAS[camadaAtual].layer);
    }

    CAMADAS[nome].layer.addTo(map);
    camadaAtual = nome;

    document.querySelectorAll('.camada-op').forEach(b =>
      b.classList.toggle('on', b.dataset.camada === nome)
    );

    const icones = { mapa: '🗺️', satelite: '🛰️', hibrido: '🌐', escuro: '🌙' };
    const btn = document.getElementById('btn-camadas');
    if (btn) btn.textContent = icones[nome] || '🗺️';

    try { localStorage.setItem(CAMADA_KEY, nome); } catch (_) {}
  }

  aplicarCamada(localStorage.getItem(CAMADA_KEY) || 'mapa');

  const isDesktop = window.innerWidth >= 768;
  const mapPad = isDesktop
    ? { paddingTopLeft: [460, 80], paddingBottomRight: [60, 60] }
    : { paddingTopLeft: [40, 80], paddingBottomRight: [40, 380] };

  const iconeOrigem  = L.divIcon({ className: '', iconSize: [20, 20], iconAnchor: [10, 10], html: '<div class="mk-origem"></div>' });
  const iconeDestino = L.divIcon({ className: '', iconSize: [18, 18], iconAnchor: [9, 9],   html: '<div class="mk-dest"></div>' });
  const iconeEu      = L.divIcon({ className: '', iconSize: [24, 24], iconAnchor: [12, 12], html: '<div class="mk-eu"></div>' });

  function criarIconeMoto(dir, eta) {
    return L.divIcon({
      className: '', iconSize: [48, 58], iconAnchor: [24, 30],
      html: `<div class="moto-pin relative" style="transform:rotate(${dir}deg)"><div class="halo absolute inset-0"></div><div class="core relative z-10">🏍</div></div><div style="position:absolute;top:46px;left:50%;transform:translateX(-50%);background:#0A0A0A;color:#fff;font-size:10px;font-weight:800;padding:3px 8px;border-radius:999px;white-space:nowrap">${eta} min</div>`
    });
  }
  function criarIconeMotoSimples(nome) {
    return L.divIcon({
      className: '', iconSize: [40, 40], iconAnchor: [20, 20],
      html: `<div style="width:40px;height:40px;border-radius:50%;background:#FF6A00;border:3px solid #fff;box-shadow:0 4px 12px rgba(255,106,0,.5);display:flex;align-items:center;justify-content:center;font-size:18px" title="${nome}">🏍</div>`
    });
  }

  let markerOrigem = null, markerDestino = null, markerMoto = null;
  let linhaRota = null, linhaRotaGlow = null, marcadorEu = null;
  const markersMotoqueiros = new Map();

  function limparRotaVisual() {
    if (markerDestino) { map.removeLayer(markerDestino); markerDestino = null; }
    if (markerMoto) { map.removeLayer(markerMoto); markerMoto = null; }
    if (linhaRota) { map.removeLayer(linhaRota); linhaRota = null; }
    if (linhaRotaGlow) { map.removeLayer(linhaRotaGlow); linhaRotaGlow = null; }
  }
  function limparMotoqueirosDoMapa() {
    markersMotoqueiros.forEach(m => map.removeLayer(m));
    markersMotoqueiros.clear();
  }

  /* =========================================================
     MODAL DE CAMADAS DO MAPA
     ========================================================= */
  const modalCamadas = $('modal-camadas');

  if (modalCamadas) {
    $('btn-camadas').addEventListener('click', () => {
      modalCamadas.classList.remove('hidden');
      modalCamadas.classList.add('flex');
    });
    $('btn-fechar-camadas').addEventListener('click', () => {
      modalCamadas.classList.add('hidden');
      modalCamadas.classList.remove('flex');
    });
    modalCamadas.addEventListener('click', e => {
      if (e.target === modalCamadas) {
        modalCamadas.classList.add('hidden');
        modalCamadas.classList.remove('flex');
      }
    });

    $$('.camada-op').forEach(btn => {
      btn.addEventListener('click', () => {
        aplicarCamada(btn.dataset.camada);
        setTimeout(() => {
          modalCamadas.classList.add('hidden');
          modalCamadas.classList.remove('flex');
          mostrarToast('🛰️ Camada: ' + CAMADAS[btn.dataset.camada].nome, 'success');
        }, 220);
      });
    });
  }

  /* =========================================================
     STATE
     ========================================================= */
  const state = {
    pickup: null, destino: null, rota: null, opcao: null,
    user: null, profile: null,
    motoqueiroCadastro: null,
    corridaId: null, canalCorrida: null, canalMotoPos: null, pollTimer: null,
    motoqueiroAtual: null, timeoutSemAceite: null, corridaParaAvaliar: null,
    canalOfertas: null, canalMinhaCorrida: null, ofertaAtual: null,
    timerOferta: null, corridaAtual: null, timerHeartbeat: null,
    _pollOferta: null,
    buscaAbort: null, favAbort: null,
    precoOficial: null
  };

  function mostrarPasso(n) {
    $$('#sheet section').forEach(s => s.classList.add('hidden'));
    const el = $(`step-${n}`);
    if (el) el.classList.remove('hidden');
  }

  /* =========================================================
     BACKEND (RPCs)
     ========================================================= */
  async function buscarMotoqueirosProximos(lat, lng, raioKm = 5, limite = 10) {
    try {
      const { data, error } = await supabase.rpc('buscar_motoqueiros_proximos', {
        p_lat: lat, p_lng: lng, p_raio_km: raioKm, p_limite: limite
      });
      if (error) throw error;
      return data || [];
    } catch (e) { console.warn('[MotoJá] buscar motoqueiros:', e.message); return []; }
  }
  async function atualizarMinhaPosicao(lat, lng, disponivel = true) {
    try {
      const { error } = await supabase.rpc('atualizar_posicao_motoqueiro', {
        p_lat: lat, p_lng: lng, p_disponivel: disponivel
      });
      if (error) throw error;
      return true;
    } catch (e) { console.warn('[MotoJá] atualizar posição:', e.message); return false; }
  }

  async function criarCorridaBackend(origem, destino, distancia, duracao) {
    const { data, error } = await supabase.rpc('criar_corrida', {
      p_origem_nome: origem.nome, p_origem_lat: origem.lat, p_origem_lng: origem.lng,
      p_destino_nome: destino.nome, p_destino_lat: destino.lat, p_destino_lng: destino.lng,
      p_distancia_km: distancia, p_duracao_min: duracao
    });
    if (error) throw error;
    return data;
  }

  async function buscarMeuCadastroMotoqueiro() {
    if (!state.user) return null;
    const { data, error } = await supabase
      .from('motoqueiros')
      .select('id, status, moto_marca, moto_modelo, moto_placa, disponivel, nota_media, total_corridas')
      .eq('profile_id', state.user.id).maybeSingle();
    if (error) return null;
    return data;
  }
  async function salvarCadastroMotoqueiro(dados) {
    if (!state.user) throw new Error('Faça login primeiro');

    const payload = {
      profile_id: state.user.id,
      status: 'pendente',
      moto_marca: dados.marca || null,
      moto_modelo: dados.modelo || null,
      moto_ano: parseInt(dados.ano) || null,
      moto_cor: dados.cor || null,
      moto_placa: dados.placa || null,
      moto_cc: parseInt(dados.cc) || null
    };

    console.log('[Moto] payload:', payload);

    const { data, error } = await supabase
      .from('motoqueiros')
      .upsert(payload, { onConflict: 'profile_id' })
      .select()
      .single();

    if (error) {
      console.error('[Moto] ERRO:', error);
      throw error;
    }

    console.log('[Moto] salvo:', data);
    return data;
  }
  async function uploadDocumento(motoqueiroId, tipo, arquivo) {
    if (!state.user) throw new Error('Faça login primeiro');
    const ext = (arquivo.name.split('.').pop() || 'jpg').toLowerCase();
    const path = `${state.user.id}/${motoqueiroId}/${tipo}.${ext}`;
    const { error: errUpload } = await supabase.storage
      .from('documentos')
      .upload(path, arquivo, { upsert: true, contentType: arquivo.type });
    if (errUpload) throw errUpload;
    await supabase.from('documentos').insert({
      motoqueiro_id: motoqueiroId, tipo, url_storage: path, status: 'enviado'
    });
    return path;
  }

  async function carregarDocumentosMotoqueiro(motoqueiroId) {
    const { data, error } = await supabase
      .from('documentos')
      .select('id, tipo, url_storage, status, criado_em')
      .eq('motoqueiro_id', motoqueiroId);

    if (error || !data?.length) return [];

    const docs = await Promise.all(data.map(async (d) => {
      const { data: signed } = await supabase.storage
        .from('documentos')
        .createSignedUrl(d.url_storage, 3600);
      return { ...d, url_assinada: signed?.signedUrl || null };
    }));

    return docs;
  }

  async function carregarConfigPrecos() {
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

  function aplicarConfigPrecos(cfg) {
    if (!cfg) return;
    CATEGORIA_MOTO.base   = Number(cfg.preco_base)   || PRECOS_PADRAO.preco_base;
    CATEGORIA_MOTO.porKm  = Number(cfg.preco_por_km) || PRECOS_PADRAO.preco_por_km;
    CATEGORIA_MOTO.espera = Number(cfg.espera_min)   || PRECOS_PADRAO.espera_min;
  }

  async function carregarConfigPrecosAdmin() {
    const { data } = await supabase.rpc('obter_config_precos');
    const cfg = data || PRECOS_PADRAO;
    $('cfg-preco-base').value = cfg.preco_base;
    $('cfg-preco-km').value   = cfg.preco_por_km;
    $('cfg-espera').value     = cfg.espera_min;
    $('cfg-comissao').value   = cfg.comissao_pct ?? 20;
    atualizarSimulacao();
    if (cfg.atualizado_em) {
      $('cfg-info').textContent = 'Atualizado em ' + new Date(cfg.atualizado_em).toLocaleString('pt-BR');
    } else {
      $('cfg-info').textContent = '';
    }
  }

  function atualizarSimulacao() {
    const base   = Number($('cfg-preco-base').value) || 0;
    const km     = Number($('cfg-preco-km').value)   || 0;
    const espera = Number($('cfg-espera').value)     || 0;
    const sim5  = base + km * 5;
    const sim10 = base + km * 10;
    const sim20 = base + km * 20;
    $('cfg-simulacao').innerHTML =
      `Base <b>R$ ${base.toFixed(2)}</b> + <b>R$ ${km.toFixed(2)}</b>/km + <b>${espera} min</b><br>` +
      `• 5 km → <b>R$ ${sim5.toFixed(2)}</b><br>` +
      `• 10 km → <b>R$ ${sim10.toFixed(2)}</b><br>` +
      `• 20 km → <b>R$ ${sim20.toFixed(2)}</b>`;
  }

  ['cfg-preco-base','cfg-preco-km','cfg-espera','cfg-comissao'].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener('input', atualizarSimulacao);
  });

  $('btn-cfg-restaurar').addEventListener('click', () => {
    $('cfg-preco-base').value = PRECOS_PADRAO.preco_base;
    $('cfg-preco-km').value   = PRECOS_PADRAO.preco_por_km;
    $('cfg-espera').value     = PRECOS_PADRAO.espera_min;
    $('cfg-comissao').value   = PRECOS_PADRAO.comissao_pct;
    atualizarSimulacao();
    mostrarToast('Padrão restaurado (não salvo ainda)');
  });

  $('btn-cfg-salvar').addEventListener('click', async () => {
    const btn = $('btn-cfg-salvar');
    const base = Number($('cfg-preco-base').value);
    const km   = Number($('cfg-preco-km').value);
    const esp  = Number($('cfg-espera').value);
    const com  = Number($('cfg-comissao').value);

    if ([base, km, esp, com].some(v => isNaN(v) || v < 0)) {
      mostrarToast('Preencha valores válidos', 'error'); return;
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

  async function carregarFavoritosDoBackend() {
    if (!state.user) return [];
    const { data, error } = await supabase.from('favoritos').select('id, nome, lat, lng, icone, endereco').order('criado_em', { ascending: false });
    if (error) return [];
    return data || [];
  }
  async function salvarFavoritoNoBackend(fav) {
    if (!state.user) return null;
    const { data, error } = await supabase.from('favoritos').insert({
      profile_id: state.user.id, nome: fav.nome, lat: fav.lat, lng: fav.lng, icone: fav.icone, endereco: fav.endereco
    }).select().single();
    if (error) throw error;
    return data;
  }
  async function deletarFavoritoDoBackend(id) {
    if (!state.user) return false;
    const { error } = await supabase.from('favoritos').delete().eq('id', id);
    return !error;
  }

  /* =========================================================
     AUTH
     ========================================================= */
  const modalAuth = $('modal-auth');

  let intencaoCadastro = null;

  function abrirAuth(aba = 'login') {
    modalAuth.classList.remove('hidden'); modalAuth.classList.add('flex'); trocarAba(aba);
  }
  function fecharAuth() {
    modalAuth.classList.add('hidden'); modalAuth.classList.remove('flex');
    $('form-login').reset(); $('form-signup').reset();
  }
  function trocarAba(aba) {
    const isLogin = aba === 'login';
    $('tab-login').classList.toggle('on', isLogin);
    $('tab-signup').classList.toggle('on', !isLogin);
    $('form-login').classList.toggle('hidden', !isLogin);
    $('form-signup').classList.toggle('hidden', isLogin);
  }
  $('tab-login').addEventListener('click', () => trocarAba('login'));
  $('tab-signup').addEventListener('click', () => trocarAba('signup'));
  $('btn-fechar-auth').addEventListener('click', fecharAuth);
  modalAuth.addEventListener('click', e => { if (e.target === modalAuth) fecharAuth(); });

  $('btn-conta').addEventListener('click', () => {
    if (state.user) { if (confirm('Deseja sair da conta?')) fazerLogout(); }
    else abrirAuth('login');
  });

  $('btn-sair-header').addEventListener('click', () => {
    if (confirm('Deseja sair da conta?')) fazerLogout();
  });

  async function fazerLogin(email, senha) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha });
    if (error) throw error;
    return data;
  }
  async function fazerCadastro(nome, email, senha, telefone) {
    const { data, error } = await supabase.auth.signUp({
      email, password: senha,
      options: { data: { nome_completo: nome, telefone: telefone || '' } }
    });
    if (error) throw error;
    return data;
  }
  async function fazerLogout() {
    pararHeartbeat();
    if (state.canalOfertas) { supabase.removeChannel(state.canalOfertas); state.canalOfertas = null; }
    if (state.canalMinhaCorrida) { supabase.removeChannel(state.canalMinhaCorrida); state.canalMinhaCorrida = null; }
    if (state._pollOferta) { clearInterval(state._pollOferta); state._pollOferta = null; }
    pararPolling(); pararCanaisPassageiro();
    await supabase.auth.signOut();
    mostrarToast('Sessão encerrada');
  }
  async function carregarProfile(userId) {
    try {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    } catch (e) { return null; }
  }

  async function atualizarUIUsuario(user, profile) {
    if (user) {
      state.user = user;
      state.profile = profile;
      const nome = profile?.nome_completo || user.user_metadata?.nome_completo || user.email.split('@')[0];
      const primeiroNome = nome.split(' ')[0];
      $('btn-conta').innerHTML = `👤 ${primeiroNome}`;
      $('user-mini-av').textContent = initials(nome);
      $('user-nome').textContent = primeiroNome;
      $('user-logado').classList.remove('hidden');
      $('btn-sair-header').classList.remove('hidden');
      state.motoqueiroCadastro = await buscarMeuCadastroMotoqueiro();
      atualizarUIMotoqueiro();
      const favsBackend = await carregarFavoritosDoBackend();
      if (favsBackend.length > 0) { favoritos = favsBackend; renderFavoritos(); }
      if (state.pickup) carregarMotoqueirosNoMapaDebounced();
      if (state.motoqueiroCadastro?.status === 'aprovado' && state.motoqueiroCadastro?.disponivel) {
        iniciarHeartbeat();
        ouvirMinhasOfertas();
      }
    } else {
      state.user = null; state.profile = null; state.motoqueiroCadastro = null;
      $('btn-conta').innerHTML = '👤 Passageiro';
      $('user-logado').classList.add('hidden');
      $('btn-sair-header').classList.add('hidden');
      limparMotoqueirosDoMapa();
      atualizarUIMotoqueiro();
    }
  }

  supabase.auth.onAuthStateChange(async (event, session) => {
    console.log('[Auth]', event);
    if (session?.user) {
      const profile = await carregarProfile(session.user.id);
      await atualizarUIUsuario(session.user, profile);
      if (event === 'SIGNED_IN') { fecharAuth(); mostrarToast('✓ Bem-vindo!', 'success'); }
    } else {
      await atualizarUIUsuario(null, null);
    }
  });

  (async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      const profile = await carregarProfile(session.user.id);
      await atualizarUIUsuario(session.user, profile);
    }
  })();

  $('btn-logout').addEventListener('click', fazerLogout);

  $('form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('btn-login-submit');
    const email = $('login-email').value.trim();
    const senha = $('login-senha').value;
    if (!isValidEmail(email)) { mostrarToast('E-mail inválido', 'error'); return; }
    if (senha.length < 6) { mostrarToast('Senha muito curta', 'error'); return; }
    const txt = btn.textContent; btn.disabled = true; btn.textContent = 'Entrando...';
    try { await fazerLogin(email, senha); }
    catch (err) {
      mostrarToast(err.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos' : err.message, 'error');
      btn.disabled = false; btn.textContent = txt;
    }
  });

  $('form-signup').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('btn-signup-submit');
    const nome = $('signup-nome').value.trim();
    const email = $('signup-email').value.trim();
    const senha = $('signup-senha').value;
    const telefone = $('signup-telefone').value.trim();
    if (nome.length < 3) { mostrarToast('Informe seu nome completo', 'error'); return; }
    if (!isValidEmail(email)) { mostrarToast('E-mail inválido', 'error'); return; }
    if (senha.length < 6) { mostrarToast('Senha deve ter pelo menos 6 caracteres', 'error'); return; }

    const txt = btn.textContent;
    btn.disabled = true; btn.textContent = 'Criando conta...';

    try {
      const data = await fazerCadastro(nome, email, senha, telefone);

      if (!data.session) {
        mostrarToast('Confirme seu e-mail antes de continuar', 'success');
        fecharAuth();
        intencaoCadastro = null;
        btn.disabled = false; btn.textContent = txt;
        return;
      }

      if (data.user) {
        const profile = await carregarProfile(data.user.id);
        await atualizarUIUsuario(data.user, profile);
      }

      fecharAuth();
      mostrarToast('✓ Conta criada!', 'success');

      if (intencaoCadastro === 'motoqueiro') {
        intencaoCadastro = null;
        setTimeout(() => abrirMoto(), 400);
      }
    } catch (err) {
      let msg = err.message;
      if (msg.includes('already registered')) msg = 'E-mail já cadastrado';
      else if (msg.includes('Password')) msg = 'Senha muito fraca';
      mostrarToast(msg, 'error');
      btn.disabled = false; btn.textContent = txt;
    }
  });

  /* =========================================================
     GEOCODIFICAÇÃO — PHOTON (komoot)
     ========================================================= */
  async function geocodificarReverso(lat, lng) {
    try {
      const r = await fetch(
        `https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}`;
        { signal: AbortSignal.timeout(6000) }
      );
      if (!r.ok) throw new Error('HTTP');
      const j = await r.json();
      const p = j?.features?.[0]?.properties;
      if (p) {
        const partes = [
          p.street && p.housenumber ? `${p.street}, ${p.housenumber}` : (p.street || p.name),
          p.district || p.suburb,
          p.city || p.town || p.village
        ].filter(Boolean);
        if (partes.length) return partes.join(' - ');
      }
    } catch (_) {}
    return 'Local selecionado';
  }

  /* =========================================================
     PICKUP / GPS
     ========================================================= */
  async function definirPickup(lat, lng, nome, real = false) {
    const nf = nome || await geocodificarReverso(lat, lng);
    state.pickup = { lat, lng, nome: nf };
    if (markerOrigem) map.removeLayer(markerOrigem);
    markerOrigem = L.marker([lat, lng], { icon: iconeOrigem }).addTo(map);
    if (real) {
      if (marcadorEu) map.removeLayer(marcadorEu);
      marcadorEu = L.marker([lat, lng], { icon: iconeEu, zIndexOffset: 500 }).addTo(map);
    }
    $('pickup-info').innerHTML = `📍 <strong class="text-black">${nf}</strong>`;
    if (!state.destino) map.flyTo([lat, lng], 15, { duration: 1.2 });
  }

  function obterLocalizacaoReal() {
    if (!navigator.geolocation) {
      mostrarBanner('Navegador sem GPS', 'erro', 'Padrão', () => { definirPickup(-23.5615, -46.6560, 'Av. Paulista, 1578'); esconderBanner(); });
      return;
    }
    const isSecure = location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname);
    if (!isSecure) {
      mostrarBanner('⚠ Use HTTPS para GPS', 'erro', 'Padrão', () => { definirPickup(-23.5615, -46.6560, 'Av. Paulista'); esconderBanner(); });
      return;
    }
    mostrarBanner('Localizando com precisão premium...', 'info');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        await definirPickup(pos.coords.latitude, pos.coords.longitude, null, true);
        mostrarBanner('📍 Você está aqui', 'sucesso');
        setTimeout(esconderBanner, 2500);
        if (state.user) carregarMotoqueirosNoMapaDebounced();
      },
      (err) => {
        const msg = err.code === 1 ? 'Permissão negada. Ative o GPS.' : 'GPS indisponível';
        mostrarBanner(msg, 'erro', 'Tentar', () => obterLocalizacaoReal());
        if (!state.pickup) definirPickup(-23.5615, -46.6560, 'Av. Paulista, 1578 (padrão)');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  }

  $('btn-localizar').addEventListener('click', () => {
    if (!navigator.geolocation) { obterLocalizacaoReal(); return; }
    navigator.geolocation.getCurrentPosition(
      async (p) => {
        await definirPickup(p.coords.latitude, p.coords.longitude, null, true);
        map.flyTo([p.coords.latitude, p.coords.longitude], 16, { duration: 1 });
        mostrarBanner('📍 Local atualizado', 'sucesso');
        setTimeout(esconderBanner, 2000);
      },
      () => obterLocalizacaoReal(),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  });

  /* =========================================================
     BUSCA DE DESTINO — PHOTON
     ========================================================= */
  let resAtuais = [];
  const buscarDestino = debounce(async (q) => {
    if (state.buscaAbort) state.buscaAbort.abort();
    const ac = new AbortController(); state.buscaAbort = ac;
    const bias = montarBiasPhoton();
    try {
      const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=8&lang=pt${bias}`;
      const r = await fetch(url, { signal: ac.signal });
      if (!r.ok) throw new Error('HTTP');
      const j = await r.json();
      resAtuais = (j.features || []).filter(f => f.properties?.countrycode === 'BR');
      renderSug(resAtuais);
    } catch (e) {
      if (e.name !== 'AbortError') $('sugestoes').innerHTML = '<div class="p-3 text-zinc-400 text-[13px]">Erro ao buscar.</div>';
    }
  }, 400);

  $('destino-input').addEventListener('input', () => {
    const q = $('destino-input').value.trim();
    if (q.length < 3) { $('sugestoes').innerHTML = ''; return; }
    $('sugestoes').innerHTML = '<div class="p-3 text-zinc-400 text-[13px]">Buscando perto de você...</div>';
    buscarDestino(q);
  });

  function renderSug(lista) {
    if (!lista.length) {
      $('sugestoes').innerHTML = '<div class="p-3 text-zinc-400 text-[13px]">Nenhum resultado perto de você.</div>';
      return;
    }
    $('sugestoes').innerHTML = lista.map((it, i) => {
      const p = it.properties || {};
      const titulo = p.name || p.street || p.city || 'Local';
      const sub = [
        p.street && p.housenumber ? `${p.street}, ${p.housenumber}` : null,
        p.district || p.suburb,
        p.city || p.town || p.village,
        p.state
      ].filter(Boolean).join(', ') || (p.country || '');
      return `<div class="sugestao flex gap-3 p-3 hover:bg-zinc-100 rounded-2xl cursor-pointer transition" data-i="${i}">
        <div class="w-9 h-9 rounded-full bg-zinc-100 flex items-center justify-center">📍</div>
        <div class="min-w-0 flex-1">
          <div class="font-bold text-[13px] truncate">${titulo}</div>
          <div class="text-[11px] text-zinc-500 truncate">${sub}</div>
        </div>
      </div>`;
    }).join('');

    $$('.sugestao').forEach(el => {
      el.addEventListener('click', () => {
        const it = resAtuais[+el.dataset.i];
        if (!it) return;
        const coords = it.geometry?.coordinates || [];
        const lat = coords[1], lng = coords[0];
        const p = it.properties || {};
        const nome = p.name || p.street || p.city || 'Local';
        const endereco = [
          p.street && p.housenumber ? `${p.street}, ${p.housenumber}` : null,
          p.city || p.town || p.village
        ].filter(Boolean).join(' - ') || nome;
        escolherDestino(lat, lng, endereco);
      });
    });
  }

  /* =========================================================
     FAVORITOS
     ========================================================= */
  let favoritos = [];
  try { favoritos = JSON.parse(localStorage.getItem(STORAGE.FAV) || '[]'); if (!Array.isArray(favoritos)) favoritos = []; } catch (_) { favoritos = []; }
  function salvarFavoritosLS() { try { localStorage.setItem(STORAGE.FAV, JSON.stringify(favoritos)); } catch (_) {} }

  function renderFavoritos() {
    const el = $('favoritos-lista');
    if (!favoritos.length) {
      el.innerHTML = `<div class="col-span-2 text-center py-6 px-4 rounded-2xl border-2 border-dashed border-zinc-200">
        <div class="text-2xl mb-1">📌</div>
        <div class="text-[12px] text-zinc-500 leading-snug">Salve seus destinos favoritos<br>para acessar com um toque</div>
      </div>`;
      return;
    }
    el.innerHTML = favoritos.map(f => `
      <div class="relative group">
        <button type="button" class="fav-card w-full bg-white border border-zinc-200 rounded-2xl px-4 py-3 text-left hover:border-black hover:shadow-lg" data-id="${f.id}">
          <div class="text-[18px]">${f.icone}</div>
          <div class="sora font-bold text-[13px] mt-1 truncate pr-5">${f.nome}</div>
          <div class="text-[11px] text-zinc-500 truncate">${f.endereco || 'Toque para ir'}</div>
        </button>
        <button type="button" class="fav-del absolute top-2 right-2 w-6 h-6 rounded-full bg-zinc-100 hover:bg-red-100 hover:text-red-600 text-zinc-500 text-[11px] flex items-center justify-center transition" data-del="${f.id}">✕</button>
      </div>
    `).join('');
    el.querySelectorAll('.fav-card').forEach(btn => {
      btn.addEventListener('click', () => {
        const f = favoritos.find(x => x.id === btn.dataset.id);
        if (f) escolherDestino(f.lat, f.lng, f.nome);
      });
    });
    el.querySelectorAll('.fav-del').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const id = btn.dataset.del;
        if (state.user) await deletarFavoritoDoBackend(id);
        favoritos = favoritos.filter(x => x.id !== id);
        salvarFavoritosLS();
        renderFavoritos();
        mostrarToast('Favorito removido');
      });
    });
  }

  const modalFav = $('modal-fav');
  let favLatLng = null;
  function abrirModalFav() {
    modalFav.classList.remove('hidden'); modalFav.classList.add('flex');
    $('fav-nome').value = ''; $('fav-endereco').value = ''; $('fav-sugestoes').innerHTML = '';
    $('fav-selecionado').classList.add('hidden'); favLatLng = null;
    $$('#fav-icones .ico-btn').forEach((b, i) => b.classList.toggle('sel', i === 0));
    $('btn-salvar-fav').disabled = true;
    $('btn-salvar-fav').className = 'mt-6 w-full bg-zinc-200 text-zinc-400 rounded-2xl py-4 font-bold sora transition';
    setTimeout(() => $('fav-nome').focus(), 200);
  }
  function fecharModalFav() { modalFav.classList.add('hidden'); modalFav.classList.remove('flex'); if (state.favAbort) state.favAbort.abort(); }

  $('btn-add-favorito').addEventListener('click', abrirModalFav);
  $('btn-fechar-fav').addEventListener('click', fecharModalFav);
  modalFav.addEventListener('click', e => { if (e.target === modalFav) fecharModalFav(); });
  $$('#fav-icones .ico-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('#fav-icones .ico-btn').forEach(b => b.classList.remove('sel'));
      btn.classList.add('sel');
    });
  });

  const buscarFav = debounce(async (q) => {
    if (state.favAbort) state.favAbort.abort();
    const ac = new AbortController(); state.favAbort = ac;
    const bias = montarBiasPhoton();
    try {
      const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=8&lang=pt${bias}`;
      const r = await fetch(url, { signal: ac.signal });
      const j = await r.json();
      const favRes = (j.features || []).filter(f => f.properties?.countrycode === 'BR');

      $('fav-sugestoes').innerHTML = favRes.map((it, i) => {
        const p = it.properties || {};
        const titulo = p.name || p.street || p.city || 'Local';
        const sub = [
          p.street && p.housenumber ? `${p.street}, ${p.housenumber}` : null,
          p.city || p.town || p.village
        ].filter(Boolean).join(', ') || (p.state || '');
        return `<div class="fav-sug flex gap-3 p-2.5 hover:bg-zinc-100 rounded-xl cursor-pointer transition" data-i="${i}">
          <div class="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-[13px]">📍</div>
          <div class="min-w-0 flex-1">
            <div class="font-bold text-[12px] truncate">${titulo}</div>
            <div class="text-[10px] text-zinc-500 truncate">${sub}</div>
          </div>
        </div>`;
      }).join('');

      $$('.fav-sug').forEach(el => {
        el.addEventListener('click', () => {
          const it = favRes[+el.dataset.i];
          if (!it) return;
          const coords = it.geometry?.coordinates || [];
          favLatLng = { lat: coords[1], lng: coords[0] };
          const p = it.properties || {};
          const label = [
            p.name || p.street,
            p.city || p.town || p.village
          ].filter(Boolean).join(' - ') || 'Local';
          $('fav-endereco').value = label;
          $('fav-sugestoes').innerHTML = '';
          $('fav-selecionado').classList.remove('hidden');
          $('fav-sel-txt').textContent = label;
          validarFav();
        });
      });
    } catch (e) { if (e.name !== 'AbortError') $('fav-sugestoes').innerHTML = ''; }
  }, 400);

  $('fav-endereco').addEventListener('input', () => {
    const q = $('fav-endereco').value.trim();
    favLatLng = null;
    $('fav-selecionado').classList.add('hidden');
    validarFav();
    if (q.length < 3) { $('fav-sugestoes').innerHTML = ''; return; }
    buscarFav(q);
  });

  function validarFav() {
    const ok = $('fav-nome').value.trim().length > 0 && favLatLng;
    const btn = $('btn-salvar-fav');
    btn.disabled = !ok;
    btn.className = ok
      ? 'mt-6 w-full bg-black text-white rounded-2xl py-4 font-bold sora transition hover:bg-zinc-900'
      : 'mt-6 w-full bg-zinc-200 text-zinc-400 rounded-2xl py-4 font-bold sora transition';
  }
  $('fav-nome').addEventListener('input', validarFav);

  $('btn-salvar-fav').addEventListener('click', async () => {
    if (!favLatLng || $('btn-salvar-fav').disabled) return;
    const nome = $('fav-nome').value.trim();
    const icoBtn = document.querySelector('#fav-icones .ico-btn.sel');
    const icone = icoBtn ? icoBtn.dataset.ico : '⭐';
    const endereco = $('fav-endereco').value.trim();
    const favLocal = { id: 'fav_' + Date.now(), nome, lat: favLatLng.lat, lng: favLatLng.lng, icone, endereco };

    if (state.user) {
      try {
        const salvo = await salvarFavoritoNoBackend(favLocal);
        if (salvo) favLocal.id = salvo.id;
      } catch (e) { console.warn('Erro ao salvar no backend:', e); }
    }

    favoritos.push(favLocal);
    salvarFavoritosLS();
    renderFavoritos();
    fecharModalFav();
    mostrarToast('⭐ Favorito salvo!', 'success');
  });

  /* =========================================================
     MODO MAPA
     ========================================================= */
  const overlayMapa = $('modo-mapa-overlay');
  const barraEndereco = $('modo-mapa-endereco');
  const btnModoCancelar = $('btn-modo-mapa-cancelar');
  const btnModoConfirmar = $('btn-modo-mapa-confirmar');
  const btnEscolherMapa = $('btn-escolher-mapa');

  let modoMapaAtivo = false;
  let enderecoAtualMapa = null;
  let timeoutGeocodeMapa = null;
  let centroMapaAnterior = null;
  let zoomAnterior = null;

  function ativarModoMapa() {
    if (!state.pickup) { mostrarToast('Aguarde o GPS localizar você', 'error'); return; }
    modoMapaAtivo = true;
    enderecoAtualMapa = null;
    centroMapaAnterior = map.getCenter();
    zoomAnterior = map.getZoom();
    overlayMapa.classList.remove('hidden');
    map.flyTo([state.pickup.lat, state.pickup.lng], 17, { duration: 1 });
    barraEndereco.textContent = 'Arraste o mapa até o local exato';
    btnModoConfirmar.disabled = true;
    setTimeout(atualizarEnderecoCentral, 800);
    mostrarToast('Arraste o mapa até o destino', 'info');
  }

  function desativarModoMapa(voltarMapa) {
    modoMapaAtivo = false;
    overlayMapa.classList.add('hidden');
    enderecoAtualMapa = null;
    btnModoConfirmar.disabled = true;
    if (timeoutGeocodeMapa) { clearTimeout(timeoutGeocodeMapa); timeoutGeocodeMapa = null; }
    if (voltarMapa && centroMapaAnterior && zoomAnterior) {
      map.flyTo([centroMapaAnterior.lat, centroMapaAnterior.lng], zoomAnterior, { duration: 1 });
    }
  }

  async function atualizarEnderecoCentral() {
    const centro = map.getCenter();
    barraEndereco.textContent = 'Buscando endereço...';
    btnModoConfirmar.disabled = true;
    try {
      const nome = await geocodificarReverso(centro.lat, centro.lng);
      if (modoMapaAtivo) {
        enderecoAtualMapa = { lat: centro.lat, lng: centro.lng, nome };
        barraEndereco.textContent = nome;
        btnModoConfirmar.disabled = false;
      }
    } catch (e) {
      if (modoMapaAtivo) {
        enderecoAtualMapa = { lat: centro.lat, lng: centro.lng, nome: 'Local selecionado' };
        barraEndereco.textContent = 'Local selecionado';
        btnModoConfirmar.disabled = false;
      }
    }
  }

  if (btnEscolherMapa) btnEscolherMapa.addEventListener('click', ativarModoMapa);
  if (btnModoCancelar) btnModoCancelar.addEventListener('click', () => desativarModoMapa(true));
  if (btnModoConfirmar) btnModoConfirmar.addEventListener('click', () => {
    if (!enderecoAtualMapa) return;
    const end = enderecoAtualMapa;
    desativarModoMapa(false);
    mostrarToast('📍 Destino definido!');
    escolherDestino(end.lat, end.lng, end.nome);
  });

  map.on('moveend', () => {
    if (!modoMapaAtivo) return;
    if (timeoutGeocodeMapa) clearTimeout(timeoutGeocodeMapa);
    timeoutGeocodeMapa = setTimeout(atualizarEnderecoCentral, 400);
  });

  /* =========================================================
     ESCOLHER DESTINO + CALCULAR ROTA
     ========================================================= */
  async function escolherDestino(lat, lng, nome) {
    if (!state.pickup) { mostrarToast('Aguarde o GPS', 'error'); return; }
    state.destino = { lat, lng, nome };
    $('sugestoes').innerHTML = '';
    $('destino-input').value = nome;
    if (markerDestino) map.removeLayer(markerDestino);
    markerDestino = L.marker([lat, lng], { icon: iconeDestino }).addTo(map);
    $('lista-opcoes').innerHTML = '<div class="p-8 text-center text-zinc-400">Calculando rota...</div>';
    $('rota-resumo').innerHTML = '';
    $('btn-confirmar').disabled = true;
    mostrarPasso('opcoes');

    const rota = await calcularRota(state.pickup, state.destino);
    state.rota = rota;

    if (linhaRota) map.removeLayer(linhaRota);
    if (linhaRotaGlow) map.removeLayer(linhaRotaGlow);
    linhaRota = L.polyline(rota.coords, { color: '#0A0A0A', weight: 5, opacity: 0.9, lineJoin: 'round', dashArray: rota.aproximada ? '8,12' : null }).addTo(map);
    linhaRotaGlow = L.polyline(rota.coords, { color: '#FF6A00', weight: 2, opacity: 0.55 }).addTo(map);
    map.fitBounds(linhaRota.getBounds(), mapPad);

    $('rota-resumo').innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-500"></span>
      <span><b class="text-black">${Math.round(rota.duracao)} min</b> • ${rota.distancia.toFixed(1)} km</span>
      <span class="ml-auto truncate max-w-[140px]">${nome}</span>`;
    renderOpcaoUnica();
  }

  async function calcularRota(a, b) {
    try {
      const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`, { signal: AbortSignal.timeout(8000) });
      const j = await r.json();
      if (j.code !== 'Ok' || !j.routes?.[0]) throw new Error('OSRM');
      return {
        coords: j.routes[0].geometry.coordinates.map(c => [c[1], c[0]]),
        distancia: j.routes[0].distance / 1000,
        duracao: j.routes[0].duration / 60,
        aproximada: false
      };
    } catch (_) {
      const d = haversine(a, b) * 1.25;
      return { coords: [[a.lat, a.lng], [b.lat, b.lng]], distancia: d, duracao: (d / 28) * 60, aproximada: true };
    }
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

  /* =========================================================
     FLUXO DO PASSAGEIRO — CONFIRMAR CORRIDA
     ========================================================= */
  function atualizarTextoBusca(titulo, sub) {
    const t = $('busca-titulo');
    const s = $('busca-sub');
    if (t) t.innerHTML = titulo;
    if (s) s.innerHTML = sub;
  }

  $('btn-confirmar').addEventListener('click', async () => {
    if (!state.opcao || $('btn-confirmar').disabled) return;
    $('btn-confirmar').disabled = true;

    if (!state.user) {
      mostrarToast('Faça login para solicitar', 'error');
      abrirAuth('login');
      $('btn-confirmar').disabled = false;
      return;
    }

    try {
      const resp = await criarCorridaBackend(
        state.pickup, state.destino,
        state.rota.distancia, state.rota.duracao
      );
      state.corridaId = resp.corrida_id || resp.id || resp;
      if (!state.corridaId) throw new Error('Backend não retornou id');

      if (resp.preco_total) {
        state.precoOficial = Number(resp.preco_total);
        console.log('[Corrida] Preço oficial do backend:', state.precoOficial);
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
        await supabase.rpc('cancelar_corrida', { p_corrida_id: state.corridaId, p_por: 'timeout' });
        mostrarToast('Nenhum motoqueiro aceitou a tempo', 'error');
        resetCorrida();
      }, 180000);

    } catch (e) {
      console.error('[confirmar]', e);
      mostrarToast('Erro: ' + e.message, 'error');
      $('btn-confirmar').disabled = false;
    }
  });

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
    console.log('[corrida]', c.status);

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
        trocarBotaoParaEmAndamento(c);
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
      const { data } = await supabase
        .from('corridas')
        .select('id, status, motoqueiro_id, offer_motoqueiro_id, codigo_embarque, origem_nome, destino_nome, preco_total, distancia_km, duracao_min')
        .eq('id', corridaId)
        .maybeSingle();
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

  async function carregarMotoqueiroReal(corrida) {
    const { data: mot } = await supabase
      .from('motoqueiros')
      .select(`id, moto_marca, moto_modelo, moto_ano, moto_cor, moto_placa,
               nota_media, total_corridas, lat, lng,
               profiles(nome_completo, telefone)`)
      .eq('id', corrida.motoqueiro_id)
      .single();

    if (!mot) { mostrarToast('Erro ao carregar motoqueiro', 'error'); return; }
    state.motoqueiroAtual = mot;

    const nome  = mot.profiles?.nome_completo || 'Motoqueiro';
    const nota  = Number(mot.nota_media ?? 5).toFixed(2).replace('.', ',');
    const trips = (mot.total_corridas ?? 0).toLocaleString('pt-BR');

    $('dr-avatar').textContent  = initials(nome);
    $('dr-nome').textContent    = nome;
    $('dr-nota').textContent    = '★ ' + nota;
    $('dr-viagens').textContent = '· ' + trips + ' corridas';
    $('dr-moto').textContent    = `${mot.moto_marca || ''} ${mot.moto_modelo || ''}`.trim() || 'Moto';
    $('dr-detalhe').textContent = `${mot.moto_cor || ''} · ${mot.moto_ano || ''}`;
    $('dr-placa').textContent   = mot.moto_placa || '---';
    $('codigo-embarque').textContent = (corrida.codigo_embarque || '----').split('').join(' ');

    const btnNova = $('btn-nova');
    btnNova.disabled = false;
    btnNova.className = 'mt-4 w-full bg-zinc-100 rounded-2xl py-4 font-bold text-[13px] text-zinc-600';
    btnNova.textContent = 'Cancelar corrida';

    if (mot.lat && mot.lng) {
      const p = { lat: mot.lat, lng: mot.lng };
      const alvo = { lat: corrida.origem_lat, lng: corrida.origem_lng };
      const eta = Math.max(1, Math.round(haversine(p, alvo) * 60 / 25));
      if (markerMoto) map.removeLayer(markerMoto);
      markerMoto = L.marker([p.lat, p.lng], {
        icon: criarIconeMoto(bearing(p, alvo), eta), zIndexOffset: 1000
      }).addTo(map);
      $('dr-eta').textContent = eta + ' min';
      map.fitBounds(L.featureGroup([markerOrigem, markerMoto]).getBounds().pad(0.6), mapPad);
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
        ({ new: m }) => {
          if (!m?.lat || !m?.lng || !markerMoto) return;
          if (m.lat === ultimoLat && m.lng === ultimoLng) return;
          ultimoLat = m.lat; ultimoLng = m.lng;

          const p = { lat: m.lat, lng: m.lng };
          const alvo = { lat: alvoLat, lng: alvoLng };
          const d = haversine(p, alvo);
          const eta = Math.max(1, Math.round(d * 60 / 25));
          markerMoto.setLatLng([p.lat, p.lng]);
          markerMoto.setIcon(criarIconeMoto(bearing(p, alvo), eta));
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

  async function cancelarBusca(motivo = 'passageiro') {
    pararPolling();
    pararCanaisPassageiro();
    if (state.corridaId) {
      try { await supabase.rpc('cancelar_corrida', { p_corrida_id: state.corridaId, p_por: motivo }); }
      catch (e) { console.warn(e); }
      state.corridaId = null;
    }
  }

  $('btn-cancelar-busca').addEventListener('click', async () => {
    await cancelarBusca('passageiro');
    state.destino = state.rota = state.opcao = null;
    limparRotaVisual();
    $('destino-input').value = '';
    $('sugestoes').innerHTML = '';
    mostrarPasso('destino');
  });

  function resetCorrida() {
    pararCanaisPassageiro();
    state.destino = state.rota = state.opcao = null;
    state.corridaId = null;
    state.motoqueiroAtual = null;
    state.precoOficial = null;
    limparRotaVisual();
    if (state.pickup) map.setView([state.pickup.lat, state.pickup.lng], 15);
    $('destino-input').value = '';
    $('sugestoes').innerHTML = '';
    $('btn-confirmar').disabled = true;
    $('btn-confirmar').className = 'mt-5 w-full bg-zinc-200 text-zinc-400 rounded-2xl py-[18px] font-bold sora text-[15px]';
    $('btn-confirmar').textContent = 'Selecione uma opção';
    mostrarPasso('destino');
  }

  $('btn-voltar').addEventListener('click', () => {
    limparRotaVisual();
    state.destino = state.rota = state.opcao = null;
    $('destino-input').value = '';
    $('sugestoes').innerHTML = '';
    if (state.pickup) map.setView([state.pickup.lat, state.pickup.lng], 15);
    mostrarPasso('destino');
  });

  $('btn-nova').addEventListener('click', async () => {
    if (state.corridaId) await cancelarBusca('passageiro');
    resetCorrida();
  });

  /* =========================================================
     PAGAMENTO + AVALIAÇÃO (PASSAGEIRO)
     ========================================================= */
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
    const modal = $('modal-pagamento');
    modal.classList.remove('hidden'); modal.classList.add('flex');
  }

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

  $('btn-pagar').addEventListener('click', async () => {
    if (!formaPagamentoSel || !state.corridaParaAvaliar) return;
    try {
      await supabase.rpc('confirmar_pagamento', {
        p_corrida_id: state.corridaParaAvaliar.id, p_forma: formaPagamentoSel
      });
      $('modal-pagamento').classList.add('hidden');
      $('modal-pagamento').classList.remove('flex');
      abrirModalAvaliacao(state.corridaParaAvaliar);
    } catch (e) { mostrarToast(e.message, 'error'); }
  });

  function abrirModalAvaliacao() {
    notaAv = 0;
    $('av-nome-mot').textContent = state.motoqueiroAtual?.profiles?.nome_completo || 'Motoqueiro';
    atualizarEstrelas(0);
    $('av-comentario').value = '';
    $('btn-enviar-av').disabled = true;
    $('btn-enviar-av').className = 'mt-5 w-full bg-zinc-200 text-zinc-400 rounded-2xl py-4 font-bold sora';
    const modal = $('modal-avaliacao');
    modal.classList.remove('hidden'); modal.classList.add('flex');
  }

  function atualizarEstrelas(n) {
    $$('.av-star').forEach((b, i) => {
      b.textContent = i < n ? '★' : '☆';
      b.classList.toggle('text-[#FF6A00]', i < n);
      b.classList.toggle('text-zinc-300', i >= n);
    });
  }

  $$('.av-star').forEach(b => {
    b.addEventListener('click', () => {
      notaAv = Number(b.dataset.nota);
      atualizarEstrelas(notaAv);
      const btn = $('btn-enviar-av');
      btn.disabled = false;
      btn.className = 'mt-5 w-full bg-black text-white rounded-2xl py-4 font-bold sora';
    });
  });

  $('btn-enviar-av').addEventListener('click', async () => {
    if (!notaAv || !state.corridaParaAvaliar) return;
    try {
      await supabase.rpc('avaliar_corrida', {
        p_corrida_id: state.corridaParaAvaliar.id,
        p_nota: notaAv,
        p_comentario: $('av-comentario').value.trim() || null
      });
      mostrarToast('⭐ Obrigado pela avaliação!', 'success');
      fecharTudoFinal();
    } catch (e) { mostrarToast(e.message, 'error'); }
  });

  $('btn-pular-av').addEventListener('click', fecharTudoFinal);

  function fecharTudoFinal() {
    ['modal-avaliacao','modal-pagamento'].forEach(id => {
      const el = $(id);
      el.classList.add('hidden'); el.classList.remove('flex');
    });
    state.corridaParaAvaliar = null;
    state.motoqueiroAtual = null;
    state.corridaId = null;
    state.precoOficial = null;
    resetCorrida();
  }

  /* =========================================================
     MOTOQUEIRO — UI + FLUXO COMPLETO
     ========================================================= */
  function atualizarUIMotoqueiro() {
    const painel = $('painel-motoqueiro');
    const btnToggle = $('btn-toggle-online');
    const texto = $('moto-status-texto');
    const sheet = $('sheet');

    if (!state.motoqueiroCadastro) {
      painel.classList.add('hidden');
      if (sheet) sheet.classList.remove('hidden');
      return;
    }

    if (sheet) sheet.classList.add('hidden');
    painel.classList.remove('hidden');

    const c = state.motoqueiroCadastro;
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

  function iniciarHeartbeat() {
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
  function pararHeartbeat() {
    if (state.timerHeartbeat) { clearInterval(state.timerHeartbeat); state.timerHeartbeat = null; }
  }

  $('btn-toggle-online').addEventListener('click', async () => {
    if (!state.motoqueiroCadastro) return;
    const c = state.motoqueiroCadastro;
    const novoEstado = !c.disponivel;

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const ok = await atualizarMinhaPosicao(pos.coords.latitude, pos.coords.longitude, novoEstado);
        if (!ok) { mostrarToast('Erro ao atualizar status', 'error'); return; }
        c.disponivel = novoEstado;
        state.motoqueiroCadastro = c;
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
  });

  function ouvirMinhasOfertas() {
    const meuMotId = state.motoqueiroCadastro?.id;
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
      if (!state.motoqueiroCadastro?.disponivel || state.ofertaAtual || state.corridaAtual) return;
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

  function abrirModalOferta(c) {
    state.ofertaAtual = c;
    const el = $('modal-oferta');
    el.classList.remove('hidden');
    el.classList.add('flex');

    $('of-valor').textContent  = formatMoney(c.preco_total);
    $('of-origem').textContent = c.origem_nome || '—';
    $('of-destino').textContent = c.destino_nome || '—';
    $('of-dist').textContent   = `${Number(c.distancia_km).toFixed(1)} km · ${Math.round(c.duracao_min)} min`;

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
        supabase.rpc('expirar_oferta', { p_corrida_id: c.id }).then(() => fecharModalOferta());
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

  $('of-aceitar').addEventListener('click', async () => {
    const c = state.ofertaAtual; if (!c) return;
    const btn = $('of-aceitar');
    btn.disabled = true; btn.textContent = 'Aceitando...';
    try {
      const { data, error } = await supabase.rpc('aceitar_corrida', { p_corrida_id: c.id });
      if (error) throw error;
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
  });

  $('of-recusar').addEventListener('click', async () => {
    const c = state.ofertaAtual; if (!c) return;
    fecharModalOferta();
    try { await supabase.rpc('recusar_corrida', { p_corrida_id: c.id }); }
    catch (e) { console.warn(e); }
  });

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
        await supabase.rpc('motoqueiro_chegou', { p_corrida_id: data.id });
        mostrarToast('Aguardando passageiro informar o código…', 'info');
        pedirCodigoEmbarque(data);
      } catch (e) { mostrarToast(e.message, 'error'); }
    };
    $('btn-cancelar-mot').onclick = async () => {
      try { await supabase.rpc('cancelar_corrida', { p_corrida_id: data.id, p_por: 'motoqueiro' }); }
      catch (e) { console.warn(e); }
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
      try { await supabase.rpc('iniciar_corrida', { p_corrida_id: data.id, p_codigo: cod }); }
      catch (e) { mostrarToast(e.message, 'error'); }
    };
    $('btn-cancelar-mot2').onclick = async () => {
      try { await supabase.rpc('cancelar_corrida', { p_corrida_id: data.id, p_por: 'motoqueiro' }); }
      catch (e) { console.warn(e); }
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
        const { data, error } = await supabase.rpc('finalizar_corrida', { p_corrida_id: c.id });
        if (error) throw error;
        mostrarToast(`💰 Receberá ${formatMoney(data.liquido_motoqueiro)} (comissão ${formatMoney(data.comissao)})`, 'success');
        limparCorridaAtual();
      } catch (e) { mostrarToast(e.message, 'error'); }
    };
  }

  function limparCorridaAtual() {
    state.corridaAtual = null;
    if (state.canalMinhaCorrida) { supabase.removeChannel(state.canalMinhaCorrida); state.canalMinhaCorrida = null; }
    $('ofertas-box').innerHTML = '';
    ouvirMinhasOfertas();
  }

  const carregarMotoqueirosNoMapaDebounced = debounce(carregarMotoqueirosNoMapa, 3000);

  async function carregarMotoqueirosNoMapa() {
    if (!state.pickup) return;
    const lista = await buscarMotoqueirosProximos(state.pickup.lat, state.pickup.lng, 5, 10);
    limparMotoqueirosDoMapa();
    lista.forEach(m => {
      const marker = L.marker([m.lat, m.lng], { icon: criarIconeMotoSimples(m.nome) })
        .addTo(map)
        .bindPopup(`<b>${m.nome}</b><br>${m.moto_marca || ''} ${m.moto_modelo || ''}<br>${m.distancia_km} km`);
      markersMotoqueiros.set(m.id, marker);
    });
  }

  /* =========================================================
     CADASTRO DE MOTOQUEIRO (MODAL)
     ========================================================= */
  const modalMoto = $('modal-moto');
  let etapaMoto = 1;
  const checksMoto = {};
  const arquivosMoto = { cnh: null, crlv: null, selfie: null };

  function goMoto(n) {
    etapaMoto = n;
    modalMoto.querySelectorAll('.form-step').forEach(s => s.classList.toggle('hidden', +s.dataset.step !== n));
    $('titulo-moto').textContent = ['Cadastro de Motoqueiro','Dados da sua moto','Envio de documentos','Confirmações finais','Cadastro enviado'][n-1] || 'Cadastro';
    modalMoto.querySelectorAll('.bar').forEach((b, i) => {
      b.className = 'bar flex-1 rounded-full ' + (i < Math.min(n, 4) ? 'bg-[#FF6A00]' : 'bg-zinc-200');
    });
    const bv = $('btn-moto-voltar'), bp = $('btn-moto-proximo');
    bv.style.visibility = (n === 1 || n === 5) ? 'hidden' : 'visible';
    bp.textContent = n === 4 ? 'Enviar cadastro' : n === 5 ? 'Fechar' : 'Continuar →';
    modalMoto.scrollTop = 0;
  }

  modalMoto.querySelectorAll('.check-item').forEach(c => {
    c.addEventListener('click', () => {
      const key = c.dataset.check;
      const on = !checksMoto[key];
      checksMoto[key] = on;
      c.classList.toggle('!border-black', on);
      const b = c.querySelector('.box');
      b.classList.toggle('!bg-black', on);
      b.classList.toggle('!text-white', on);
      b.innerHTML = on ? '✓' : '';
    });
  });

  modalMoto.querySelectorAll('input[type="file"]').forEach(input => {
    input.addEventListener('change', (e) => {
      const tipo = input.dataset.file;
      const file = e.target.files[0];
      if (!file) return;
      arquivosMoto[tipo] = file;
      const statusEl = modalMoto.querySelector(`[data-status="${tipo}"]`);
      if (statusEl) { statusEl.textContent = '✓ ' + file.name.slice(0, 25); statusEl.className = 'text-[11px] text-emerald-600 mt-1 font-bold'; }
      const wrap = input.closest('.upload');
      if (wrap) wrap.classList.add('!border-emerald-500', '!bg-emerald-50');
    });
  });

  function abrirMoto() {
    if (!state.user) {
      intencaoCadastro = 'motoqueiro';
      mostrarToast('Crie uma conta para continuar como motoqueiro', 'info');
      abrirAuth('signup');
      return;
    }
    Object.keys(checksMoto).forEach(k => delete checksMoto[k]);
    Object.keys(arquivosMoto).forEach(k => arquivosMoto[k] = null);
    modalMoto.querySelectorAll('.check-item').forEach(c => {
      c.classList.remove('!border-black');
      const b = c.querySelector('.box');
      b.classList.remove('!bg-black', '!text-white');
      b.innerHTML = '';
    });
    modalMoto.querySelectorAll('.upload').forEach(u => u.classList.remove('!border-emerald-500', '!bg-emerald-50'));
    modalMoto.querySelectorAll('[data-status]').forEach(el => { el.textContent = 'Não enviado'; el.className = 'text-[11px] text-zinc-500 mt-1'; });
    modalMoto.querySelectorAll('input[type="file"]').forEach(i => i.value = '');
    modalMoto.classList.remove('hidden'); modalMoto.classList.add('flex');
    goMoto(1);
  }
  function fecharMoto() { modalMoto.classList.add('hidden'); modalMoto.classList.remove('flex'); }

  $('btn-abrir-cadastro-moto').addEventListener('click', abrirMoto);
  $('btn-fechar-moto').addEventListener('click', fecharMoto);
  $('btn-moto-voltar').addEventListener('click', () => { if (etapaMoto > 1) goMoto(etapaMoto - 1); });
  $('btn-moto-proximo').addEventListener('click', async () => {
    if (etapaMoto === 5) { fecharMoto(); return; }
    if (etapaMoto === 4) {
      if (!checksMoto.auth || !checksMoto.capacete) { mostrarToast('Aceite as declarações', 'error'); return; }
      const btn = $('btn-moto-proximo');
      const txt = btn.textContent;
      btn.disabled = true; btn.textContent = 'Enviando...';
      try {
        const dados = {
          marca: $('moto-marca').value,
          modelo: $('moto-modelo').value.trim(),
          ano: $('moto-ano').value,
          cor: $('moto-cor').value.trim(),
          placa: $('moto-placa').value.toUpperCase().trim(),
          cc: $('moto-cc').value
        };
        const motoqueiro = await salvarCadastroMotoqueiro(dados);
        for (const tipo of ['cnh', 'crlv', 'selfie']) {
          if (arquivosMoto[tipo]) {
            try { await uploadDocumento(motoqueiro.id, tipo, arquivosMoto[tipo]); }
            catch (e) { console.warn('Erro upload', tipo, e); }
          }
        }
        state.motoqueiroCadastro = motoqueiro;
        atualizarUIMotoqueiro();
        $('protocolo-moto').textContent = 'MJ-' + String(Math.floor(100000 + Math.random() * 900000));
        mostrarToast('Cadastro enviado!', 'success');
        goMoto(5);
      } catch (e) {
        console.error(e);
        mostrarToast('Erro ao salvar: ' + e.message, 'error');
      } finally {
        btn.disabled = false; btn.textContent = txt;
      }
      return;
    }
    if (etapaMoto === 2 && (!$('moto-marca').value || !$('moto-modelo').value.trim())) {
      mostrarToast('Preencha marca e modelo', 'error'); return;
    }
    goMoto(etapaMoto + 1);
  });

  $('moto-cpf') && $('moto-cpf').addEventListener('input', e => { e.target.value = maskCPF(e.target.value); });
  $('moto-cep') && $('moto-cep').addEventListener('input', e => { e.target.value = maskCEP(e.target.value); });
  $('moto-whats') && $('moto-whats').addEventListener('input', e => { e.target.value = maskPhone(e.target.value); });
  $('moto-placa') && $('moto-placa').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7); });

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (modoMapaAtivo) desativarModoMapa(true);
    else if (modalCamadas && !modalCamadas.classList.contains('hidden')) {
      modalCamadas.classList.add('hidden'); modalCamadas.classList.remove('flex');
    }
    else if (!$('modal-admin-senha').classList.contains('hidden')) fecharModalSenhaAdmin();
    else if (!$('modal-admin').classList.contains('hidden')) fecharAdmin();
    else if (!$('modal-fav').classList.contains('hidden')) fecharModalFav();
    else if (!modalAuth.classList.contains('hidden')) fecharAuth();
    else if (!modalMoto.classList.contains('hidden')) fecharMoto();
  });

  /* =========================================================
     ADMIN — proteção por senha + validação no banco
     ========================================================= */
  const modalAdmin = $('modal-admin');
  function abrirAdmin() {
    modalAdmin.classList.remove('hidden');
    modalAdmin.classList.add('flex');
    carregarPendentes();
    carregarStats();
  }
  function fecharAdmin() {
    modalAdmin.classList.add('hidden');
    modalAdmin.classList.remove('flex');
  }

  function abrirModalSenhaAdmin() {
    const m = $('modal-admin-senha');
    m.classList.remove('hidden'); m.classList.add('flex');
    $('admin-senha-input').value = '';
    $('admin-senha-erro').classList.add('hidden');
    setTimeout(() => $('admin-senha-input').focus(), 150);
  }
  function fecharModalSenhaAdmin() {
    const m = $('modal-admin-senha');
    m.classList.add('hidden'); m.classList.remove('flex');
  }
  async function validarSenhaAdmin() {
    const v = $('admin-senha-input').value;
    if (!v) return;

    const btn = $('btn-admin-senha-entrar');
    const txt = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Verificando...';

    try {
      const { data: senhaOk, error: errSenha } = await supabase.rpc('validar_senha_admin', { p_senha: v });
      if (errSenha) throw errSenha;

      if (!senhaOk) {
        $('admin-senha-erro').classList.remove('hidden');
        $('admin-senha-input').value = '';
        $('admin-senha-input').focus();
        setTimeout(() => $('admin-senha-erro').classList.add('hidden'), 2500);
        return;
      }

      fecharModalSenhaAdmin();

      if (!state.user) {
        mostrarToast('Faça login como administrador', 'error');
        abrirAuth('login');
        return;
      }

      const { data: ehAdmin, error: errAdmin } = await supabase.rpc('sou_admin');
      if (errAdmin) throw errAdmin;
      if (!ehAdmin) {
        mostrarToast('Sua conta não tem permissão de admin', 'error');
        return;
      }

      abrirAdmin();
    } catch (e) {
      mostrarToast('Erro: ' + e.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = txt;
    }
  }

  $('btn-admin-senha-cancelar').addEventListener('click', fecharModalSenhaAdmin);
  $('btn-admin-senha-entrar').addEventListener('click', validarSenhaAdmin);
  $('admin-senha-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') validarSenhaAdmin(); });
  $('modal-admin-senha').addEventListener('click', (e) => {
    if (e.target === $('modal-admin-senha')) fecharModalSenhaAdmin();
  });

  $('btn-admin').addEventListener('click', () => {
    abrirModalSenhaAdmin();
  });

  document.querySelectorAll('.admin-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.admin-tab').forEach(b => b.classList.remove('on'));
      btn.classList.add('on');
      const aba = btn.dataset.aba;
      document.querySelectorAll('.admin-painel').forEach(p => {
        p.classList.toggle('hidden', p.dataset.painel !== aba);
      });
      if (aba === 'pendentes') carregarPendentes();
      if (aba === 'motoqueiros') carregarMotoqueiros();
      if (aba === 'corridas') carregarCorridas();
      if (aba === 'stats') carregarStats();
      if (aba === 'precos') carregarConfigPrecosAdmin();
    });
  });

  document.querySelectorAll('.admin-filtro').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.admin-filtro').forEach(b => b.classList.remove('on'));
      btn.classList.add('on');
      carregarMotoqueiros(btn.dataset.filtro);
    });
  });

  $('btn-fechar-admin').addEventListener('click', fecharAdmin);

  async function carregarPendentes() {
    const el = $('admin-lista-pendentes');
    el.innerHTML = '<div class="text-center py-12 text-zinc-400 text-[14px]">Carregando...</div>';
    try {
      const { data, error } = await supabase
        .from('motoqueiros')
        .select('id, status, moto_marca, moto_modelo, moto_placa, criado_em, profiles(nome_completo, telefone)')
        .eq('status', 'pendente')
        .order('criado_em', { ascending: false });

      if (error) {
        console.error('[Admin] erro pendentes:', error);
        el.innerHTML = '<div class="text-center py-12 text-red-500 text-[13px]">Erro: ' + error.message + '</div>';
        return;
      }

      $('badge-pendentes').textContent = data.length;
      if (!data.length) {
        el.innerHTML = '<div class="text-center py-12 text-zinc-400 text-[14px]">🎉 Nenhum motoqueiro pendente</div>';
        return;
      }

      el.innerHTML = data.map(m => {
        const nome = (m.profiles && m.profiles.nome_completo) || 'Sem nome';
        const tel = (m.profiles && m.profiles.telefone) || '';
        return `
          <div class="admin-card" data-mot-id="${m.id}">
            <div class="flex items-start justify-between gap-3 mb-3">
              <div class="flex-1 min-w-0">
                <div class="sora font-bold text-[16px] truncate">${nome}</div>
                <div class="text-[12px] text-zinc-500 mt-0.5">${tel}</div>
                <div class="text-[12px] text-zinc-500 mt-1">🏍️ ${(m.moto_marca || '')} ${(m.moto_modelo || '')} · ${(m.moto_placa || '')}</div>
              </div>
            </div>

            <button type="button" class="ver-docs-btn w-full bg-zinc-100 hover:bg-zinc-200 rounded-xl py-2.5 text-[12px] font-bold mb-2 transition" data-mot-id="${m.id}">
              📎 Ver documentos
            </button>
            <div class="docs-container hidden mb-3 space-y-2" data-docs-for="${m.id}"></div>

            <div class="flex gap-2">
              <button class="admin-btn aprovar flex-1" data-aprovar="${m.id}">✓ Aprovar</button>
              <button class="admin-btn reprovar flex-1" data-reprovar="${m.id}">✕ Reprovar</button>
            </div>
          </div>`;
      }).join('');

      el.querySelectorAll('[data-aprovar]').forEach(btn =>
        btn.addEventListener('click', () => mudarStatus(btn.dataset.aprovar, 'aprovado')));
      el.querySelectorAll('[data-reprovar]').forEach(btn =>
        btn.addEventListener('click', () => mudarStatus(btn.dataset.reprovar, 'reprovado')));

      el.querySelectorAll('.ver-docs-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const motId = btn.dataset.motId;
          const container = el.querySelector(`[data-docs-for="${motId}"]`);
          if (!container) return;

          if (!container.classList.contains('hidden')) {
            container.classList.add('hidden');
            container.innerHTML = '';
            btn.textContent = '📎 Ver documentos';
            return;
          }

          container.classList.remove('hidden');
          container.innerHTML = '<div class="text-[12px] text-zinc-400 text-center py-3">Carregando documentos...</div>';
          btn.textContent = '📎 Ocultar documentos';

          const docs = await carregarDocumentosMotoqueiro(motId);

          if (!docs.length) {
            container.innerHTML = '<div class="text-[12px] text-zinc-400 text-center py-3">Nenhum documento enviado</div>';
            return;
          }

          container.innerHTML = docs.map(d => {
            const label = { cnh: '🪪 CNH', crlv: '📋 CRLV', selfie: '🤳 Selfie' }[d.tipo] || d.tipo;
            const isImg = /\.(jpg|jpeg|png|webp|gif)$/i.test(d.url_storage);
            return `
              <div class="border border-zinc-200 rounded-xl overflow-hidden">
                <div class="flex items-center justify-between px-3 py-2 bg-zinc-50">
                  <span class="text-[12px] font-bold">${label}</span>
                  <span class="text-[10px] text-emerald-600 font-bold uppercase">${d.status}</span>
                </div>
                ${isImg && d.url_assinada
                  ? `<img src="${d.url_assinada}" class="w-full max-h-[240px] object-contain bg-zinc-100 cursor-pointer" onclick="window.open('${d.url_assinada}','_blank')">`
                  : ''}
                <a href="${d.url_assinada || '#'}" target="_blank"
                   class="block text-center text-[12px] font-bold py-2 bg-white hover:bg-zinc-100 text-black border-t border-zinc-200">
                  🔗 Abrir arquivo
                </a>
              </div>`;
          }).join('');
        });
      });

    } catch (e) {
      console.error(e);
      el.innerHTML = '<div class="text-center py-12 text-red-500 text-[13px]">Erro: ' + e.message + '</div>';
    }
  }

  async function carregarMotoqueiros(filtro) {
    const el = $('admin-lista-motoqueiros');
    el.innerHTML = '<div class="text-center py-12 text-zinc-400 text-[14px]">Carregando...</div>';
    try {
      let query = supabase
        .from('motoqueiros')
        .select('id, status, moto_marca, moto_modelo, moto_placa, disponivel, total_corridas, criado_em, profiles(nome_completo, telefone)')
        .order('criado_em', { ascending: false });
      if (filtro) query = query.eq('status', filtro);
      const { data, error } = await query;
      if (error) throw error;
      if (!data.length) {
        el.innerHTML = '<div class="text-center py-12 text-zinc-400 text-[14px]">Nenhum motoqueiro encontrado</div>';
        return;
      }

      const coresStatus = {
        aprovado: '#059669',
        pendente: '#f59e0b',
        reprovado: '#dc2626',
        suspenso: '#71717a'
      };

      el.innerHTML = data.map(m => {
        const nome = (m.profiles && m.profiles.nome_completo) || 'Sem nome';
        const tel = (m.profiles && m.profiles.telefone) || '—';
        const corStatus = coresStatus[m.status] || '#71717a';

        let botoes = '';
        if (m.status === 'pendente') {
          botoes = `
            <button class="admin-btn aprovar flex-1" data-aprovar="${m.id}">✓ Aprovar</button>
            <button class="admin-btn reprovar flex-1" data-reprovar="${m.id}">✕ Reprovar</button>`;
        } else if (m.status === 'aprovado') {
          botoes = `
            <button class="admin-btn suspender flex-1" data-suspender="${m.id}">⏸ Suspender</button>
            <button class="admin-btn reprovar flex-1" data-excluir="${m.id}">🗑 Excluir</button>`;
        } else if (m.status === 'suspenso') {
          botoes = `
            <button class="admin-btn aprovar flex-1" data-reativar="${m.id}">▶ Reativar</button>
            <button class="admin-btn reprovar flex-1" data-excluir="${m.id}">🗑 Excluir</button>`;
        } else if (m.status === 'reprovado') {
          botoes = `
            <button class="admin-btn aprovar flex-1" data-aprovar="${m.id}">✓ Aprovar</button>
            <button class="admin-btn reprovar flex-1" data-excluir="${m.id}">🗑 Excluir</button>`;
        }

        return `
          <div class="admin-card">
            <div class="flex items-start justify-between gap-3 mb-2">
              <div class="flex-1 min-w-0">
                <div class="sora font-bold text-[15px] truncate">${nome}</div>
                <div class="text-[12px] text-zinc-500 mt-0.5">${(m.moto_marca || '')} ${(m.moto_modelo || '')} · ${(m.moto_placa || '')}</div>
              </div>
              <div class="text-[10px] font-bold px-2 py-1 rounded-full"
                   style="background:${corStatus}20; color:${corStatus}">
                ${m.status.toUpperCase()}
              </div>
            </div>
            <div class="text-[11px] text-zinc-500 mb-2">📞 ${tel} · 🏁 ${(m.total_corridas || 0)} corridas · ${m.disponivel ? '🟢 Online' : '⚫ Offline'}</div>

            <button type="button" class="ver-docs-btn w-full bg-zinc-100 hover:bg-zinc-200 rounded-xl py-2.5 text-[12px] font-bold mb-2 transition" data-mot-id="${m.id}">
              📎 Ver documentos
            </button>
            <div class="docs-container hidden mb-3 space-y-2" data-docs-for="${m.id}"></div>

            <div class="flex gap-2">${botoes}</div>
          </div>`;
      }).join('');

      el.querySelectorAll('[data-aprovar]').forEach(btn =>
        btn.addEventListener('click', () => mudarStatus(btn.dataset.aprovar, 'aprovado')));
      el.querySelectorAll('[data-reprovar]').forEach(btn =>
        btn.addEventListener('click', () => mudarStatus(btn.dataset.reprovar, 'reprovado')));
      el.querySelectorAll('[data-suspender]').forEach(btn =>
        btn.addEventListener('click', () => suspenderMotoqueiro(btn.dataset.suspender)));
      el.querySelectorAll('[data-reativar]').forEach(btn =>
        btn.addEventListener('click', () => reativarMotoqueiro(btn.dataset.reativar)));
      el.querySelectorAll('[data-excluir]').forEach(btn =>
        btn.addEventListener('click', () => excluirMotoqueiro(btn.dataset.excluir)));

      el.querySelectorAll('.ver-docs-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const motId = btn.dataset.motId;
          const container = el.querySelector(`[data-docs-for="${motId}"]`);
          if (!container) return;

          if (!container.classList.contains('hidden')) {
            container.classList.add('hidden');
            container.innerHTML = '';
            btn.textContent = '📎 Ver documentos';
            return;
          }

          container.classList.remove('hidden');
          container.innerHTML = '<div class="text-[12px] text-zinc-400 text-center py-3">Carregando documentos...</div>';
          btn.textContent = '📎 Ocultar documentos';

          const docs = await carregarDocumentosMotoqueiro(motId);

          if (!docs.length) {
            container.innerHTML = '<div class="text-[12px] text-zinc-400 text-center py-3">Nenhum documento enviado</div>';
            return;
          }

          container.innerHTML = docs.map(d => {
            const label = { cnh: '🪪 CNH', crlv: '📋 CRLV', selfie: '🤳 Selfie' }[d.tipo] || d.tipo;
            const isImg = /\.(jpg|jpeg|png|webp|gif)$/i.test(d.url_storage);
            return `
              <div class="border border-zinc-200 rounded-xl overflow-hidden">
                <div class="flex items-center justify-between px-3 py-2 bg-zinc-50">
                  <span class="text-[12px] font-bold">${label}</span>
                  <span class="text-[10px] text-emerald-600 font-bold uppercase">${d.status}</span>
                </div>
                ${isImg && d.url_assinada
                  ? `<img src="${d.url_assinada}" class="w-full max-h-[240px] object-contain bg-zinc-100 cursor-pointer" onclick="window.open('${d.url_assinada}','_blank')">`
                  : ''}
                <a href="${d.url_assinada || '#'}" target="_blank"
                   class="block text-center text-[12px] font-bold py-2 bg-white hover:bg-zinc-100 text-black border-t border-zinc-200">
                  🔗 Abrir arquivo
                </a>
              </div>`;
          }).join('');
        });
      });

    } catch (e) {
      console.error(e);
      el.innerHTML = '<div class="text-center py-12 text-red-500 text-[13px]">Erro: ' + e.message + '</div>';
    }
  }

  async function suspenderMotoqueiro(id) {
    if (!confirm('Suspender este motoqueiro? Ele não poderá ficar online nem receber corridas.')) return;
    try {
      const { error } = await supabase.rpc('suspender_motoqueiro', { p_motoqueiro_id: id });
      if (error) throw error;
      mostrarToast('⏸ Motoqueiro suspenso', 'success');
      carregarMotoqueiros();
      carregarStats();
    } catch (e) {
      mostrarToast('Erro: ' + e.message, 'error');
    }
  }

  async function reativarMotoqueiro(id) {
    try {
      const { error } = await supabase.rpc('reativar_motoqueiro', { p_motoqueiro_id: id });
      if (error) throw error;
      mostrarToast('▶ Motoqueiro reativado', 'success');
      carregarMotoqueiros();
      carregarStats();
    } catch (e) {
      mostrarToast('Erro: ' + e.message, 'error');
    }
  }

  async function excluirMotoqueiro(id) {
    if (!confirm('⚠️ Excluir PERMANENTEMENTE este motoqueiro?\n\nEle perderá o cadastro, documentos e histórico. Esta ação não pode ser desfeita.')) return;
    if (!confirm('Tem certeza absoluta? Clique OK para confirmar a exclusão.')) return;
    try {
      const { data, error } = await supabase.rpc('excluir_motoqueiro', { p_motoqueiro_id: id });
      if (error) throw error;

      const profileId = data?.profile_id;
      if (profileId) {
        try {
          const { data: arquivos } = await supabase.storage
            .from('documentos')
            .list(`${profileId}/${id}`);
          if (arquivos?.length) {
            const paths = arquivos.map(f => `${profileId}/${id}/${f.name}`);
            await supabase.storage.from('documentos').remove(paths);
          }
        } catch (e) { console.warn('Erro ao limpar storage:', e); }
      }

      mostrarToast('🗑 Motoqueiro excluído', 'success');
      carregarMotoqueiros();
      carregarStats();
    } catch (e) {
      mostrarToast('Erro: ' + e.message, 'error');
    }
  }

  async function carregarCorridas() {
    const el = $('admin-lista-corridas');
    el.innerHTML = '<div class="text-center py-12 text-zinc-400 text-[14px]">Carregando...</div>';
    try {
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
      if (!data.length) {
        el.innerHTML = '<div class="text-center py-12 text-zinc-400 text-[14px]">Nenhuma corrida registrada</div>';
        return;
      }

      const coresStatus = {
        buscando: '#f59e0b',
        oferecida: '#f59e0b',
        aceita: '#059669',
        chegou: '#059669',
        em_andamento: '#059669',
        finalizada: '#0A0A0A',
        cancelada: '#dc2626',
        sem_motoqueiro: '#71717a'
      };

      el.innerHTML = data.map(c => {
        const dataFmt   = new Date(c.criado_em).toLocaleDateString('pt-BR');
        const nomePass  = c.passageiro?.nome_completo || 'Passageiro';
        const telPass   = c.passageiro?.telefone || '';
        const nomeMot   = c.motoqueiro?.profiles?.nome_completo || 'Sem motoqueiro';
        const telMot    = c.motoqueiro?.profiles?.telefone || '';
        const moto      = c.motoqueiro
          ? `${c.motoqueiro.moto_marca || ''} ${c.motoqueiro.moto_modelo || ''}`.trim() +
            (c.motoqueiro.moto_placa ? ' · ' + c.motoqueiro.moto_placa : '')
          : '';
        const corStatus = coresStatus[c.status] || '#71717a';

        return `
          <div class="admin-card">
            <div class="flex items-start justify-between gap-3 mb-3">
              <div class="flex-1 min-w-0">
                <div class="font-bold text-[13px] truncate">${c.origem_nome || '—'}</div>
                <div class="text-[11px] text-zinc-500 truncate">→ ${c.destino_nome || '—'}</div>
              </div>
              <div class="text-right flex-shrink-0">
                <div class="sora font-bold text-[15px]">R$ ${(c.preco_total || 0).toFixed(2).replace('.', ',')}</div>
                <div class="text-[10px] text-zinc-400">${dataFmt}</div>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-zinc-100">
              <div class="min-w-0">
                <div class="text-[9px] font-bold tracking-widest uppercase text-zinc-400">Passageiro</div>
                <div class="text-[12px] font-semibold truncate mt-0.5">👤 ${nomePass}</div>
                ${telPass ? `<div class="text-[10px] text-zinc-500 truncate">${telPass}</div>` : ''}
              </div>
              <div class="min-w-0">
                <div class="text-[9px] font-bold tracking-widest uppercase text-zinc-400">Motoqueiro</div>
                <div class="text-[12px] font-semibold truncate mt-0.5">🏍️ ${nomeMot}</div>
                ${telMot ? `<div class="text-[10px] text-zinc-500 truncate">${telMot}</div>` : ''}
                ${moto   ? `<div class="text-[10px] text-zinc-400 truncate">${moto}</div>` : ''}
              </div>
            </div>

            <div class="flex items-center justify-between mt-3 pt-2 border-t border-zinc-100">
              <div class="text-[10px] text-zinc-500">📏 ${(c.distancia_km || 0).toFixed(1)} km</div>
              <div class="text-[10px] font-bold px-2 py-0.5 rounded-full"
                   style="background:${corStatus}20; color:${corStatus}">
                ${(c.status || '').toUpperCase()}
              </div>
            </div>
          </div>`;
      }).join('');
    } catch (e) {
      console.error(e);
      el.innerHTML = '<div class="text-center py-12 text-red-500 text-[13px]">Erro: ' + e.message + '</div>';
    }
  }

  async function carregarStats() {
    const el = $('admin-stats');
    el.innerHTML = '<div class="text-center py-12 text-zinc-400 text-[14px] col-span-2">Carregando...</div>';
    try {
      const { data, error } = await supabase.rpc('admin_stats');
      if (error) throw error;
      const s = data || {};
      el.innerHTML = [
        { r: 'Motoqueiros', v: s.total_motoqueiros || 0 },
        { r: 'Pendentes', v: s.motoqueiros_pendentes || 0 },
        { r: 'Aprovados', v: s.motoqueiros_aprovados || 0 },
        { r: 'Online', v: s.motoqueiros_online || 0 },
        { r: 'Passageiros', v: s.total_passageiros || 0 },
        { r: 'Total corridas', v: s.total_corridas || 0 },
        { r: 'Ativas', v: s.corridas_ativas || 0 },
        { r: 'Finalizadas', v: s.corridas_finalizadas || 0 },
        { r: 'Receita total', v: 'R$ ' + (s.receita_total || 0).toFixed(2).replace('.', ',') },
        { r: 'Receita mês', v: 'R$ ' + (s.receita_mes || 0).toFixed(2).replace('.', ',') }
      ].map(x => '<div class="admin-stat"><div class="valor">' + x.v + '</div><div class="rotulo">' + x.r + '</div></div>').join('');
    } catch (e) {
      console.error(e);
      el.innerHTML = '<div class="text-center py-12 text-red-500 text-[13px] col-span-2">Erro: ' + e.message + '</div>';
    }
  }

  async function mudarStatus(id, novoStatus) {
    try {
      const { error } = await supabase
        .from('motoqueiros')
        .update({ status: novoStatus, aprovado_em: novoStatus === 'aprovado' ? new Date().toISOString() : null })
        .eq('id', id);
      if (error) throw error;
      mostrarToast('Motoqueiro ' + (novoStatus === 'aprovado' ? 'aprovado ✅' : 'reprovado'), 'success');
      carregarPendentes();
      carregarStats();
    } catch (e) {
      mostrarToast('Erro: ' + e.message, 'error');
    }
  }

  /* =========================================================
     TEMA
     ========================================================= */
  const TEMA_KEY = 'mj_tema';
  function aplicarTema(tema) {
    const btn = $('btn-tema');
    if (tema === 'escuro') {
      document.body.classList.add('modo-escuro');
      if (btn) btn.textContent = '☀️';
    } else {
      document.body.classList.remove('modo-escuro');
      if (btn) btn.textContent = '🌙';
    }
  }
  function alternarTema() {
    const atual = localStorage.getItem(TEMA_KEY) || 'claro';
    const novo = atual === 'claro' ? 'escuro' : 'claro';
    localStorage.setItem(TEMA_KEY, novo);
    aplicarTema(novo);
    mostrarToast(novo === 'escuro' ? '🌙 Modo noturno ativado' : '☀️ Modo claro ativado');
  }
    (function() { aplicarTema(localStorage.getItem(TEMA_KEY) || 'claro'); })();
  $('btn-tema').addEventListener('click', alternarTema);

  /* =========================================================
     ✅ ANTI-AUTOFILL — limpa campos sensíveis ao carregar
     ========================================================= */
  (function limparAutofill() {
    const campos = ['destino-input', 'fav-endereco'];

    campos.forEach(id => {
      const el = $(id);
      if (!el) return;

      el.value = '';

      [100, 500, 1500, 3000].forEach(ms => {
        setTimeout(() => {
          if (el.value && el.value.includes('@')) {
            el.value = '';
          }
        }, ms);
      });
    });
  })();

  /* =========================================================
     INIT
     ========================================================= */
  renderFavoritos();
  obterLocalizacaoReal();
  carregarConfigPrecos();

  window.addEventListener('resize', debounce(() => {
    const desktop = window.innerWidth >= 768;
    Object.assign(mapPad, desktop
      ? { paddingTopLeft: [460, 80], paddingBottomRight: [60, 60] }
      : { paddingTopLeft: [40, 80], paddingBottomRight: [40, 380] });
    map.invalidateSize();
  }, 200));

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (state.pollTimer) { clearInterval(state.pollTimer); state.pollTimer = null; }
      if (state._pollOferta) { clearInterval(state._pollOferta); state._pollOferta = null; }
      if (state.timerHeartbeat) { clearInterval(state.timerHeartbeat); state.timerHeartbeat = null; }
      console.log('[Egress] aba oculta → polling pausado');
    } else {
      if (state.corridaId) iniciarPolling(state.corridaId);
      if (state.motoqueiroCadastro?.status === 'aprovado' && state.motoqueiroCadastro?.disponivel) {
        iniciarHeartbeat();
        ouvirMinhasOfertasSafe();
      }
      console.log('[Egress] aba visível → polling religado');
    }
  });

  function ouvirMinhasOfertasSafe() {
    try { ouvirMinhasOfertas(); } catch (_) {}
  }

  window.addEventListener('beforeunload', () => {
    pararHeartbeat();
  });

})();
