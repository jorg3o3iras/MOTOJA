export function iconeOrigem() {
  return L.divIcon({
    className: '', iconSize: [20, 20], iconAnchor: [10, 10],
    html: '<div class="mk-origem"></div>'
  });
}

export function iconeDestino() {
  return L.divIcon({
    className: '', iconSize: [18, 18], iconAnchor: [9, 9],
    html: '<div class="mk-dest"></div>'
  });
}

export function iconeEu() {
  return L.divIcon({
    className: '', iconSize: [24, 24], iconAnchor: [12, 12],
    html: '<div class="mk-eu"></div>'
  });
}

export function iconeMoto(dir = 0, eta = '') {
  return L.divIcon({
    className: '', iconSize: [48, 58], iconAnchor: [24, 30],
    html: `
      <div class="moto-pin relative" style="transform:rotate(${dir}deg)">
        <div class="halo absolute inset-0"></div>
        <div class="core relative z-10">🏍</div>
      </div>
      <div style="position:absolute;top:46px;left:50%;transform:translateX(-50%);
                  background:#0A0A0A;color:#fff;font-size:10px;font-weight:800;
                  padding:3px 8px;border-radius:999px;white-space:nowrap">
        ${eta} min
      </div>`
  });
}

export function iconeMotoSimples(nome = '') {
  return L.divIcon({
    className: '', iconSize: [40, 40], iconAnchor: [20, 20],
    html: `<div style="width:40px;height:40px;border-radius:50%;background:#FF6A00;
                       border:3px solid #fff;box-shadow:0 4px 12px rgba(255,106,0,.5);
                       display:flex;align-items:center;justify-content:center;
                       font-size:18px" title="${nome}">🏍</div>`
  });
}