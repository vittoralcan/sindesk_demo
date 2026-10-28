// Ação "Novo plano de contribuição" — o plano é só identidade (código,
// nome); o valor entra à parte, por acao-criar-valor-plano.js (RN-CTR-01,
// guia Fatia A).
import { criarPlanoContribuicao, ApiError } from './api.js';
import { abrirModal, fecharModal } from './ui.js';

/**
 * @param {{ token: string, aoConcluir: (resultado: object) => void }} opcoes
 */
export function abrirModalCriarPlano({ token, aoConcluir }) {
  const conteudo = abrirModal(`
    <h2>Novo plano de contribuição</h2>

    <div id="alerta-modal-criar-plano" class="alert" role="alert" aria-live="polite">
      <i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i>
      <span id="alerta-modal-criar-plano-texto"></span>
    </div>

    <form id="form-criar-plano">
      <div class="campo-formulario obrigatorio">
        <label for="modal-plano-codigo">Código</label>
        <input type="text" id="modal-plano-codigo" placeholder="Ex.: MENSAL-PADRAO" required>
      </div>
      <div class="campo-formulario obrigatorio">
        <label for="modal-plano-nome">Nome</label>
        <input type="text" id="modal-plano-nome" required>
      </div>
      <div class="campo-formulario">
        <label for="modal-plano-descricao">Descrição (opcional)</label>
        <textarea id="modal-plano-descricao"></textarea>
      </div>
      <div class="acoes-formulario">
        <button type="submit" class="btn-submit" id="btn-confirmar-criar-plano">
          <span id="texto-btn-confirmar-criar-plano">Criar</span>
        </button>
      </div>
    </form>
  `);

  const form = conteudo.querySelector('#form-criar-plano');
  const alerta = conteudo.querySelector('#alerta-modal-criar-plano');
  const alertaTexto = conteudo.querySelector('#alerta-modal-criar-plano-texto');
  const btnConfirmar = conteudo.querySelector('#btn-confirmar-criar-plano');
  const textoBtnConfirmar = conteudo.querySelector('#texto-btn-confirmar-criar-plano');

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    alerta.classList.remove('is-visible');
    btnConfirmar.disabled = true;
    textoBtnConfirmar.textContent = 'Criando...';

    const descricao = conteudo.querySelector('#modal-plano-descricao').value.trim();

    try {
      const resultado = await criarPlanoContribuicao(token, {
        codigo: conteudo.querySelector('#modal-plano-codigo').value.trim(),
        nome: conteudo.querySelector('#modal-plano-nome').value.trim(),
        descricao: descricao || null,
      });
      fecharModal();
      aoConcluir(resultado);
    } catch (erro) {
      alertaTexto.textContent = erro instanceof ApiError ? erro.message : 'Não foi possível criar o plano.';
      alerta.classList.add('alert--error', 'is-visible');
      btnConfirmar.disabled = false;
      textoBtnConfirmar.textContent = 'Criar';
    }
  });
}
