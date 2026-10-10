/**
 * Fachada window.MotoJa — mantém compatibilidade com o HTML antigo.
 */
export async function installFacade() {
  const passageiro = await import('./flows/passageiro.js');
  const motoqueiro = await import('./flows/motoqueiro.js');
  const admin = await import('./flows/admin.js');
  const tema = await import('./ui/tema.js');
  const modals = await import('./ui/modals.js');
  const app = await import('./stores/app.js');

  window.MotoJa = {
    buscarDestino: passageiro.escolherDestino,
    calcularRota: passageiro.definirPickup,
    confirmarCorrida: passageiro.confirmarCorrida,
    cancelarBusca: passageiro.cancelarBusca,
    resetCorrida: passageiro.resetCorrida,
    obterLocalizacaoReal: passageiro.obterLocalizacaoReal,

    toggleOnline: motoqueiro.toggleOnline,
    atualizarUIMotoqueiro: motoqueiro.atualizarUIMotoqueiro,

    abrirSenhaAdmin: admin.abrirSenhaAdmin,
    fecharAdmin: admin.fecharAdmin,

    alternarTema: tema.alternarTema,
    abrirModal: modals.abrir,
    fecharModal: modals.fechar,

    __getPickup: () => app.getPickup(),
    __getApp: () => app.app
  };
}