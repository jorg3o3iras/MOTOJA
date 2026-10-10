import { RAIOS } from '../lib/config.js';

let ctrl = null;

export async function buscarEndereco(query, { limit = 8, viewbox = null } = {}) {
  ctrl?.abort();
  ctrl = new AbortController();

  const params = new URLSearchParams({
    format: 'json',
    q: query,
    limit: String(limit),
    countrycodes: 'br',
    addressdetails: '1'
  });
  if (viewbox) {
    params.set('viewbox', viewbox);
    params.set('bounded', '1');
  }

  const url = `https://nominatim.openstreetmap.org/search?${params}`;
  const r = await fetch(url, {
    signal: ctrl.signal,
    headers: { 'Accept-Language': 'pt-BR' }
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

export async function geocodificarReverso(lat, lng) {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
      { headers: { 'Accept-Language': 'pt-BR' } }
    );
    if (!r.ok) throw new Error('HTTP');
    const j = await r.json();
    if (j?.display_name) return j.display_name.split(',').slice(0, 2).join(',').trim();
  } catch {}
  return 'Local selecionado';
}

export function montarViewbox(pickup, raio = RAIOS.viewboxGraus) {
  if (!pickup) return '';
  const left = pickup.lng - raio, right = pickup.lng + raio;
  const top = pickup.lat + raio, bottom = pickup.lat - raio;
  return `${left},${top},${right},${bottom}`;
}

export function abort() { ctrl?.abort(); ctrl = null; }