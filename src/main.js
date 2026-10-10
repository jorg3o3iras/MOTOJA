import { initTema } from './ui/tema.js';
import { registrar, initEsc, abrir, fechar } from './ui/modals.js';
import { initMapa } from './map/mapa.js';
import { initModoMapa } from './map/modo-mapa.js';
import { initPassageiro, obterLocalizacaoReal, escolherDestino } from './flows/passageiro.js';
import { initMotoqueiro, atualizarUIMotoqueiro } from './flows/motoqueiro.js';
import { initCadastroMoto } from './flows/cadastro-moto.js';
import { initAdmin } from './flows/admin.js';
import { carregarConfigPrecos } from './services/precos.js';
import { supabase } from './lib/supabase.js';
import { app, setUser } from './stores/app.js';
import { buscarMeuCadastroMotoqueiro } from './services/motoqueiro.js';
import { escapeHtml, initials } from './lib/utils.js';
import { mostrarToast } from './ui/toast.js';
import { installFacade } from './facade.js';

/* ---------- Registrar modais no controller ---------- */
[
  'modal-auth', 'modal-moto', 'modal-fav', 'modal-admin',
  'modal-admin-senha', 'modal-oferta', 'modal-pagamento',
  'modal-avaliacao', 'modal-camadas'
].forEach(registrar);

initEsc();

/* ---------- Boot ---------- */
async function boot() {
  initTema();

  initMapa();
  initModoMapa(async (lat, lng, nome) => {
    await escolherDestino(lat, lng, nome);
  });

  initPassageiro();
  initMotoqueiro();
  initCadastroMoto();
  initAdmin();

  await carregarConfigPrecos();
  obterLocalizacaoReal();

  /* ---------- Auth listener ---------- */
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (session?.user) {
      const { data: profile } = await supabase
        .from('profiles').select('*').eq('id', session.user.id).single();
      setUser(session.user, profile);
      atualizarHeaderUser();
      app.motoqueiroCadastro = await buscarMeuCadastroMotoqueiro(session.user.id);
      atualizarUIMotoqueiro();
      if (event === 'SIGNED_IN') {
        fechar('modal-auth');
        mostrarToast('✓ Bem-vindo!', 'success');
      }
    } else {
      setUser(null, null);
      atualizarHeaderUser();
      app.motoqueiroCadastro = null;
      atualizarUIMotoqueiro();
    }
  });

  /* ---------- Sessão existente ---------- */
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    const { data: profile } = await supabase
      .from('profiles').select('*').eq('id', session.user.id).single();
    setUser(session.user, profile);
    atualizarHeaderUser();
    app.motoqueiroCadastro = await buscarMeuCadastroMotoqueiro(session.user.id);
    atualizarUIMotoqueiro();
  }

  /* ---------- Auth UI ---------- */
  document.getElementById('btn-conta')?.addEventListener('click', () => {
    if (app.user) {
      if (confirm('Deseja sair da conta?')) fazerLogout();
    } else {
      abrir('modal-auth');
      trocarAba('login');
    }
  });

  document.getElementById('btn-sair-header')?.addEventListener('click', () => {
    if (confirm('Deseja sair da conta?')) fazerLogout();
  });

  document.getElementById('btn-logout')?.addEventListener('click', fazerLogout);

  document.getElementById('tab-login')?.addEventListener('click', () => trocarAba('login'));
  document.getElementById('tab-signup')?.addEventListener('click', () => trocarAba('signup'));
  document.getElementById('btn-fechar-auth')?.addEventListener('click', () => fechar('modal-auth'));

  document.getElementById('form-login')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const senha = document.getElementById('login-senha').value;
    const btn = document.getElementById('btn-login-submit');
    const txt = btn.textContent;
    btn.disabled = true; btn.textContent = 'Entrando...';
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
      if (error) throw error;
    } catch (err) {
      mostrarToast(
        err.message === 'Invalid login credentials'
          ? 'E-mail ou senha incorretos'
          : err.message,
        'error'
      );
      btn.disabled = false; btn.textContent = txt;
    }
  });

  document.getElementById('form-signup')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = document.getElementById('signup-nome').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const senha = document.getElementById('signup-senha').value;
    const telefone = document.getElementById('signup-telefone').value.trim();
    const btn = document.getElementById('btn-signup-submit');
    const txt = btn.textContent;
    btn.disabled = true; btn.textContent = 'Criando conta...';
    try {
      const { data, error } = await supabase.auth.signUp({
        email, password: senha,
        options: { data: { nome_completo: nome, telefone } }
      });
      if (error) throw error;
      if (!data.session) {
        mostrarToast('Confirme seu e-mail antes de continuar', 'success');
        fechar('modal-auth');
        btn.disabled = false; btn.textContent = txt;
        return;
      }
    } catch (err) {
      let msg = err.message;
      if (msg.includes('already registered')) msg = 'E-mail já cadastrado';
      mostrarToast(msg, 'error');
      btn.disabled = false; btn.textContent = txt;
    }
  });

  // Evento global disparado pelo cadastro-moto quando precisa logar
  window.addEventListener('abrir-auth', () => {
    abrir('modal-auth');
    trocarAba('signup');
  });

  /* ---------- Fachada (compatibilidade) ---------- */
  await installFacade();

  console.log('[MotoJá] ✅ App pronto');
}

function trocarAba(aba) {
  const isLogin = aba === 'login';
  document.getElementById('tab-login')?.classList.toggle('on', isLogin);
  document.getElementById('tab-signup')?.classList.toggle('on', !isLogin);
  document.getElementById('form-login')?.classList.toggle('hidden', !isLogin);
  document.getElementById('form-signup')?.classList.toggle('hidden', isLogin);
}

function atualizarHeaderUser() {
  const btnConta   = document.getElementById('btn-conta');
  const userLogado = document.getElementById('user-logado');
  const userMiniAv = document.getElementById('user-mini-av');
  const userNome   = document.getElementById('user-nome');
  const btnSair    = document.getElementById('btn-sair-header');

  if (app.user) {
    const nome = app.profile?.nome_completo
      || app.user.user_metadata?.nome_completo
      || app.user.email.split('@')[0];
    const primeiro = nome.split(' ')[0];
    if (btnConta) btnConta.textContent = `👤 ${primeiro}`;
    if (userMiniAv) userMiniAv.textContent = initials(nome);
    if (userNome) userNome.textContent = primeiro;
    userLogado?.classList.remove('hidden');
    btnSair?.classList.remove('hidden');
  } else {
    if (btnConta) btnConta.textContent = '👤 Passageiro';
    userLogado?.classList.add('hidden');
    btnSair?.classList.add('hidden');
  }
}

async function fazerLogout() {
  await supabase.auth.signOut();
  mostrarToast('Sessão encerrada');
}

boot().catch(err => {
  console.error('[MotoJá] boot falhou:', err);
  document.body.innerHTML = `<pre style="padding:24px;color:#f88;font-family:monospace">Erro ao iniciar: ${escapeHtml(err.message)}</pre>`;
});