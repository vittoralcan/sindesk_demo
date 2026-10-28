// Ação "Novo recebimento" — lançamento manual (RN-CON-01/02,
// guia-front-end-fatia-c.md, seção 2.1). `competencia` pode ser futura
// (recebimento antecipado), `dataRecebimento` não — trava só nela com
// `max` = hoje. `origem` nunca é enviada no corpo: o backend grava sempre
// `MANUAL`.
import { criarRecebimento, ApiError } from './api.js';
import { abrirModal, fecharModal } from './ui.js';
import { inicializarDatePickerCustomizado } from './custom-date-picker.js';
import { inicializarEmpresaSelect } from './empresa-select.js';

function dataDeHoje() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * @param {{ token: string, aoConcluir: (resultado: object) => void }} opcoes
 */
export function abrirModalCriarRecebimento({ token, aoConcluir }) {
  const conteudo = abrirModal(`
    <h2>Novo recebimento</h2>

    <div id="alerta-modal-recebimento" class="alert" role="alert" aria-live="polite">
      <i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i>
      <span id="alerta-modal-recebimento-texto"></span>
    </div>

    <form id="form-criar-recebimento">
      <div class="campo-formulario obrigatorio">
        <label for="modal-recebimento-empresa-select">Empresa</label>
        <div class="empresa-select" id="modal-recebimento-empresa-select"></div>
      </div>
      <div class="campo-formulario obrigatorio">
        <label for="modal-recebimento-competencia">Competência</label>
        <input type="month" id="modal-recebimento-competencia" pattern="\\d{4}-\\d{2}" required>
      </div>
      <div class="campo-formulario obrigatorio">
        <label for="modal-recebimento-valor">Valor recebido (R$)</label>
        <input type="number" id="modal-recebimento-valor" step="0.01" min="0.01" required>
      </div>
      <div class="campo-formulario obrigatorio">
        <label for="modal-recebimento-data">Data do recebimento</label>
        <input type="date" id="modal-recebimento-data" required>
      </div>
      <div class="campo-formulario">
        <label for="modal-recebimento-descricao">Descrição</label>
        <input type="text" id="modal-recebimento-descricao" maxlength="255">
      </div>
      <div class="acoes-formulario">
        <button type="submit" class="btn-submit" id="btn-confirmar-recebimento">
          <span id="texto-btn-confirmar-recebimento">Lançar</span>
        </button>
      </div>
    </form>
  `);

  const form = conteudo.querySelector('#form-criar-recebimento');
  const elementoEmpresaSelect = conteudo.querySelector('#modal-recebimento-empresa-select');
  const inputCompetencia = conteudo.querySelector('#modal-recebimento-competencia');
  const inputValor = conteudo.querySelector('#modal-recebimento-valor');
  const inputData = conteudo.querySelector('#modal-recebimento-data');
  const inputDescricao = conteudo.querySelector('#modal-recebimento-descricao');
  const alerta = conteudo.querySelector('#alerta-modal-recebimento');
  const alertaTexto = conteudo.querySelector('#alerta-modal-recebimento-texto');
  const btnConfirmar = conteudo.querySelector('#btn-confirmar-recebimento');
  const textoBtnConfirmar = conteudo.querySelector('#texto-btn-confirmar-recebimento');

  inicializarEmpresaSelect(elementoEmpresaSelect, { token });
  inputData.max = dataDeHoje();
  inicializarDatePickerCustomizado(inputData);

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    alerta.classList.remove('is-visible');

    const empresaId = elementoEmpresaSelect.querySelector('.empresa-select-valor').value;
    if (!empresaId) {
      alertaTexto.textContent = 'Selecione uma empresa da lista.';
      alerta.classList.add('alert--error', 'is-visible');
      return;
    }

    btnConfirmar.disabled = true;
    textoBtnConfirmar.textContent = 'Lançando...';

    const valorReais = Number(inputValor.value);

    try {
      const resultado = await criarRecebimento(token, {
        empresaId,
        competencia: inputCompetencia.value,
        valorCentavos: Math.round(valorReais * 100),
        dataRecebimento: inputData.value,
        ...(inputDescricao.value.trim() ? { descricao: inputDescricao.value.trim() } : {}),
      });
      fecharModal();
      aoConcluir(resultado);
    } catch (erro) {
      alertaTexto.textContent = erro instanceof ApiError ? erro.message : 'Não foi possível lançar o recebimento.';
      alerta.classList.add('alert--error', 'is-visible');
      btnConfirmar.disabled = false;
      textoBtnConfirmar.textContent = 'Lançar';
    }
  });
}
