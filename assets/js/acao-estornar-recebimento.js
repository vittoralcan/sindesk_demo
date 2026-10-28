// Ação "Estornar" — RN-CON-03 (07-regras-de-negocio-e-seguranca.md, seção
// 14) e guia-front-end-fatia-c.md, seção 2.1. Só ADMIN (mais restrito que
// lançar); cria uma linha nova com valor negativo, nunca altera a original.
// Estornar um estorno é permitido — o botão funciona igual em cima dele.
import { estornarRecebimento, ApiError } from './api.js';
import { abrirModal, fecharModal } from './ui.js';

/**
 * @param {{ recebimento: { id: string }, token: string, aoConcluir: (resultado: object) => void }} opcoes
 */
export function abrirModalEstornarRecebimento({ recebimento, token, aoConcluir }) {
  const conteudo = abrirModal(`
    <h2>Estornar recebimento</h2>
    <p class="modal-descricao">Cria um lançamento novo com o valor negativo — o recebimento original não é alterado nem apagado.</p>

    <div id="alerta-modal-estorno" class="alert" role="alert" aria-live="polite">
      <i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i>
      <span id="alerta-modal-estorno-texto"></span>
    </div>

    <form id="form-estornar-recebimento">
      <div class="campo-formulario obrigatorio">
        <label for="modal-motivo-estorno">Motivo</label>
        <textarea id="modal-motivo-estorno" minlength="5" maxlength="500" required></textarea>
        <span class="contador-caracteres" id="modal-motivo-estorno-contador">0/500</span>
      </div>
      <div class="acoes-formulario">
        <button type="submit" class="btn-submit" id="btn-confirmar-estorno">
          <span id="texto-btn-confirmar-estorno">Confirmar estorno</span>
        </button>
      </div>
    </form>
  `);

  const form = conteudo.querySelector('#form-estornar-recebimento');
  const textareaMotivo = conteudo.querySelector('#modal-motivo-estorno');
  const contador = conteudo.querySelector('#modal-motivo-estorno-contador');
  const alerta = conteudo.querySelector('#alerta-modal-estorno');
  const alertaTexto = conteudo.querySelector('#alerta-modal-estorno-texto');
  const btnConfirmar = conteudo.querySelector('#btn-confirmar-estorno');
  const textoBtnConfirmar = conteudo.querySelector('#texto-btn-confirmar-estorno');

  textareaMotivo.addEventListener('input', () => {
    contador.textContent = `${textareaMotivo.value.length}/500`;
  });

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    alerta.classList.remove('is-visible');
    btnConfirmar.disabled = true;
    textoBtnConfirmar.textContent = 'Confirmando...';

    try {
      const resultado = await estornarRecebimento(token, recebimento.id, {
        motivo: textareaMotivo.value.trim(),
      });
      fecharModal();
      aoConcluir(resultado);
    } catch (erro) {
      alertaTexto.textContent = erro instanceof ApiError ? erro.message : 'Não foi possível estornar o recebimento.';
      alerta.classList.add('alert--error', 'is-visible');
      btnConfirmar.disabled = false;
      textoBtnConfirmar.textContent = 'Confirmar estorno';
    }
  });
}
