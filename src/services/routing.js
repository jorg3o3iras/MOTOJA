import { haversine } from '../lib/utils.js';

export async function calcularRota(a, b) {
  try {
    const r = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`,
      { signal: AbortSignal.timeout(8000) }
    );
    const j = await r.json();
    if (j.code !== 'Ok' || !j.routes?.[0]) throw new Error('OSRM');
    return {
      coords: j.routes[0].geometry.coordinates.map(c => [c[1], c[0]]),
      distancia: j.routes[0].distance / 1000,
      duracao: j.routes[0].duration / 60,
      aproximada: false
    };
  } catch {
    const d = haversine(a, b) * 1.25;
    return {
      coords: [[a.lat, a.lng], [b.lat, b.lng]],
      distancia: d,
      duracao: (d / 28) * 60,
      aproximada: true
    };
  }
}