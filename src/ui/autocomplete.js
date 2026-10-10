import { buscarEndereco, montarViewbox } from '../services/geocoding.js';
import { debounce, escapeHtml } from '../lib/utils.js';

/**
 * Ligar autocomplete em um input.
 * @param {object} opts
 * @param {string}  opts.inputId          — id do <input>
 * @param {string}  opts.containerId      — id do container de resultados
 * @param {function} opts.onSelect        — chamado com { lat, lng, nome }
 * @param {function} [opts.getPickup]     — retorna pickup atual (pra viewbox)
 * @param {number}  [opts.delay=400]
 */
export function ligarAutocomplete({
  inputId,
  containerId,
  onSelect,
  getPickup = () => null,
  delay = 400
}) {
  const input = document.getElementById(inputId);
  const container = document.getElementById(containerId);
  if (!input || !container) return;

  let resAtuais = [];

  const buscar = debounce(async (q) => {
    if (q.length < 3) { container.innerHTML = ''; return; }
    container.innerHTML = '<div class="p-3 text-zinc-400 text-[13px]">Buscando…</div>';
    try {
      const pickup = getPickup();
      const viewbox = pickup ? montarViewbox(pickup) : null;
      resAtuais = await buscarEndereco(q, { limit: 8, viewbox });
      render(resAtuais);
    } catch (e) {
      if (e.name !== 'AbortError') {
        container.innerHTML = '<div class="p-3 text-zinc-400 text-[13px]">Erro ao buscar.</div>';
      }
    }
  }, delay);

  function render(lista) {
    if (!lista.length) {
      container.innerHTML = '<div class="p-3 text-zinc-400 text-[13px]">Nenhum resultado.</div>';
      return;
    }
    container.innerHTML = lista.map((it, i) => {
      const partes = it.display_name.split(',');
      return `<div class="sugestao flex gap-3 p-3 hover:bg-zinc-100 rounded-2xl cursor-pointer transition" data-i="${i}">
        <div class="w-9 h-9 rounded-full bg-zinc-100 flex items-center justify-center">📍</div>
        <div class="min-w-0 flex-1">
          <div class="font-bold text-[13px] truncate">${escapeHtml(partes[0])}</div>
          <div class="text-[11px] text-zinc-500 truncate">${escapeHtml(partes.slice(1, 3).join(','))}</div>
        </div>
      </div>`;
    }).join('');

    container.querySelectorAll('.sugestao').forEach(el => {
      el.addEventListener('click', () => {
        const it = resAtuais[+el.dataset.i];
        if (!it) return;
        const nome = it.display_name.split(',').slice(0, 2).join(',').trim();
        container.innerHTML = '';
        onSelect({ lat: +it.lat, lng: +it.lon, nome, raw: it });
      });
    });
  }

  input.addEventListener('input', () => buscar(input.value.trim()));

  return {
    limpar() { container.innerHTML = ''; resAtuais = []; }
  };
}