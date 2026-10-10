/**
 * Painel admin — protegido por senha via RPC.
 */
import { $, $$, escapeHtml } from '../lib/utils.js';
import { validarSenhaAdmin, souAdmin, carregarPendentes, carregarMotoqueiros, carregarCorridas, carregarStats } from '../services/admin.js';
import { carregarDocumentosMotoqueiro, mudarStatusMotoqueiro, suspenderMotoqueiro, reativarMotoqueiro, excluirMotoqueiro } from '../services/motoqueiro.js';
import { carregarConfigPrecosAdmin, initPainelPrecos } from '../services/precos.js';
import { supabase } from '../lib/supabase.js';
import { mostrarToast } from '../ui/toast.js';
import { abrir as abrirModal, fechar as fecharModal } from '../ui/modals.js';
import { app } from '../stores/app.js';

let modoAdmin = false;

/* ---------- Abrir / fechar ---------- */
export function abrirSenhaAdmin() {
  $('admin-senha-input').value = '';
  $('admin-senha-erro').classList.add('hidden');
  abrirModal('modal-admin-senha');
  setTimeout(() => $('admin-senha-input').focus(), 150);
}

export function fecharSenhaAdmin() { fecharModal('modal-admin-senha'); }
export function fecharAdmin() { fecharModal('modal-admin'); }

async function tentarEntrar() {
  const v = $('admin-senha-input').value;
  if (!v) return;

  const btn = $('btn-admin-senha-entrar');
  const txt = btn.textContent;
  btn.disabled = true; btn.textContent = 'Verificando...';

  try {
    const ok = await validarSenhaAdmin(v);
    if (!ok) {
      $('admin-senha-erro').classList.remove('hidden');
      $('admin-senha-input').value = '';
      $('admin-senha-input').focus();
      setTimeout(() => $('admin-senha-erro').classList.add('hidden'), 2500);
      return;
    }

    fecharSenhaAdmin();

    if (!app.user) {
      mostrarToast('Faça login como administrador', 'error');
      window.dispatchEvent(new CustomEvent('abrir-auth'));
      return;
    }

    const eh = await souAdmin();
    if (!eh) {
      mostrarToast('Sua conta não tem permissão de admin', 'error');
      return;
    }

    modoAdmin = true;
    abrirModal('modal-admin');
    trocarAba('pendentes');
  } catch (e) {
    mostrarToast('Erro: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = txt;
  }
}

/* ---------- Abas ---------- */
function trocarAba(aba) {
  $$('.admin-tab').forEach(b => b.classList.toggle('on', b.dataset.aba === aba));
  $$('.admin-painel').forEach(p => p.classList.toggle('hidden', p.dataset.painel !== aba));
  if (aba === 'pendentes')    carregarPendentesUI();
  if (aba === 'motoqueiros')  carregarMotoqueirosUI();
  if (aba === 'corridas')     carregarCorridasUI();
  if (aba === 'stats')        carregarStatsUI();
  if (aba === 'precos')       carregarConfigPrecosAdmin();
}

/* ---------- Render documentos (reutilizado) ---------- */
async function renderDocs(btn) {
  const motId = btn.dataset.motId;
  const container = document.querySelector(`[data-docs-for="${motId}"]`);
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
    const label = { cnh: '🪪 CNH', crlv: '📋 CRLV', selfie: '🤳 Selfie' }[d.tipo] || escapeHtml(d.tipo);
    const isImg = /\.(jpg|jpeg|png|webp|gif)$/i.test(d.url_storage);
    const url = d.url_assinada || '#';
    return `
      <div class="border border-zinc-200 rounded-xl overflow-hidden">
        <div class="flex items-center justify-between px-3 py-2 bg-zinc-50">
          <span class="text-[12px] font-bold">${label}</span>
          <span class="text-[10px] text-emerald-600 font-bold uppercase">${escapeHtml(d.status)}</span>
        </div>
        ${isImg && d.url_assinada
          ? `<img src="${escapeHtml(url)}" class="w-full max-h-[240px] object-contain bg-zinc-100 cursor-pointer" data-open="${escapeHtml(url)}">`
          : ''}
        <a href="${escapeHtml(url)}" target="_blank" rel="noopener"
           class="block text-center text-[12px] font-bold py-2 bg-white hover:bg-zinc-100 text-black border-t border-zinc-200">
          🔗 Abrir arquivo
        </a>
      </div>`;
  }).join('');

  container.querySelectorAll('[data-open]').forEach(el => {
    el.addEventListener('click', () => window.open(el.dataset.open, '_blank'));
  });
}

/* ---------- Pendentes ---------- */
async function carregarPendentesUI() {
  const el = $('admin-lista-pendentes');
  el.innerHTML = '<div class="text-center py-12 text-zinc-400 text-[14px]">Carregando...</div>';

  try {
    const data = await carregarPendentes();
    const badge = $('badge-pendentes');
    if (badge) badge.textContent = data.length;

    if (!data.length) {
      el.innerHTML = '<div class="text-center py-12 text-zinc-400 text-[14px]">🎉 Nenhum motoqueiro pendente</div>';
      return;
    }

    el.innerHTML = data.map(m => {
      const nome = m.profiles?.nome_completo || 'Sem nome';
      const tel = m.profiles?.telefone || '';
      return `
        <div class="admin-card">
          <div class="flex items-start justify-between gap-3 mb-3">
            <div class="flex-1 min-w-0">
              <div class="sora font-bold text-[16px] truncate">${escapeHtml(nome)}</div>
              <div class="text-[12px] text-zinc-500 mt-0.5">${escapeHtml(tel)}</div>
              <div class="text-[12px] text-zinc-500 mt-1">🏍️ ${escapeHtml(m.moto_marca || '')} ${escapeHtml(m.moto_modelo || '')} · ${escapeHtml(m.moto_placa || '')}</div>
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

    el.querySelectorAll('[data-aprovar]').forEach(b =>
      b.addEventListener('click', () => aprovar(b.dataset.aprovar, 'aprovado')));
    el.querySelectorAll('[data-reprovar]').forEach(b =>
      b.addEventListener('click', () => aprovar(b.dataset.reprovar, 'reprovado')));
    el.querySelectorAll('.ver-docs-btn').forEach(b =>
      b.addEventListener('click', () => renderDocs(b)));
  } catch (e) {
    el.innerHTML = `<div class="text-center py-12 text-red-500 text-[13px]">Erro: ${escapeHtml(e.message)}</div>`;
  }
}

async function aprovar(id, status) {
  try {
    await mudarStatusMotoqueiro(id, status);
    mostrarToast('Motoqueiro ' + (status === 'aprovado' ? 'aprovado ✅' : 'reprovado'), 'success');
    carregarPendentesUI();
    carregarStatsUI();
  } catch (e) {
    mostrarToast('Erro: ' + e.message, 'error');
  }
}

/* ---------- Motoqueiros ---------- */
async function carregarMotoqueirosUI(filtro) {
  const el = $('admin-lista-motoqueiros');
  el.innerHTML = '<div class="text-center py-12 text-zinc-400 text-[14px]">Carregando...</div>';

  try {
    const data = await carregarMotoqueiros(filtro);
    if (!data.length) {
      el.innerHTML = '<div class="text-center py-12 text-zinc-400 text-[14px]">Nenhum motoqueiro encontrado</div>';
      return;
    }

    const cores = { aprovado: '#059669', pendente: '#f59e0b', reprovado: '#dc2626', suspenso: '#71717a' };

    el.innerHTML = data.map(m => {
      const nome = m.profiles?.nome_completo || 'Sem nome';
      const tel = m.profiles?.telefone || '—';
      const cor = cores[m.status] || '#71717a';

      let botoes = '';
      if (m.status === 'pendente') {
        botoes = `<button class="admin-btn aprovar flex-1" data-aprovar="${m.id}">✓ Aprovar</button>
                  <button class="admin-btn reprovar flex-1" data-reprovar="${m.id}">✕ Reprovar</button>`;
      } else if (m.status === 'aprovado') {
        botoes = `<button class="admin-btn suspender flex-1" data-suspender="${m.id}">⏸ Suspender</button>
                  <button class="admin-btn reprovar flex-1" data-excluir="${m.id}">🗑 Excluir</button>`;
      } else if (m.status === 'suspenso') {
        botoes = `<button class="admin-btn aprovar flex-1" data-reativar="${m.id}">▶ Reativar</button>
                  <button class="admin-btn reprovar flex-1" data-excluir="${m.id}">🗑 Excluir</button>`;
      } else if (m.status === 'reprovado') {
        botoes = `<button class="admin-btn aprovar flex-1" data-aprovar="${m.id}">✓ Aprovar</button>
                  <button class="admin-btn reprovar flex-1" data-excluir="${m.id}">🗑 Excluir</button>`;
      }

      return `
        <div class="admin-card">
          <div class="flex items-start justify-between gap-3 mb-2">
            <div class="flex-1 min-w-0">
              <div class="sora font-bold text-[15px] truncate">${escapeHtml(nome)}</div>
              <div class="text-[12px] text-zinc-500 mt-0.5">${escapeHtml(m.moto_marca || '')} ${escapeHtml(m.moto_modelo || '')} · ${escapeHtml(m.moto_placa || '')}</div>
            </div>
            <div class="text-[10px] font-bold px-2 py-1 rounded-full" style="background:${cor}20;color:${cor}">
              ${escapeHtml(m.status).toUpperCase()}
            </div>
          </div>
          <div class="text-[11px] text-zinc-500 mb-2">📞 ${escapeHtml(tel)} · 🏁 ${m.total_corridas || 0} corridas · ${m.disponivel ? '🟢 Online' : '⚫ Offline'}</div>
          <button type="button" class="ver-docs-btn w-full bg-zinc-100 hover:bg-zinc-200 rounded-xl py-2.5 text-[12px] font-bold mb-2 transition" data-mot-id="${m.id}">
            📎 Ver documentos
          </button>
          <div class="docs-container hidden mb-3 space-y-2" data-docs-for="${m.id}"></div>
          <div class="flex gap-2">${botoes}</div>
        </div>`;
    }).join('');

    el.querySelectorAll('[data-aprovar]').forEach(b => b.addEventListener('click', () => aprovar(b.dataset.aprovar, 'aprovado')));
    el.querySelectorAll('[data-reprovar]').forEach(b => b.addEventListener('click', () => aprovar(b.dataset.reprovar, 'reprovado')));
    el.querySelectorAll('[data-suspender]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Suspender este motoqueiro?')) return;
      try {
        await suspenderMotoqueiro(b.dataset.suspender);
        mostrarToast('⏸ Suspenso', 'success');
        carregarMotoqueirosUI(filtro);
      } catch (e) { mostrarToast(e.message, 'error'); }
    }));
    el.querySelectorAll('[data-reativar]').forEach(b => b.addEventListener('click', async () => {
      try {
        await reativarMotoqueiro(b.dataset.reativar);
        mostrarToast('▶ Reativado', 'success');
        carregarMotoqueirosUI(filtro);
      } catch (e) { mostrarToast(e.message, 'error'); }
    }));
    el.querySelectorAll('[data-excluir]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('⚠️ Excluir PERMANENTEMENTE este motoqueiro?\n\nEle perderá cadastro, documentos e histórico.')) return;
      if (!confirm('Tem certeza absoluta?')) return;
      try {
        const data = await excluirMotoqueiro(b.dataset.excluir);
        const profileId = data?.profile_id;
        if (profileId) {
          try {
            const { data: arquivos } = await supabase.storage.from('documentos').list(`${profileId}/${b.dataset.excluir}`);
            if (arquivos?.length) {
              const paths = arquivos.map(f => `${profileId}/${b.dataset.excluir}/${f.name}`);
              await supabase.storage.from('documentos').remove(paths);
            }
          } catch (e) { console.warn('storage cleanup:', e); }
        }
        mostrarToast('🗑 Excluído', 'success');
        carregarMotoqueirosUI(filtro);
      } catch (e) { mostrarToast(e.message, 'error'); }
    }));
    el.querySelectorAll('.ver-docs-btn').forEach(b => b.addEventListener('click', () => renderDocs(b)));
  } catch (e) {
    el.innerHTML = `<div class="text-center py-12 text-red-500 text-[13px]">Erro: ${escapeHtml(e.message)}</div>`;
  }
}

/* ---------- Corridas ---------- */
async function carregarCorridasUI() {
  const el = $('admin-lista-corridas');
  el.innerHTML = '<div class="text-center py-12 text-zinc-400 text-[14px]">Carregando...</div>';

  try {
    const data = await carregarCorridas();
    if (!data.length) {
      el.innerHTML = '<div class="text-center py-12 text-zinc-400 text-[14px]">Nenhuma corrida registrada</div>';
      return;
    }

    const cores = {
      buscando: '#f59e0b', oferecida: '#f59e0b', aceita: '#059669',
      chegou: '#059669', em_andamento: '#059669', finalizada: '#0A0A0A',
      cancelada: '#dc2626', sem_motoqueiro: '#71717a'
    };

    el.innerHTML = data.map(c => {
      const dataFmt = new Date(c.criado_em).toLocaleDateString('pt-BR');
      const nomePass = c.passageiro?.nome_completo || 'Passageiro';
      const telPass = c.passageiro?.telefone || '';
      const nomeMot = c.motoqueiro?.profiles?.nome_completo || 'Sem motoqueiro';
      const telMot = c.motoqueiro?.profiles?.telefone || '';
      const moto = c.motoqueiro ? `${c.motoqueiro.moto_marca || ''} ${c.motoqueiro.moto_modelo || ''}`.trim() +
        (c.motoqueiro.moto_placa ? ' · ' + c.motoqueiro.moto_placa : '') : '';
      const cor = cores[c.status] || '#71717a';

      return `
        <div class="admin-card">
          <div class="flex items-start justify-between gap-3 mb-3">
            <div class="flex-1 min-w-0">
              <div class="font-bold text-[13px] truncate">${escapeHtml(c.origem_nome || '—')}</div>
              <div class="text-[11px] text-zinc-500 truncate">→ ${escapeHtml(c.destino_nome || '—')}</div>
            </div>
            <div class="text-right flex-shrink-0">
              <div class="sora font-bold text-[15px]">R$ ${(c.preco_total || 0).toFixed(2).replace('.', ',')}</div>
              <div class="text-[10px] text-zinc-400">${dataFmt}</div>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-zinc-100">
            <div class="min-w-0">
              <div class="text-[9px] font-bold tracking-widest uppercase text-zinc-400">Passageiro</div>
              <div class="text-[12px] font-semibold truncate mt-0.5">👤 ${escapeHtml(nomePass)}</div>
              ${telPass ? `<div class="text-[10px] text-zinc-500 truncate">${escapeHtml(telPass)}</div>` : ''}
            </div>
            <div class="min-w-0">
              <div class="text-[9px] font-bold tracking-widest uppercase text-zinc-400">Motoqueiro</div>
              <div class="text-[12px] font-semibold truncate mt-0.5">🏍️ ${escapeHtml(nomeMot)}</div>
              ${telMot ? `<div class="text-[10px] text-zinc-500 truncate">${escapeHtml(telMot)}</div>` : ''}
              ${moto ? `<div class="text-[10px] text-zinc-400 truncate">${escapeHtml(moto)}</div>` : ''}
            </div>
          </div>
          <div class="flex items-center justify-between mt-3 pt-2 border-t border-zinc-100">
            <div class="text-[10px] text-zinc-500">📏 ${(c.distancia_km || 0).toFixed(1)} km</div>
            <div class="text-[10px] font-bold px-2 py-0.5 rounded-full" style="background:${cor}20;color:${cor}">
              ${escapeHtml(c.status).toUpperCase()}
            </div>
          </div>
        </div>`;
    }).join('');
  } catch (e) {
    el.innerHTML = `<div class="text-center py-12 text-red-500 text-[13px]">Erro: ${escapeHtml(e.message)}</div>`;
  }
}

/* ---------- Stats ---------- */
async function carregarStatsUI() {
  const el = $('admin-stats');
  el.innerHTML = '<div class="text-center py-12 text-zinc-400 text-[14px] col-span-2">Carregando...</div>';
  try {
    const s = await carregarStats();
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
    ].map(x => `<div class="admin-stat"><div class="valor">${x.v}</div><div class="rotulo">${x.r}</div></div>`).join('');
  } catch (e) {
    el.innerHTML = `<div class="text-center py-12 text-red-500 text-[13px] col-span-2">Erro: ${escapeHtml(e.message)}</div>`;
  }
}

/* ---------- Init ---------- */
export function initAdmin() {
  $('btn-admin')?.addEventListener('click', abrirSenhaAdmin);
  $('btn-admin-senha-cancelar')?.addEventListener('click', fecharSenhaAdmin);
  $('btn-admin-senha-entrar')?.addEventListener('click', tentarEntrar);
  $('admin-senha-input')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') tentarEntrar(); });
  $('btn-fechar-admin')?.addEventListener('click', fecharAdmin);

  $$('.admin-tab').forEach(btn => {
    btn.addEventListener('click', () => trocarAba(btn.dataset.aba));
  });

  $$('.admin-filtro').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.admin-filtro').forEach(b => b.classList.remove('on'));
      btn.classList.add('on');
      carregarMotoqueirosUI(btn.dataset.filtro);
    });
  });

  initPainelPrecos();
}