/* =========================================================
   MotoJá Premium — app.js
   ========================================================= */

/* =========================================================
   1. SUPABASE — CONFIGURACAO
   ========================================================= */
const SUPABASE_URL = 'https://jskwwxhnvcrsamcvwgcv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impza3d3eGhudmNyc2FtY3Z3Z2N2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEzNDM5MjksImV4cCI6MjEwNjkxOTkyOX0.iXvIcVZBDWlOrRYDkMgj0e5agWX6T2D4Y9yjc2ZDldY';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

/* =========================================================
   2. UTILITARIOS
   ========================================================= */
const $ = (id) => document.getElementById(id);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const STORAGE = { FAV: 'mj_favoritos_v2' };

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
  const p1 = a.lat * Math.PI / 180, p2 = b.lat * Math.PI / 180;
  const dL = (b.lng - a.lng) * Math.PI / 180;
  const y = Math.sin(dL) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dL);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function formatMoney(v) { return 'R$ ' + v.toFixed(2).replace('.', ','); }

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
   3. TOAST & BANNER
   ========================================================= */
let toastTimer = null;
function mostrarToast(msg, tipo = 'info') {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast on' + (tipo === 'error' ? ' error' : tipo === 'success' ? ' success' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 2400);
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
   4. VIES GEOGRAFICO (busca com raio)
   ========================================================= */
function montarViewbox(raioGraus = 0.15) {
  if (!state.pickup) return '';
  const { lat, lng } = state.pickup;
  const left = lng - raioGraus, right = lng + raioGraus;
  const top = lat + raioGraus, bottom = lat - raioGraus;
  return `&viewbox=${left},${top},${right},${bottom}&bounded=1`;
}

/* =========================================================
   5. MAPA
   ========================================================= */
const map = L.map('map', { zoomControl: false, attributionControl: true }).setView([-15.7939, -47.8828], 4);
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
  maxZoom: 19, attribution: 'Esri'
}).addTo(map);

const isDesktop = window.innerWidth >= 768;
const mapPad = isDesktop
  ? { paddingTopLeft: [460, 80], paddingBottomRight: [60, 60] }
  : { paddingTopLeft: [40, 80], paddingBottomRight: [40, 380] };

const iconeOrigem = L.divIcon({ className: '', iconSize: [20, 20], iconAnchor: [10, 10], html: '<div class="mk-origem"></div>' });
const iconeDestino = L.divIcon({ className: '', iconSize: [18, 18], iconAnchor: [9, 9], html: '<div class="mk-dest"></div>' });
const iconeEu = L.divIcon({ className: '', iconSize: [24, 24], iconAnchor: [12, 12], html: '<div class="mk-eu"></div>' });

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
   6. ESTADO GLOBAL
   ========================================================= */
const state = {
  pickup: null, destino: null, rota: null, opcao: null,
  user: null, profile: null,
  motoqueiroCadastro: null,
  motoPos: null, motoAlvo: null, motoDir: 0, motoTimer: null, motoAtivo: false,
  buscaAbort: null, favAbort: null,
  gpsTimer: null, realtimeChannel: null
};

const CATEGORIA_MOTO = {
  id: 'moto', nome: 'Moto', desc: 'Corrida premium de moto',
  icone: '🏍', base: 4, porKm: 1.6, espera: 3
};

const MOTOQUEIROS = [
  { nome: 'Joao Almeida', moto: 'Honda CG 160 Titan', detalhe: 'Vermelha - 2022 - 160cc', placa: 'ABC1D23' },
  { nome: 'Maria Souza', moto: 'Yamaha Factor 150', detalhe: 'Azul - 2023 - 150cc', placa: 'XYZ4E56' },
  { nome: 'Carlos Pereira', moto: 'Honda XRE 300', detalhe: 'Preta - 2024 - 300cc', placa: 'QWE7R89' },
  { nome: 'Ana Lima', moto: 'Yamaha Fazer 250', detalhe: 'Cinza - 2023 - 250cc', placa: 'JKL0M12' },
  { nome: 'Rafael Costa', moto: 'Royal Enfield Hunter', detalhe: 'Verde - 2024 - 350cc', placa: 'POI3U45' }
];

function mostrarPasso(n) {
  $$('#sheet section').forEach(s => s.classList.add('hidden'));
  const el = $(`step-${n}`);
  if (el) el.classList.remove('hidden');
}

/* =========================================================
   7. HELPERS SUPABASE
   ========================================================= */
async function buscarMotoqueirosProximos(lat, lng, raioKm = 5, limite = 10) {
  try {
    const { data, error } = await supabase.rpc('buscar_motoqueiros_proximos', {
      p_lat: lat, p_lng: lng, p_raio_km: raioKm, p_limite: limite
    });
    if (error) throw error;
    return data || [];
  } catch (e) { console.warn('[MotoJa] buscar motoqueiros:', e.message); return []; }
}

async function atualizarMinhaPosicao(lat, lng, disponivel = true) {
  try {
    const { error } = await supabase.rpc('atualizar_posicao_motoqueiro', {
      p_lat: lat, p_lng: lng, p_disponivel: disponivel
    });
    if (error) throw error;
    return true;
  } catch (e) { console.warn('[MotoJa] atualizar posicao:', e.message); return false; }
}

async function criarCorridaBackend(origem, destino, distancia, duracao, preco) {
  const { data, error } = await supabase.rpc('criar_corrida', {
    p_origem_nome: origem.nome, p_origem_lat: origem.lat, p_origem_lng: origem.lng,
    p_destino_nome: destino.nome, p_destino_lat: destino.lat, p_destino_lng: destino.lng,
    p_distancia_km: distancia, p_duracao_min: duracao, p_preco_total: preco
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
  if (!state.user) throw new Error('Faca login primeiro');
  const { data, error } = await supabase
    .from('motoqueiros')
    .upsert({
      profile_id: state.user.id, status: 'pendente',
      moto_marca: dados.marca, moto_modelo: dados.modelo,
      moto_ano: parseInt(dados.ano) || null, moto_cor: dados.cor,
      moto_placa: dados.placa, moto_cc: parseInt(dados.cc) || null
    }, { onConflict: 'profile_id' }).select().single();
  if (error) throw error;
  return data;
}

async function uploadDocumento(motoqueiroId, tipo, arquivo) {
  if (!state.user) throw new Error('Faca login primeiro');
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
   8. AUTENTICACAO - UI
   ========================================================= */
const modalAuth = $('modal-auth');

function abrirAuth(aba = 'login') {
  modalAuth.classList.remove('hidden');
  modalAuth.classList.add('flex');
  trocarAba(aba);
}
function fecharAuth() {
  modalAuth.classList.add('hidden');
  modalAuth.classList.remove('flex');
  $('form-login').reset();
  $('form-signup').reset();
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

/* =========================================================
   9. AUTENTICACAO - FUNCOES
   ========================================================= */
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
  pararGPS();
  await supabase.auth.signOut();
  mostrarToast('Sessao encerrada');
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

    state.motoqueiroCadastro = await buscarMeuCadastroMotoqueiro();
    atualizarUIMotoqueiro();

    const favsBackend = await carregarFavoritosDoBackend();
    if (favsBackend.length > 0) { favoritos = favsBackend; renderFavoritos(); }

    if (state.pickup) {
      carregarMotoqueirosNoMapa();
      inscreverRealtimeMotoqueiros();
    }
  } else {
    state.user = null; state.profile = null; state.motoqueiroCadastro = null;
    $('btn-conta').innerHTML = '👤 Entrar';
    $('user-logado').classList.add('hidden');
    limparMotoqueirosDoMapa();
    atualizarUIMotoqueiro();
  }
}

supabase.auth.onAuthStateChange(async (event, session) => {
  console.log('[Auth]', event);
  if (session?.user) {
    const profile = await carregarProfile(session.user.id);
    await atualizarUIUsuario(session.user, profile);
    if (event === 'SIGNED_IN') { fecharAuth(); mostrarToast('Bem-vindo!', 'success'); }
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

/* =========================================================
   10. FORMULARIOS DE AUTH
   ========================================================= */
$('form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('btn-login-submit');
  const email = $('login-email').value.trim();
  const senha = $('login-senha').value;
  if (!isValidEmail(email)) { mostrarToast('E-mail invalido', 'error'); return; }
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
  if (!isValidEmail(email)) { mostrarToast('E-mail invalido', 'error'); return; }
  if (senha.length < 6) { mostrarToast('Senha deve ter pelo menos 6 caracteres', 'error'); return; }
  const txt = btn.textContent; btn.disabled = true; btn.textContent = 'Criando conta...';
  try {
    const data = await fazerCadastro(nome, email, senha, telefone);
    if (!data.session) { mostrarToast('Verifique seu e-mail para confirmar', 'success'); fecharAuth(); }
  } catch (err) {
    let msg = err.message;
    if (msg.includes('already registered')) msg = 'E-mail ja cadastrado';
    else if (msg.includes('Password')) msg = 'Senha muito fraca';
    mostrarToast(msg, 'error');
    btn.disabled = false; btn.textContent = txt;
  }
});

/* =========================================================
   11. GEOCODING
   ========================================================= */
async function geocodificarReverso(lat, lng) {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`, { headers: { 'Accept-Language': 'pt-BR' } });
    if (!r.ok) throw new Error('HTTP');
    const j = await r.json();
    if (j?.display_name) return j.display_name.split(',').slice(0, 2).join(',').trim();
  } catch (_) {}
  return 'Local selecionado';
}

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
    mostrarBanner('Navegador sem GPS', 'erro', 'Padrao', () => {
      definirPickup(-23.5615, -46.6560, 'Av. Paulista, 1578'); esconderBanner();
    });
    return;
  }
  const isSecure = location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname);
  if (!isSecure) {
    mostrarBanner('Use HTTPS para GPS', 'erro', 'Padrao', () => {
      definirPickup(-23.5615, -46.6560, 'Av. Paulista'); esconderBanner();
    });
    return;
  }
  mostrarBanner('Localizando com precisao premium...', 'info');
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      await definirPickup(pos.coords.latitude, pos.coords.longitude, null, true);
      mostrarBanner('📍 Voce esta aqui', 'sucesso');
      setTimeout(esconderBanner, 2500);
      if (state.user) { carregarMotoqueirosNoMapa(); inscreverRealtimeMotoqueiros(); }
    },
    (err) => {
      const msg = err.code === 1 ? 'Permissao negada. Ative o GPS.' : 'GPS indisponivel';
      mostrarBanner(msg, 'erro', 'Tentar', () => obterLocalizacaoReal());
      if (!state.pickup) definirPickup(-23.5615, -46.6560, 'Av. Paulista, 1578 (padrao)');
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
   12. BUSCA DE DESTINO
   ========================================================= */
let resAtuais = [];
const buscarDestino = debounce(async (q) => {
  if (state.buscaAbort) state.buscaAbort.abort();
  const ac = new AbortController(); state.buscaAbort = ac;
  const viewboxParam = montarViewbox(0.15);
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=8&countrycodes=br&addressdetails=1${viewboxParam}`;
    const r = await fetch(url, { signal: ac.signal, headers: { 'Accept-Language': 'pt-BR' } });
    if (!r.ok) throw new Error('HTTP');
    resAtuais = await r.json();
    renderSug(resAtuais);
  } catch (e) {
    if (e.name !== 'AbortError') $('sugestoes').innerHTML = '<div class="p-3 text-zinc-400 text-[13px]">Erro ao buscar.</div>';
  }
}, 400);

$('destino-input').addEventListener('input', () => {
  const q = $('destino-input').value.trim();
  if (q.length < 3) { $('sugestoes').innerHTML = ''; return; }
  $('sugestoes').innerHTML = '<div class="p-3 text-zinc-400 text-[13px]">Buscando perto de voce...</div>';
  buscarDestino(q);
});

function renderSug(lista) {
  if (!lista.length) {
    $('sugestoes').innerHTML = '<div class="p-3 text-zinc-400 text-[13px]">Nenhum resultado perto de voce.</div>';
    return;
  }
  $('sugestoes').innerHTML = lista.map((it, i) => {
    const p = it.display_name.split(',');
    return `<div class="sugestao flex gap-3 p-3 hover:bg-zinc-100 rounded-2xl cursor-pointer transition" data-i="${i}">
      <div class="w-9 h-9 rounded-full bg-zinc-100 flex items-center justify-center">📍</div>
      <div class="min-w-0 flex-1">
        <div class="font-bold text-[13px] truncate">${p[0]}</div>
        <div class="text-[11px] text-zinc-500 truncate">${p.slice(1, 3).join(',')}</div>
      </div>
    </div>`;
  }).join('');
  $$('.sugestao').forEach(el => {
    el.addEventListener('click', () => {
      const it = resAtuais[+el.dataset.i];
      if (it) escolherDestino(+it.lat, +it.lon, it.display_name.split(',').slice(0, 2).join(',').trim());
    });
  });
}

/* =========================================================
   13. FAVORITOS
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
function fecharModalFav() {
  modalFav.classList.add('hidden'); modalFav.classList.remove('flex');
  if (state.favAbort) state.favAbort.abort();
}

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
  const viewboxParam = montarViewbox(0.15);
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=8&countrycodes=br&addressdetails=1${viewboxParam}`;
    const r = await fetch(url, { signal: ac.signal, headers: { 'Accept-Language': 'pt-BR' } });
    const favRes = await r.json();
    $('fav-sugestoes').innerHTML = favRes.map((it, i) => {
      const p = it.display_name.split(',');
      return `<div class="fav-sug flex gap-3 p-2.5 hover:bg-zinc-100 rounded-xl cursor-pointer transition" data-i="${i}">
        <div class="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-[13px]">📍</div>
        <div class="min-w-0 flex-1">
          <div class="font-bold text-[12px] truncate">${p[0]}</div>
          <div class="text-[10px] text-zinc-500 truncate">${p.slice(1, 3).join(',')}</div>
        </div>
      </div>`;
    }).join('');
    $$('.fav-sug').forEach(el => {
      el.addEventListener('click', () => {
        const it = favRes[+el.dataset.i];
        if (!it) return;
        favLatLng = { lat: +it.lat, lng: +it.lon };
        const label = it.display_name.split(',').slice(0, 2).join(',').trim();
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
  mostrarToast('Favorito salvo!', 'success');
});

/* =========================================================
   14. DESTINO - ROTA - CONFIRMACAO
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
    <span><b class="text-black">${Math.round(rota.duracao)} min</b> - ${rota.distancia.toFixed(1)} km</span>
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
        <div class="text-[11px] text-white/50 mt-1">Chega em ~${CATEGORIA_MOTO.espera} min - Viagem de ${tempo} min</div>
      </div>
      <div class="text-right">
        <div class="sora font-extrabold text-[20px] text-[#FF6A00]">${formatMoney(preco)}</div>
        <div class="text-[10px] text-white/50 uppercase tracking-widest font-bold mt-1">Total</div>
      </div>
    </div>`;

  const btn = $('btn-confirmar');
  btn.disabled = false;
  btn.className = 'mt-5 w-full bg-black text-white rounded-2xl py-[18px] font-bold sora text-[15px] shadow-premium hover:bg-zinc-900 transition';
  btn.textContent = `Confirmar - ${formatMoney(preco)}`;
}

/* =========================================================
   15. CONFIRMAR - BUSCAR - MOTOQUEIRO
   ========================================================= */
let buscaTimeout = null;

$('btn-confirmar').addEventListener('click', async () => {
  if (!state.opcao || $('btn-confirmar').disabled) return;
  $('btn-confirmar').disabled = true;
  mostrarPasso('buscando');

  if (state.user && state.pickup && state.destino) {
    try {
      const preco = CATEGORIA_MOTO.base + CATEGORIA_MOTO.porKm * state.rota.distancia;
      const corridaId = await criarCorridaBackend(
        state.pickup, state.destino,
        state.rota.distancia, state.rota.duracao, preco
      );
      console.log('[MotoJa] Corrida criada:', corridaId);
    } catch (e) {
      console.warn('[MotoJa] Nao foi possivel criar corrida no backend:', e.message);
    }
  }

  if (state.pickup) {
    const proximos = await buscarMotoqueirosProximos(state.pickup.lat, state.pickup.lng, 5, 5);
    if (proximos.length > 0) {
      console.log('[MotoJa] Motoqueiros reais encontrados:', proximos.length);
    }
  }

  buscaTimeout = setTimeout(encontrarMotoqueiro, 2800);
});

$('btn-cancelar-busca').addEventListener('click', () => {
  clearTimeout(buscaTimeout);
  state.destino = state.rota = state.opcao = null;
  limparRotaVisual();
  $('destino-input').value = '';
  $('sugestoes').innerHTML = '';
  mostrarPasso('destino');
});

function encontrarMotoqueiro() {
  const m = MOTOQUEIROS[Math.floor(Math.random() * MOTOQUEIROS.length)];
  const ini = initials(m.nome);
  const nota = (4.8 + Math.random() * 0.19).toFixed(2).replace('.', ',');
  const viagens = Math.floor(1200 + Math.random() * 4000).toLocaleString('pt-BR');
  const cod = String(Math.floor(1000 + Math.random() * 9000));

  $('dr-avatar').textContent = ini;
  $('dr-nome').textContent = m.nome;
  $('dr-nota').textContent = '★ ' + nota;
  $('dr-viagens').textContent = '- ' + viagens + ' corridas';
  $('dr-moto').textContent = m.moto;
  $('dr-detalhe').textContent = m.detalhe;
  $('dr-placa').textContent = m.placa;
  $('codigo-embarque').textContent = cod.split('').join(' ');

  const ang = Math.random() * Math.PI * 2;
  const dist = 0.006;
  state.motoPos = { lat: state.pickup.lat + Math.cos(ang) * dist, lng: state.pickup.lng + Math.sin(ang) * dist * 1.2 };
  state.motoAlvo = { lat: state.pickup.lat, lng: state.pickup.lng };
  state.motoDir = bearing(state.motoPos, state.motoAlvo);
  state.motoAtivo = true;

  if (markerMoto) map.removeLayer(markerMoto);
  const etaIni = Math.max(2, Math.round(haversine(state.motoPos, state.motoAlvo) * 60 / 25));
  markerMoto = L.marker([state.motoPos.lat, state.motoPos.lng], { icon: criarIconeMoto(state.motoDir, etaIni), zIndexOffset: 1000 }).addTo(map);

  const g = L.featureGroup([markerOrigem, markerMoto]);
  map.fitBounds(g.getBounds().pad(0.7), mapPad);
  mostrarPasso('motorista');

  if (state.motoTimer) clearInterval(state.motoTimer);
  state.motoTimer = setInterval(() => {
    if (!state.motoAtivo) return;
    const a = state.motoPos, b = state.motoAlvo;
    const nl = a.lat + (b.lat - a.lat) * 0.25;
    const nl2 = a.lng + (b.lng - a.lng) * 0.25;
    state.motoDir = bearing(a, { lat: nl, lng: nl2 });
    state.motoPos = { lat: nl, lng: nl2 };
    const d = haversine(state.motoPos, b);
    const eta = Math.max(1, Math.round(d * 60 / 25));
    if (markerMoto) { markerMoto.setLatLng([nl, nl2]); markerMoto.setIcon(criarIconeMoto(state.motoDir, eta)); }
    $('dr-eta').textContent = eta + ' min';
    if (d < 0.03) {
      clearInterval(state.motoTimer); state.motoAtivo = false;
      $('dr-eta').textContent = 'Chegou!';
      mostrarToast('Motoqueiro chegou!', 'success');
    }
  }, 1500);
}

/* =========================================================
   16. RESET
   ========================================================= */
function resetCorrida() {
  if (state.motoTimer) clearInterval(state.motoTimer);
  state.motoAtivo = false;
  state.destino = state.rota = state.opcao = null;
  limparRotaVisual();
  if (state.pickup) map.setView([state.pickup.lat, state.pickup.lng], 15);
  $('destino-input').value = '';
  $('sugestoes').innerHTML = '';
  mostrarPasso('destino');
}
$('btn-nova').addEventListener('click', resetCorrida);
$('btn-voltar').addEventListener('click', () => {
  limparRotaVisual();
  state.destino = state.rota = state.opcao = null;
  $('destino-input').value = '';
  $('sugestoes').innerHTML = '';
  if (state.pickup) map.setView([state.pickup.lat, state.pickup.lng], 15);
  mostrarPasso('destino');
});

/* =========================================================
   17. PAINEL DO MOTOQUEIRO (ONLINE / GPS)
   ========================================================= */
function atualizarUIMotoqueiro() {
  const painel = $('painel-motoqueiro');
  const btnToggle = $('btn-toggle-online');
  const texto = $('moto-status-texto');

  if (!state.motoqueiroCadastro) { painel.classList.add('hidden'); return; }

  painel.classList.remove('hidden');
  const c = state.motoqueiroCadastro;

  if (c.status !== 'aprovado') {
    texto.textContent = `Status: ${c.status} - Aguarde aprovacao`;
    btnToggle.disabled = true;
    btnToggle.className = 'bg-zinc-500 text-white rounded-full px-3 py-1.5 text-[11px] font-bold cursor-not-allowed';
    btnToggle.textContent = 'Aguardando';
    return;
  }

  texto.textContent = `Status: aprovado - ${c.disponivel ? 'Online' : 'Offline'}`;
  btnToggle.disabled = false;
  btnToggle.className = c.disponivel
    ? 'bg-red-500 text-white rounded-full px-3 py-1.5 text-[11px] font-bold'
    : 'bg-[#FF6A00] text-white rounded-full px-3 py-1.5 text-[11px] font-bold';
  btnToggle.textContent = c.disponivel ? 'Ficar offline' : 'Ficar online';
}

function iniciarGPS() {
  if (state.gpsTimer) clearInterval(state.gpsTimer);
  const enviar = () => {
    if (!state.motoqueiroCadastro) return;
    navigator.geolocation.getCurrentPosition(async (pos) => {
      await atualizarMinhaPosicao(pos.coords.latitude, pos.coords.longitude, true);
    }, () => {}, { enableHighAccuracy: true, timeout: 8000 });
  };
  enviar();
  state.gpsTimer = setInterval(enviar, 10000);
}

function pararGPS() {
  if (state.gpsTimer) { clearInterval(state.gpsTimer); state.gpsTimer = null; }
}

$('btn-toggle-online').addEventListener('click', async () => {
  if (!state.motoqueiroCadastro) return;
  const c = state.motoqueiroCadastro;
  const novoEstado = !c.disponivel;

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const ok = await atualizarMinhaPosicao(pos.coords.latitude, pos.coords.longitude, novoEstado);
      if (ok) {
        c.disponivel = novoEstado;
        state.motoqueiroCadastro = c;
        atualizarUIMotoqueiro();
        if (novoEstado) { iniciarGPS(); mostrarToast('Voce esta online!', 'success'); }
        else { pararGPS(); mostrarToast('Voce esta offline'); }
      } else {
        mostrarToast('Erro ao atualizar status', 'error');
      }
    },
    () => mostrarToast('Ative o GPS para ficar online', 'error'),
    { enableHighAccuracy: true, timeout: 8000 }
  );
});

/* =========================================================
   18. MAPA COM MOTOQUEIROS REAIS (Realtime)
   ========================================================= */
async function carregarMotoqueirosNoMapa() {
  if (!state.pickup) return;
  const lista = await buscarMotoqueirosProximos(state.pickup.lat, state.pickup.lng, 10, 20);
  limparMotoqueirosDoMapa();

  lista.forEach(m => {
    const marker = L.marker([m.lat, m.lng], { icon: criarIconeMotoSimples(m.nome) })
      .addTo(map)
      .bindPopup(`<b>${m.nome}</b><br>${m.moto_marca || ''} ${m.moto_modelo || ''}<br>${m.distancia_km} km`);
    markersMotoqueiros.set(m.id, marker);
  });

  console.log('[MotoJa] Motoqueiros no mapa:', lista.length);
}

function inscreverRealtimeMotoqueiros() {
  if (state.realtimeChannel) supabase.removeChannel(state.realtimeChannel);
  state.realtimeChannel = supabase.channel('motoqueiros-online')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'motoqueiros' }, (payload) => {
      const m = payload.new;
      if (!m || !m.localizacao) return;
      carregarMotoqueirosNoMapa();
    })
    .subscribe();
}

/* =========================================================
   19. MODAL MOTOQUEIRO - CADASTRO NO BACKEND
   ========================================================= */
const modalMoto = $('modal-moto');
let etapaMoto = 1;
const checksMoto = {};
const arquivosMoto = { cnh: null, crlv: null, selfie: null };

function goMoto(n) {
  etapaMoto = n;
  modalMoto.querySelectorAll('.form-step').forEach(s => s.classList.toggle('hidden', +s.dataset.step !== n));
  $('titulo-moto').textContent = ['Cadastro de Motoqueiro','Dados da sua moto','Envio de documentos','Confirmacoes finais','Cadastro enviado'][n-1] || 'Cadastro';
  modalMoto.querySelectorAll('.bar').forEach((b, i) => {
    b.className = 'bar flex-1 rounded-full ' + (i < Math.min(n, 4) ? 'bg-[#FF6A00]' : 'bg-zinc-200');
  });
  const bv = $('btn-moto-voltar'), bp = $('btn-moto-proximo');
  bv.style.visibility = (n === 1 || n === 5) ? 'hidden' : 'visible';
  bp.textContent = n === 4 ? 'Enviar cadastro' : n === 5 ? 'Fechar' : 'Continuar';
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
    if (statusEl) { statusEl.textContent = 'OK ' + file.name.slice(0, 25); statusEl.className = 'text-[11px] text-emerald-600 mt-1 font-bold'; }
    const wrap = input.closest('.upload');
    if (wrap) wrap.classList.add('!border-emerald-500', '!bg-emerald-50');
  });
});

function abrirMoto() {
  if (!state.user) { mostrarToast('Faca login para ser motoqueiro', 'error'); abrirAuth('login'); return; }
  Object.keys(checksMoto).forEach(k => delete checksMoto[k]);
  Object.keys(arquivosMoto).forEach(k => arquivosMoto[k] = null);
  modalMoto.querySelectorAll('.check-item').forEach(c => {
    c.classList.remove('!border-black');
    const b = c.querySelector('.box');
    b.classList.remove('!bg-black', '!text-white');
    b.innerHTML = '';
  });
  modalMoto.querySelectorAll('.upload').forEach(u => u.classList.remove('!border-emerald-500', '!bg-emerald-50'));
  modalMoto.querySelectorAll('[data-status]').forEach(el => { el.textContent = 'Nao enviado'; el.className = 'text-[11px] text-zinc-500 mt-1'; });
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
    if (!checksMoto.auth || !checksMoto.capacete) { mostrarToast('Aceite as declaracoes', 'error'); return; }
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
  if (etapaMoto === 3) {
    if (!arquivosMoto.cnh || !arquivosMoto.crlv || !arquivosMoto.selfie) {
      mostrarToast('Envie os 3 documentos', 'error'); return;
    }
  }
  goMoto(etapaMoto + 1);
});

$('moto-cpf') && $('moto-cpf').addEventListener('input', e => { e.target.value = maskCPF(e.target.value); });
$('moto-cep') && $('moto-cep').addEventListener('input', e => { e.target.value = maskCEP(e.target.value); });
$('moto-whats') && $('moto-whats').addEventListener('input', e => { e.target.value = maskPhone(e.target.value); });
$('moto-placa') && $('moto-placa').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7); });

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (!$('modal-fav').classList.contains('hidden')) fecharModalFav();
  else if (!modalAuth.classList.contains('hidden')) fecharAuth();
  else if (!modalMoto.classList.contains('hidden')) fecharMoto();
});

/* =========================================================
   20. INICIALIZACAO
   ========================================================= */
renderFavoritos();
obterLocalizacaoReal();

window.addEventListener('resize', debounce(() => {
  const desktop = window.innerWidth >= 768;
  Object.assign(mapPad, desktop
    ? { paddingTopLeft: [460, 80], paddingBottomRight: [60, 60] }
    : { paddingTopLeft: [40, 80], paddingBottomRight: [40, 380] });
  map.invalidateSize();
}, 200));
