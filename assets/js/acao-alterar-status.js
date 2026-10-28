// Ação compartilhada "Alterar status" — aberta tanto do Detalhe do Filiado
// quanto de uma linha da Listagem. Um só lugar pra matriz de transição, formulário do modal e
// chamada de API, pra não divergir entre as duas telas.
import { alterarStatusFiliado, ApiError } from './api.js';
import { abrirModal, fecharModal, renderizarBadgeStatus } from './ui.js';
import { inicializarSelectCustomizado } from './custom-select.js';

// RN-FIL-03 (07-regras-de-negocio-e-seguranca.md) — espelha a matriz do
// backend só pra não oferecer no dropdown uma transição que a API recusaria;
// a validação que vale de verdade continua sendo a da API.
const MATRIZ_TRANSICAO = {
  ATIVO: ['INATIVO', 'AFASTADO', 'APOSENTADO'],
  INATIVO: ['ATIVO'],
  AFASTADO: ['ATIVO', 'INATIVO'],
  APOSENTADO: ['INATIVO'],
};

const LABEL_STATUS = {
  ATIVO: 'Ativo',
  INATIVO: 'Inativo',
  AFASTADO: 'Afastado',
  APOSENTADO: 'Aposentado',
};

/**
 * @param {{ filiado: { id: string, statusCadastral: string }, token: string, aoConcluir: (resultado: object) => void }} opcoes
 */
export function abrirModalAlterarStatus({ filiado, token, aoConcluir }) {
  const opcoesPermitidas = MATRIZ_TRANSICAO[filiado.statusCadastral] ?? [];

  const conteudo = abrirModal(`
    <h2>Alterar status</h2>
    <p class="modal-descricao">Status atual: ${renderizarBadgeStatus(filiado.statusCadastral)}</p>

    <div id="alerta-modal-status" class="alert" role="alert" aria-live="polite">
      <i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i>
      <span id="alerta-modal-status-texto"></span>
    </div>

    ${
      opcoesPermitidas.length === 0
        ? '<p class="subsecao-vazia">Não há transição disponível a partir do status atual.</p>'
        : `
      <form id="form-alterar-status">
        <div class="campo-formulario obrigatorio">
          <label for="modal-novo-status">Novo status</label>
          <select id="modal-novo-status" required>
            ${opcoesPermitidas.map((s) => `<option value="${s}">${LABEL_STATUS[s]}</option>`).join('')}
          </select>
        </div>
        <div class="campo-formulario obrigatorio">
          <label for="modal-motivo">Motivo</label>
          <textarea id="modal-motivo" minlength="5" maxlength="255" required></textarea>
          <span class="contador-caracteres" id="modal-motivo-contador">0/255</span>
        </div>
        <div class="acoes-formulario">
          <button type="submit" class="btn-submit" id="btn-confirmar-status">
            <span id="texto-btn-confirmar-status">Confirmar</span>
          </button>
        </div>
      </form>
    `
    }
  `);

  if (opcoesPermitidas.length === 0) return;

  const form = conteudo.querySelector('#form-alterar-status');
  const selectStatus = conteudo.querySelector('#modal-novo-status');
  const textareaMotivo = conteudo.querySelector('#modal-motivo');
  const contador = conteudo.querySelector('#modal-motivo-contador');
  const alerta = conteudo.querySelector('#alerta-modal-status');
  const alertaTexto = conteudo.querySelector('#alerta-modal-status-texto');
  const btnConfirmar = conteudo.querySelector('#btn-confirmar-status');
  const textoBtnConfirmar = conteudo.querySelector('#texto-btn-confirmar-status');

  inicializarSelectCustomizado(selectStatus);

  textareaMotivo.addEventListener('input', () => {
    contador.textContent = `${textareaMotivo.value.length}/255`;
  });

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    alerta.classList.remove('is-visible');
    btnConfirmar.disabled = true;
    textoBtnConfirmar.textContent = 'Confirmando...';

    try {
      const resultado = await alterarStatusFiliado(token, filiado.id, {
        novoStatus: selectStatus.value,
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
