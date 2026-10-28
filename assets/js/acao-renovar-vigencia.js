// Ação "Renovar vigência" — aberta a partir do Detalhe do Filiado.
// RN-ASS-04
// (07-regras-de-negocio-e-seguranca.md): a nova data precisa ser
// estritamente posterior à atual; se a vigência atual for nula, não há o
// que renovar (o caminho pra isso é o Editar, não este modal).
import { renovarVigenciaFiliado, ApiError } from './api.js';
import { abrirModal, fecharModal, formatarData, paraValorDeInputData } from './ui.js';
import { inicializarDatePickerCustomizado } from './custom-date-picker.js';

/**
 * @param {{ filiado: { id: string, dataVigenciaFim: string | null }, token: string, aoConcluir: (resultado: object) => void }} opcoes
 */
export function abrirModalRenovarVigencia({ filiado, token, aoConcluir }) {
  if (!filiado.dataVigenciaFim) {
    abrirModal(`
      <h2>Renovar vigência</h2>
      <p class="subsecao-vazia">
        Este filiado não tem uma data de vigência fim definida — não há o que renovar.
        Para definir a primeira data, use "Editar".
      </p>
    `);
    return;
  }

  // `dataVigenciaFim` pode chegar como "2026-01-15" ou, se o campo DATE for
  // serializado com horário, "2026-01-15T00:00:00.000Z" — cortamos pro
  // formato puro antes de usar como `min` (um `min` com timestamp é
  // inválido pro <input type="date"> e o navegador simplesmente o ignora).
  const vigenciaFimAtual = paraValorDeInputData(filiado.dataVigenciaFim);

  const conteudo = abrirModal(`
    <h2>Renovar vigência</h2>
    <p class="modal-descricao">Vigência fim atual: <strong>${formatarData(filiado.dataVigenciaFim)}</strong></p>

    <div id="alerta-modal-vigencia" class="alert" role="alert" aria-live="polite">
      <i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i>
      <span id="alerta-modal-vigencia-texto"></span>
    </div>

    <form id="form-renovar-vigencia">
      <div class="campo-formulario obrigatorio">
        <label for="modal-nova-vigencia">Nova data de vigência fim</label>
        <input type="date" id="modal-nova-vigencia" min="${vigenciaFimAtual}" required>
      </div>
      <div class="acoes-formulario">
        <button type="submit" class="btn-submit" id="btn-confirmar-vigencia">
          <span id="texto-btn-confirmar-vigencia">Confirmar renovação</span>
        </button>
      </div>
    </form>
  `);

  const form = conteudo.querySelector('#form-renovar-vigencia');
  const inputNovaData = conteudo.querySelector('#modal-nova-vigencia');
  const alerta = conteudo.querySelector('#alerta-modal-vigencia');
  const alertaTexto = conteudo.querySelector('#alerta-modal-vigencia-texto');
  const btnConfirmar = conteudo.querySelector('#btn-confirmar-vigencia');
  const textoBtnConfirmar = conteudo.querySelector('#texto-btn-confirmar-vigencia');

  inicializarDatePickerCustomizado(inputNovaData);

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    alerta.classList.remove('is-visible');

    // Espelha RN-ASS-04 só pra dar feedback rápido — quem decide de
    // verdade continua sendo a API.
    if (inputNovaData.value <= vigenciaFimAtual) {
      alertaTexto.textContent = 'A nova data precisa ser posterior à vigência atual.';
      alerta.classList.add('alert--error', 'is-visible');
      return;
    }

    btnConfirmar.disabled = true;
    textoBtnConfirmar.textContent = 'Confirmando...';

    try {
      const resultado = await renovarVigenciaFiliado(token, filiado.id, {
        novaDataVigenciaFim: inputNovaData.value,
      });
      fecharModal();
      aoConcluir(resultado);
    } catch (erro) {
      alertaTexto.textContent = erro instanceof ApiError ? erro.message : 'Não foi possível renovar a vigência.';
      alerta.classList.add('alert--error', 'is-visible');
      btnConfirmar.disabled = false;
      textoBtnConfirmar.textContent = 'Confirmar renovação';
    }
  });
}
