/**
 * Estado global compartilhado entre os flows.
 * Só guarda coisas que MAIS DE UM fluxo precisa.
 * Coisas específicas de um flow ficam dentro do próprio flow.
 */
export const app = {
  user: null,
  profile: null,
  pickup: null,
  motoqueiroCadastro: null
};

export function setUser(user, profile) {
  app.user = user;
  app.profile = profile;
}

export function setPickup(lat, lng, nome) {
  app.pickup = { lat, lng, nome };
}

export function getPickup() {
  return app.pickup;
}