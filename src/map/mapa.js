import { definirMapa, aplicarCamada, camadaSalva, initModalCamadas } from './camadas.js';
import { iconeOrigem, iconeDestino, iconeEu } from './markers.js';

let mapa = null;
let markerOrigem = null;
let markerDestino = null;
let marcadorEu = null;
let linhaRota = null;
let linhaRotaGlow = null;

export const isDesktop = () => window.innerWidth >= 768;

export function mapPad() {
  return isDesktop()
    ? { paddingTopLeft: [460, 80], paddingBottomRight: [60, 60] }
    : { paddingTopLeft: [40, 80], paddingBottomRight: [40, 380] };
}

export function initMapa() {
  if (mapa) return mapa;

  mapa = L.map('map', {
    zoomControl: false,
    attributionControl: true
  }).setView([-15.7939, -47.8828], 4);

  definirMapa(mapa);
  aplicarCamada(camadaSalva());
  initModalCamadas();

  window.addEventListener('resize', () => {
    if (mapa) mapa.invalidateSize();
  });

  return mapa;
}

export function getMapa() { return mapa; }

/* ---------- Marcadores ---------- */

export function marcarOrigem(lat, lng, real = false) {
  if (!mapa) return;
  if (markerOrigem) mapa.removeLayer(markerOrigem);
  markerOrigem = L.marker([lat, lng], { icon: iconeOrigem() }).addTo(mapa);

  if (real) {
    if (marcadorEu) mapa.removeLayer(marcadorEu);
    marcadorEu = L.marker([lat, lng], { icon: iconeEu(), zIndexOffset: 500 }).addTo(mapa);
  }
}

export function marcarDestino(lat, lng) {
  if (!mapa) return;
  if (markerDestino) mapa.removeLayer(markerDestino);
  markerDestino = L.marker([lat, lng], { icon: iconeDestino() }).addTo(mapa);
}

export function getMarkerOrigem() { return markerOrigem; }
export function getMarkerDestino() { return markerDestino; }

/* ---------- Linha de rota ---------- */

export function desenharRota(coords, aproximada = false) {
  if (!mapa) return;
  limparLinhaRota();

  linhaRota = L.polyline(coords, {
    color: '#0A0A0A', weight: 5, opacity: 0.9,
    lineJoin: 'round', dashArray: aproximada ? '8,12' : null
  }).addTo(mapa);

  linhaRotaGlow = L.polyline(coords, {
    color: '#FF6A00', weight: 2, opacity: 0.55
  }).addTo(mapa);

  try {
    mapa.fitBounds(linhaRota.getBounds(), mapPad());
  } catch {}
}

export function limparLinhaRota() {
  if (!mapa) return;
  if (linhaRota) { mapa.removeLayer(linhaRota); linhaRota = null; }
  if (linhaRotaGlow) { mapa.removeLayer(linhaRotaGlow); linhaRotaGlow = null; }
}

export function limparRotaVisual() {
  if (!mapa) return;
  if (markerDestino) { mapa.removeLayer(markerDestino); markerDestino = null; }
  limparLinhaRota();
}

export function centralizarEm(lat, lng, zoom = 15) {
  if (!mapa) return;
  mapa.setView([lat, lng], zoom);
}

export function voarPara(lat, lng, zoom = 15) {
  if (!mapa) return;
  mapa.flyTo([lat, lng], zoom, { duration: 1.2 });
}