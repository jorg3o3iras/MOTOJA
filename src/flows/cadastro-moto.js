/**
 * Cadastro de motoqueiro em 5 etapas.
 */
import { $, maskCPF, maskCEP, maskPhone } from '../lib/utils.js';
import { salvarCadastroMotoqueiro, uploadDocumento } from '../services/motoqueiro.js';
import { mostrarToast } from '../ui/toast.js';
import { abrir as abrirModal, fechar as fecharModal } from '../ui/modals.js';
import { app } from '../stores/app.js';
import { atualizarUIMotoqueiro } from './motoqueiro.js';

let etapa = 1;
const checks = {};
const arquivos = { cnh: null, crlv: null, selfie: null };

function goStep(n) {
  etapa = n;
  const modal = $('modal-moto');
  if (!modal) return;
  modal.querySelectorAll('.form-step').forEach(s =>
    s.classList.toggle('hidden', +s.dataset.step !== n)
  );

  const titulos = [
    'Cadastro de Motoqueiro',
    'Dados da sua moto',
    'Envio de documentos',
    'Confirmações finais',
    'Cadastro enviado'
  ];
  $('titulo-moto').textContent = titulos[n - 1] || 'Cadastro';

  modal.querySelectorAll('.bar').forEach((b, i) => {
    b.className = 'bar flex-1 rounded-full ' + (i < Math.min(n, 4) ? 'bg-[#FF6A00]' : 'bg-zinc-200');
  });

  const bv = $('btn-moto-voltar');
  const bp = $('btn-moto-proximo');
  if (bv) bv.style.visibility = (n === 1 || n === 5) ? 'hidden' : 'visible';
  if (bp) bp.textContent = n === 4 ? 'Enviar cadastro' : n === 5 ? 'Fechar' : 'Continuar →';
  modal.scrollTop = 0;
}

function resetChecks() {
  Object.keys(checks).forEach(k => delete checks[k]);
  Object.keys(arquivos).forEach(k => arquivos[k] = null);
  const modal = $('modal-moto');
  if (!modal) return;
  modal.querySelectorAll('.check-item').forEach(c => {
    c.classList.remove('!border-black');
    const b = c.querySelector('.box');
    if (b) {
      b.classList.remove('!bg-black', '!text-white');
      b.innerHTML = '';
    }
  });
  modal.querySelectorAll('.upload').forEach(u =>
    u.classList.remove('!border-emerald-500', '!bg-emerald-50')
  );
  modal.querySelectorAll('[data-status]').forEach(el => {
    el.textContent = 'Não enviado';
    el.className = 'text-[11px] text-zinc-500 mt-1';
  });
  modal.querySelectorAll('input[type="file"]').forEach(i => i.value = '');
}

function abrir() {
  if (!app.user) {
    mostrarToast('Crie uma conta para continuar como motoqueiro', 'info');
    window.dispatchEvent(new CustomEvent('abrir-auth', { detail: { intencao: 'motoqueiro' } }));
    return;
  }
  resetChecks();
  abrirModal('modal-moto');
  goStep(1);
}

async function enviarCadastro() {
  if (!checks.auth || !checks.capacete) {
    mostrarToast('Aceite as declarações', 'error');
    return;
  }
  const btn = $('btn-moto-proximo');
  const txt = btn.textContent;
  btn.disabled = true; btn.textContent = 'Enviando...';

  try {
    const dados = {
      marca:  $('moto-marca').value,
      modelo: $('moto-modelo').value.trim(),
      ano:    $('moto-ano').value,
      cor:    $('moto-cor').value.trim(),
      placa:  $('moto-placa').value.toUpperCase().trim(),
      cc:     $('moto-cc').value
    };
    const motoqueiro = await salvarCadastroMotoqueiro(app.user.id, dados);
    for (const tipo of ['cnh', 'crlv', 'selfie']) {
      if (arquivos[tipo]) {
        try {
          await uploadDocumento(app.user.id, motoqueiro.id, tipo, arquivos[tipo]);
        } catch (e) { console.warn('Erro upload', tipo, e); }
      }
    }
    app.motoqueiroCadastro = motoqueiro;
    atualizarUIMotoqueiro();
    $('protocolo-moto').textContent = 'MJ-' + String(Math.floor(100000 + Math.random() * 900000));
    mostrarToast('Cadastro enviado!', 'success');
    goStep(5);
  } catch (e) {
    console.error(e);
    mostrarToast('Erro ao salvar: ' + e.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = txt;
  }
}

export function initCadastroMoto() {
  const modal = $('modal-moto');
  if (!modal) return;

  modal.querySelectorAll('.check-item').forEach(c => {
    c.addEventListener('click', () => {
      const key = c.dataset.check;
      const on = !checks[key];
      checks[key] = on;
      c.classList.toggle('!border-black', on);
      const b = c.querySelector('.box');
      if (b) {
        b.classList.toggle('!bg-black', on);
        b.classList.toggle('!text-white', on);
        b.innerHTML = on ? '✓' : '';
      }
    });
  });

  modal.querySelectorAll('input[type="file"]').forEach(input => {
    input.addEventListener('change', (e) => {
      const tipo = input.dataset.file;
      const file = e.target.files[0];
      if (!file) return;
      arquivos[tipo] = file;
      const statusEl = modal.querySelector(`[data-status="${tipo}"]`);
      if (statusEl) {
        statusEl.textContent = '✓ ' + file.name.slice(0, 25);
        statusEl.className = 'text-[11px] text-emerald-600 mt-1 font-bold';
      }
      const wrap = input.closest('.upload');
      if (wrap) wrap.classList.add('!border-emerald-500', '!bg-emerald-50');
    });
  });

  $('moto-cpf')?.addEventListener('input', e => { e.target.value = maskCPF(e.target.value); });
  $('moto-cep')?.addEventListener('input', e => { e.target.value = maskCEP(e.target.value); });
  $('moto-whats')?.addEventListener('input', e => { e.target.value = maskPhone(e.target.value); });
  $('moto-placa')?.addEventListener('input', e => {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
  });

  $('btn-abrir-cadastro-moto')?.addEventListener('click', abrir);
  $('btn-fechar-moto')?.addEventListener('click', () => fecharModal('modal-moto'));
  $('btn-moto-voltar')?.addEventListener('click', () => { if (etapa > 1) goStep(etapa - 1); });
  $('btn-moto-proximo')?.addEventListener('click', async () => {
    if (etapa === 5) { fecharModal('modal-moto'); return; }
    if (etapa === 4) { await enviarCadastro(); return; }
    if (etapa === 2 && (!$('moto-marca').value || !$('moto-modelo').value.trim())) {
      mostrarToast('Preencha marca e modelo', 'error');
      return;
    }
    goStep(etapa + 1);
  });
}