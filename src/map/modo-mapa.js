import { $ } from '../lib/utils.js';
import { getMapa } from './mapa.js';
import { geocodificarReverso } from '../services/geocoding.js';
import { mostrarToast } from '../ui/toast.js';
import { getPickup } from '../stores/app.js';

let ativo = false;
let endereco = null;
let timeout = null;
let centroAnterior = null;
let zoomAnterior = null;
let onConfirmar = null;

export function initModoMapa(callback) {
  onConfirmar = callback;

  const overlay     = $('modo-mapa-overlay');
  const btnCancelar = $('btn-modo-mapa-cancelar');
  const btnConfirma = $('btn-modo-mapa-confirmar');
  const btnAbrir    = $('btn-escolher-mapa');

  if (!overlay) return;

  btnAbrir?.addEventListener('click', ativar);
  btnCancelar?.addEventListener('click', () => desativar(true));
  btnConfirma?.addEventListener('click', () => {
    if (!endereco) return;
    const e = endereco;
    desativar(false);
    onConfirmar?.(e.lat, e.lng, e.nome);
  });

  getMapa().on('moveend', () => {
    if (!ativo) return;
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(atualizarEndereco, 400);
  });
}

export function ativar() {
  const mapa = getMapa();
  if (!mapa) return;

  const pickup = getPickup();
  if (!pickup) {
    mostrarToast('Aguarde o GPS localizar você', 'error');
    return;
  }

  ativo = true;
  endereco = null;
  centroAnterior = mapa.getCenter();
  zoomAnterior = mapa.getZoom();

  $('modo-mapa-overlay').classList.remove('hidden');
  mapa.flyTo([pickup.lat, pickup.lng], 17, { duration: 1 });
  $('modo-mapa-endereco').textContent = 'Arraste o mapa até o local exato';
  $('btn-modo-mapa-confirmar').disabled = true;

  setTimeout(atualizarEndereco, 800);
  mostrarToast('Arraste o mapa até o destino', 'info');
}

export function desativar(voltarMapa = true) {
  const mapa = getMapa();
  ativo = false;
  $('modo-mapa-overlay').classList.add('hidden');
  endereco = null;
  $('btn-modo-mapa-confirmar').disabled = true;
  if (timeout) { clearTimeout(timeout); timeout = null; }

  if (voltarMapa && centroAnterior && zoomAnterior && mapa) {
    mapa.flyTo([centroAnterior.lat, centroAnterior.lng], zoomAnterior, { duration: 1 });
  }
}

export function estaAtivo() { return ativo; }

async function atualizarEndereco() {
  const mapa = getMapa();
  if (!mapa || !ativo) return;
  const centro = mapa.getCenter();
  $('modo-mapa-endereco').textContent = 'Buscando endereço…';
  $('btn-modo-mapa-confirmar').disabled = true;

  try {
    const nome = await geocodificarReverso(centro.lat, centro.lng);
    if (!ativo) return;
    endereco = { lat: centro.lat, lng: centro.lng, nome };
    $('modo-mapa-endereco').textContent = nome;
    $('btn-modo-mapa-confirmar').disabled = false;
  } catch {
    if (!ativo) return;
    endereco = { lat: centro.lat, lng: centro.lng, nome: 'Local selecionado' };
    $('modo-mapa-endereco').textContent = 'Local selecionado';
    $('btn-modo-mapa-confirmar').disabled = false;
  }
}