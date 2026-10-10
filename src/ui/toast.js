import { $ } from '../lib/utils.js';

let toastTimer = null;

export function mostrarToast(msg, tipo = 'info') {
  const t = $('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'toast on' + (tipo === 'error' ? ' error' : tipo === 'success' ? ' success' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 2600);
}

export function mostrarBanner(txt, tipo = 'info', acao = null, cb = null) {
  const b = $('loc-banner');
  if (!b) return;
  b.classList.remove('hidden');
  $('loc-texto').textContent = txt;
  const spinner = $('loc-spinner');
  spinner.style.display = tipo === 'info' ? '' : 'none';
  const btn = $('loc-acao');
  if (acao) { btn.textContent = acao; btn.classList.remove('hidden'); btn.onclick = cb; }
  else { btn.classList.add('hidden'); btn.onclick = null; }
}

export function esconderBanner() {
  const b = $('loc-banner');
  if (b) b.classList.add('hidden');
}