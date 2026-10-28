// Ação "Alterar status" de uma Empresa — diferente do status de Filiado
// (4 valores, matriz de transição), o status de Empresa é um alternador
// simples ATIVA ⇄ INATIVA (RN-EMP-*, guia Fatia A) — reenviar o status
// atual é 400, então nem faz sentido oferecer um <select> com as duas
// opções: o único destino possível é sempre o oposto do atual.
import { alterarStatusEmpresa, ApiError } from './api.js';
import { abrirModal, fecharModal, renderizarBadgeStatus } from './ui.js';

const LABEL_STATUS = {
  ATIVA: 'Ativa',
  INATIVA: 'Inativa',
};

/**
 * @param {{ empresa: { id: string, status: string }, token: string, aoConcluir: (resultado: object) => void }} opcoes
 */
export function abrirModalAlterarStatusEmpresa({ empresa, token, aoConcluir }) {
  const novoStatus = empresa.status === 'ATIVA' ? 'INATIVA' : 'ATIVA';

  const conteudo = abrirModal(`
    <h2>Alterar status</h2>
    <p class="modal-descricao">
      Status atual: ${renderizarBadgeStatus(empresa.status)}
      <i class="fa-solid fa-arrow-right-long" aria-hidden="true"></i>
      Novo status: ${renderizarBadgeStatus(novoStatus)}
    </p>

    <div id="alerta-modal-status-empresa" class="alert" role="alert" aria-live="polite">
      <i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i>
      <span id="alerta-modal-status-empresa-texto"></span>
    </div>

    <form id="form-alterar-status-empresa">
      <div class="campo-formulario obrigatorio">
        <label for="modal-motivo-empresa">Motivo</label>
        <textarea id="modal-motivo-empresa" minlength="5" maxlength="500" required></textarea>
        <span class="contador-caracteres" id="modal-motivo-empresa-contador">0/500</span>
      </div>
      <div class="acoes-formulario">
        <button type="submit" class="btn-submit" id="btn-confirmar-status-empresa">
          <span id="texto-btn-confirmar-status-empresa">Confirmar</span>
        </button>
      </div>
    </form>
  `);

  const form = conteudo.querySelector('#form-alterar-status-empresa');
  const textareaMotivo = conteudo.querySelector('#modal-motivo-empresa');
  const contador = conteudo.querySelector('#modal-motivo-empresa-contador');
  const alerta = conteudo.querySelector('#alerta-modal-status-empresa');
  const alertaTexto = conteudo.querySelector('#alerta-modal-status-empresa-texto');
  const btnConfirmar = conteudo.querySelector('#btn-confirmar-status-empresa');
  const textoBtnConfirmar = conteudo.querySelector('#texto-btn-confirmar-status-empresa');

  textareaMotivo.addEventListener('input', () => {
    contador.textContent = `${textareaMotivo.value.length}/500`;
  });

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    alerta.classList.remove('is-visible');
    btnConfirmar.disabled = true;
    textoBtnConfirmar.textContent = 'Confirmando...';

    try {
      const resultado = await alterarStatusEmpresa(token, empresa.id, {
        status: novoStatus,
        motivo: textareaMotivo.value.trim(),
      });
      fecharModal();
      aoConcluir(resultado);
    } catch (erro) {
      alertaTexto.textContent = erro instanceof ApiError ? erro.message : 'Não foi possível alterar o status.';
      alerta.classList.add('alert--error', 'is-visible');
      btnConfirmar.disabled = false;
      textoBtnConfirmar.textContent = 'Confirmar';
    }
  });
}
