import { $, safeLocalGet, safeLocalSet } from '../lib/utils.js';
import { STORAGE } from '../lib/config.js';
import { mostrarToast } from './toast.js';

export function aplicarTema(tema) {
  const btn = $('btn-tema');
  if (tema === 'escuro') {
    document.body.classList.add('modo-escuro');
    if (btn) btn.textContent = '☀️';
  } else {
    document.body.classList.remove('modo-escuro');
    if (btn) btn.textContent = '🌙';
  }
}

export function alternarTema() {
  const atual = safeLocalGet(STORAGE.TEMA, 'claro');
  const novo = atual === 'claro' ? 'escuro' : 'claro';
  safeLocalSet(STORAGE.TEMA, novo);
  aplicarTema(novo);
  mostrarToast(novo === 'escuro' ? '🌙 Modo noturno ativado' : '☀️ Modo claro ativado');
}

export function initTema() {
  aplicarTema(safeLocalGet(STORAGE.TEMA, 'claro'));
  const btn = $('btn-tema');
  if (btn) btn.addEventListener('click', alternarTema);
}