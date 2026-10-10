import { STORAGE } from '../lib/config.js';
import { safeLocalGet, safeLocalSet, $ } from '../lib/utils.js';

const ATTR_CART = '&copy; <a href="https://carto.com/attributions">CARTO</a>';
const ATTR_ESRI = 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics';

let mapa = null;
let camadaAtual = null;
let camadas = null;

export function definirMapa(instancia) {
  mapa = instancia;
}

function construirCamadas() {
  return {
    mapa: {
      nome: 'Mapa',
      layer: L.maplibreGL({ style: 'https://tiles.openfreemap.org/styles/liberty' })
    },
    satelite: {
      nome: 'Satélite',
      layer: L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { maxZoom: 19, attribution: ATTR_ESRI, className: 'satelite' }
      )
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
      ])
    },
    escuro: {
      nome: 'Escuro',
      layer: L.maplibreGL({ style: 'https://tiles.openfreemap.org/styles/dark' })
    }
  };
}

export function aplicarCamada(nome) {
  if (!mapa) return;
  if (!camadas) camadas = construirCamadas();
  if (!camadas[nome]) nome = 'mapa';

  if (camadaAtual && camadas[camadaAtual]) {
    mapa.removeLayer(camadas[camadaAtual].layer);
  }

  camadas[nome].layer.addTo(mapa);
  camadaAtual = nome;

  document.querySelectorAll('.camada-op').forEach(b =>
    b.classList.toggle('on', b.dataset.camada === nome)
  );

  const icones = { mapa: '🗺️', satelite: '🛰️', hibrido: '🌐', escuro: '🌙' };
  const btn = $('btn-camadas');
  if (btn) btn.textContent = icones[nome] || '🗺️';

  safeLocalSet(STORAGE.CAMADA, nome);
}

export function camadaSalva() {
  return safeLocalGet(STORAGE.CAMADA, 'mapa');
}

export function initModalCamadas() {
  const modal = $('modal-camadas');
  if (!modal) return;

  $('btn-camadas')?.addEventListener('click', () => {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  });

  $('btn-fechar-camadas')?.addEventListener('click', () => {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  });

  document.querySelectorAll('.camada-op').forEach(btn => {
    btn.addEventListener('click', () => {
      aplicarCamada(btn.dataset.camada);
      setTimeout(() => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
      }, 200);
    });
  });
}