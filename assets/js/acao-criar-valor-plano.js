// Ação "Nova vigência de valor" (reajuste) — RN-CTR-01/02, guia Fatia A.
// Nunca expõe campo de `vigenciaFim`: o backend fecha a vigência aberta
// anterior sozinho, na mesma transação, ao abrir esta. Reajustar não é
// editar — não existe PUT/DELETE de valor, só abrir uma vigência nova.
import { criarValorPlano, ApiError } from './api.js';
import { abrirModal, fecharModal } from './ui.js';
import { inicializarDatePickerCustomizado } from './custom-date-picker.js';

/**
 * @param {{ planoId: string, token: string, aoConcluir: (resultado: object) => void }} opcoes
 */
export function abrirModalCriarValorPlano({ planoId, token, aoConcluir }) {
  const conteudo = abrirModal(`
    <h2>Nova vigência de valor</h2>
    <p class="modal-descricao">Abrir um valor novo fecha a vigência atual automaticamente no dia anterior.</p>

    <div id="alerta-modal-criar-valor" class="alert" role="alert" aria-live="polite">
      <i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i>
      <span id="alerta-modal-criar-valor-texto"></span>
    </div>

    <form id="form-criar-valor">
      <div class="campo-formulario obrigatorio">
        <label for="modal-valor-centavos">Valor mensal (R$)</label>
        <input type="number" id="modal-valor-centavos" step="0.01" min="0.01" required>
      </div>
      <div class="campo-formulario obrigatorio">
        <label for="modal-vigencia-inicio">Vigência a partir de</label>
        <input type="date" id="modal-vigencia-inicio" required>
      </div>
      <div class="acoes-formulario">
        <button type="submit" class="btn-submit" id="btn-confirmar-criar-valor">
          <span id="texto-btn-confirmar-criar-valor">Confirmar</span>
        </button>
      </div>
    </form>
  `);

  const form = conteudo.querySelector('#form-criar-valor');
  const inputVigenciaInicio = conteudo.querySelector('#modal-vigencia-inicio');
  const alerta = conteudo.querySelector('#alerta-modal-criar-valor');
  const alertaTexto = conteudo.querySelector('#alerta-modal-criar-valor-texto');
  const btnConfirmar = conteudo.querySelector('#btn-confirmar-criar-valor');
  const textoBtnConfirmar = conteudo.querySelector('#texto-btn-confirmar-criar-valor');

  inicializarDatePickerCustomizado(inputVigenciaInicio);

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    alerta.classList.remove('is-visible');
    btnConfirmar.disabled = true;
    textoBtnConfirmar.textContent = 'Confirmando...';

    const valorReais = Number(conteudo.querySelector('#modal-valor-centavos').value);

    try {
      const resultado = await criarValorPlano(token, planoId, {
        valorCentavos: Math.round(valorReais * 100),
        vigenciaInicio: inputVigenciaInicio.value,
      });
      fecharModal();
      aoConcluir(resultado);
    } catch (erro) {
      alertaTexto.textContent = erro instanceof ApiError ? erro.message : 'Não foi possível registrar o valor.';
      alerta.classList.add('alert--error', 'is-visible');
      btnConfirmar.disabled = false;
      textoBtnConfirmar.textContent = 'Confirmar';
    }
  });
}
