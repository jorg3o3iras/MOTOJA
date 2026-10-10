import { $ } from '../lib/utils.js';

const registry = new Map();

/** Registra um modal existente no HTML */
export function registrar(id) {
  const el = $(id);
  if (!el) return null;
  registry.set(id, el);

  // Fecha ao clicar no backdrop (fora do card)
  el.addEventListener('click', (e) => { if (e.target === el) fechar(id); });

  return el;
}

export function abrir(id) {
  const el = registry.get(id) || $(id);
  if (!el) return;
  el.classList.remove('hidden');
  el.classList.add('flex');
  if (!registry.has(id)) registry.set(id, el);
}

export function fechar(id) {
  const el = registry.get(id) || $(id);
  if (!el) return;
  el.classList.add('hidden');
  el.classList.remove('flex');
}

export function estaAberto(id) {
  const el = registry.get(id) || $(id);
  return el && !el.classList.contains('hidden');
}

export function initEsc() {
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    // prioridade: fecha o último aberto da lista
    const ordem = ['modal-admin-senha','modal-admin','modal-fav','modal-auth','modal-moto','modal-oferta','modal-pagamento','modal-avaliacao','modal-camadas'];
    for (const id of ordem) {
      if (estaAberto(id)) { fechar(id); return; }
    }
  });
}