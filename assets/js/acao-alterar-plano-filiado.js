// Ação "Alterar plano de contribuição" do filiado — RN-CTR-03: atribuir
// plano a um filiado é ato de cadastro (ADMIN/SECRETARIO), diferente de
// definir o padrão do sindicato ou reajustar o valor de um plano (ambos em
// sindicato-configuracoes.html/planos-contribuicao.html, ADMIN/TESOUREIRO).
// `planoContribuicaoId: null` devolve o filiado ao padrão do sindicato — a
// opção "Usar padrão do sindicato" existe justamente pra isso, o campo é
// sempre enviado, nunca omitido.
import { listarPlanosContribuicao, atualizarPlanoContribuicaoFiliado, ApiError } from './api.js';
import { abrirModal, fecharModal, escaparHtml } from './ui.js';
import { inicializarSelectCustomizado } from './custom-select.js';

/**
 * @param {{ filiado: { id: string, nomeCompleto: string, planoContribuicao: {id: string, origem: string} | null }, token: string, aoConcluir: (resultado: object) => void }} opcoes
 */
export function abrirModalAlterarPlanoFiliado({ filiado, token, aoConcluir }) {
  const conteudo = abrirModal(`
    <h2>Alterar plano de contribuição</h2>
    <p class="modal-descricao">Filiado: ${escaparHtml(filiado.nomeCompleto)}</p>

    <div id="alerta-modal-plano-filiado" class="alert" role="alert" aria-live="polite">
      <i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i>
      <span id="alerta-modal-plano-filiado-texto"></span>
    </div>

    <form id="form-alterar-plano-filiado">
      <div class="campo-formulario">
        <label for="modal-plano-filiado">Plano</label>
        <select id="modal-plano-filiado">
          <option value="">Usar padrão do sindicato</option>
        </select>
      </div>
      <div class="acoes-formulario">
        <button type="submit" class="btn-submit" id="btn-confirmar-plano-filiado">
          <span id="texto-btn-confirmar-plano-filiado">Confirmar</span>
        </button>
      </div>
    </form>
  `);

  const form = conteudo.querySelector('#form-alterar-plano-filiado');
  const selectPlano = conteudo.querySelector('#modal-plano-filiado');
  const alerta = conteudo.querySelector('#alerta-modal-plano-filiado');
  const alertaTexto = conteudo.querySelector('#alerta-modal-plano-filiado-texto');
  const btnConfirmar = conteudo.querySelector('#btn-confirmar-plano-filiado');
  const textoBtnConfirmar = conteudo.querySelector('#texto-btn-confirmar-plano-filiado');

  (async () => {
    try {
      const planos = await listarPlanosContribuicao(token);
      planos.forEach((plano) => {
        const opcao = document.createElement('option');
        opcao.value = plano.id;
        opcao.textContent = `${plano.codigo} — ${plano.nome}`;
        selectPlano.appendChild(opcao);
      });
      // O plano efetivo (filiado.planoContribuicao) pode vir do padrão do
      // sindicato, não do filiado — só pré-seleciona quando é PROPRIO dele,
      // senão o select ficaria sugerindo uma atribuição que não existe.
      if (filiado.planoContribuicao?.origem === 'PROPRIO') {
        selectPlano.value = filiado.planoContribuicao.id;
      }
    } catch {
      // Lista de planos indisponível não deveria travar a opção de "usar
      // padrão" — o select segue funcional só com essa opção.
    }
    inicializarSelectCustomizado(selectPlano);
  })();

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    alerta.classList.remove('is-visible');
    btnConfirmar.disabled = true;
    textoBtnConfirmar.textContent = 'Confirmando...';

    try {
      const resultado = await atualizarPlanoContribuicaoFiliado(token, filiado.id, {
        planoContribuicaoId: selectPlano.value || null,
      });
      fecharModal();
      aoConcluir(resultado);
    } catch (erro) {
      alertaTexto.textContent = erro instanceof ApiError ? erro.message : 'Não foi possível alterar o plano.';
      alerta.classList.add('alert--error', 'is-visible');
      btnConfirmar.disabled = false;
      textoBtnConfirmar.textContent = 'Confirmar';
    }
  });
}
