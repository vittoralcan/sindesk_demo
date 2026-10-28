// Ação "Anonimizar" — direito ao esquecimento (RN-LGPD-02,
// 07-regras-de-negocio-e-seguranca.md). A ação mais destrutiva e
// irreversível do sistema, por isso o padrão de confirmação é mais pesado
// que qualquer outro modal: digitar o nome completo do filiado, exatamente, antes do botão
// habilitar — e o modal nunca fecha sozinho por clique fora.
import { anonimizarFiliado, ApiError } from './api.js';
import { abrirModal, fecharModal, escaparHtml } from './ui.js';

/**
 * @param {{ filiado: { id: string, nomeCompleto: string }, token: string, aoConcluir: (resultado: object) => void }} opcoes
 */
export function abrirModalAnonimizar({ filiado, token, aoConcluir }) {
  const conteudo = abrirModal(
    `
    <h2>Anonimizar filiado</h2>

    <div class="alert alert--warning is-visible" role="status">
      <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
      <span>
        Ação irreversível. Nome, e-mail, telefone, endereço, data de nascimento e demais dados de
        identificação direta de <strong>${escaparHtml(filiado.nomeCompleto)}</strong> serão mascarados
        permanentemente. Não é possível desfazer.
      </span>
    </div>

    <div id="alerta-modal-anonimizar" class="alert" role="alert" aria-live="polite">
      <i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i>
      <span id="alerta-modal-anonimizar-texto"></span>
    </div>

    <form id="form-anonimizar">
      <div class="campo-formulario obrigatorio">
        <label for="modal-confirmacao-nome">Digite o nome completo do filiado para confirmar</label>
        <input type="text" id="modal-confirmacao-nome" autocomplete="off" autocorrect="off" spellcheck="false">
      </div>
      <div class="acoes-formulario">
        <button type="submit" class="btn-submit" id="btn-confirmar-anonimizar" disabled>
          <span id="texto-btn-confirmar-anonimizar">Anonimizar permanentemente</span>
        </button>
      </div>
    </form>
  `,
    { fecharAoClicarFora: false },
  );

  const form = conteudo.querySelector('#form-anonimizar');
  const inputConfirmacao = conteudo.querySelector('#modal-confirmacao-nome');
  const alerta = conteudo.querySelector('#alerta-modal-anonimizar');
  const alertaTexto = conteudo.querySelector('#alerta-modal-anonimizar-texto');
  const btnConfirmar = conteudo.querySelector('#btn-confirmar-anonimizar');
  const textoBtnConfirmar = conteudo.querySelector('#texto-btn-confirmar-anonimizar');

  inputConfirmacao.addEventListener('input', () => {
    btnConfirmar.disabled = inputConfirmacao.value !== filiado.nomeCompleto;
  });

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (inputConfirmacao.value !== filiado.nomeCompleto) return;

    alerta.classList.remove('is-visible');
    btnConfirmar.disabled = true;
    textoBtnConfirmar.textContent = 'Anonimizando...';

    try {
      const resultado = await anonimizarFiliado(token, filiado.id);
      fecharModal();
      aoConcluir(resultado);
    } catch (erro) {
      alertaTexto.textContent = erro instanceof ApiError ? erro.message : 'Não foi possível anonimizar o filiado.';
      alerta.classList.add('alert--error', 'is-visible');
      btnConfirmar.disabled = false;
      textoBtnConfirmar.textContent = 'Anonimizar permanentemente';
    }
  });
}
