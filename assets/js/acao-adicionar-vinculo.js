// Ação "Adicionar vínculo profissional" — aberta a partir da seção de
// Vínculos no Detalhe do Filiado. RN-ASS-02 (07-regras-de-negocio-e-seguranca.md): abrir um
// vínculo novo encerra automaticamente o ATUAL anterior, se houver — daí o
// aviso condicional abaixo.
//
// Fase 4/Fatia A: a empresa deixou de ser texto livre (`empresaNome`/
// `empresaCnpj`) e passou a ser `empresaId`, escolhido de `GET /empresas`
// via empresa-select.js. Quem abre o vínculo pode não ter a empresa
// cadastrada ainda — o item "Cadastrar nova empresa" no fim do próprio
// dropdown (aoCriarNova) resolve isso sem sair do fluxo.
import { criarVinculo, ApiError } from './api.js';
import { abrirModal, fecharModal } from './ui.js';
import { inicializarDatePickerCustomizado } from './custom-date-picker.js';
import { inicializarEmpresaSelect } from './empresa-select.js';
import { abrirModalCriarEmpresa } from './acao-criar-empresa.js';

/**
 * @param {{
 *   filiadoId: string,
 *   temVinculoAtual: boolean,
 *   token: string,
 *   aoConcluir: (resultado: object) => void,
 *   empresaPreSelecionada?: { id: string, razaoSocial: string },
 *   valoresIniciais?: { cargoFuncao?: string, dataAdmissao?: string },
 * }} opcoes `empresaPreSelecionada`/`valoresIniciais` só são usados quando
 *   este modal se reabre depois de cadastrar uma empresa nova no meio do
 *   fluxo (ver `aoCriarNova` no empresa-select abaixo).
 */
export function abrirModalAdicionarVinculo({
  filiadoId,
  temVinculoAtual,
  token,
  aoConcluir,
  empresaPreSelecionada,
  valoresIniciais,
}) {
  const conteudo = abrirModal(`
    <h2>Adicionar vínculo profissional</h2>

    ${
      temVinculoAtual
        ? `<div class="alert alert--warning is-visible" role="status">
             <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
             <span>Isso vai encerrar automaticamente o vínculo atual deste filiado.</span>
           </div>`
        : ''
    }

    <div id="alerta-modal-vinculo" class="alert" role="alert" aria-live="polite">
      <i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i>
      <span id="alerta-modal-vinculo-texto"></span>
    </div>

    <form id="form-adicionar-vinculo">
      <div class="campo-formulario obrigatorio">
        <label for="modal-empresa-select">Empresa</label>
        <div class="empresa-select" id="modal-empresa-select"></div>
      </div>
      <div class="campo-formulario obrigatorio">
        <label for="modal-cargo-funcao">Cargo / função</label>
        <input type="text" id="modal-cargo-funcao" required>
      </div>
      <div class="campo-formulario obrigatorio">
        <label for="modal-data-admissao">Data de admissão</label>
        <input type="date" id="modal-data-admissao" required>
      </div>
      <div class="acoes-formulario">
        <button type="submit" class="btn-submit" id="btn-confirmar-vinculo">
          <span id="texto-btn-confirmar-vinculo">Adicionar</span>
        </button>
      </div>
    </form>
  `);

  const form = conteudo.querySelector('#form-adicionar-vinculo');
  const alerta = conteudo.querySelector('#alerta-modal-vinculo');
  const alertaTexto = conteudo.querySelector('#alerta-modal-vinculo-texto');
  const btnConfirmar = conteudo.querySelector('#btn-confirmar-vinculo');
  const textoBtnConfirmar = conteudo.querySelector('#texto-btn-confirmar-vinculo');
  const inputCargoFuncao = conteudo.querySelector('#modal-cargo-funcao');
  const inputDataAdmissao = conteudo.querySelector('#modal-data-admissao');
  const elementoEmpresaSelect = conteudo.querySelector('#modal-empresa-select');

  inicializarDatePickerCustomizado(inputDataAdmissao);
  inicializarEmpresaSelect(elementoEmpresaSelect, {
    token,
    valorInicial: empresaPreSelecionada,
    // Vínculo novo só aceita empresa ativa (guia Fatia A) — filtrar aqui
    // evita deixar escolher algo que a API vai recusar de todo jeito.
    filtrosExtra: { status: 'ATIVA' },
    aoCriarNova: () => {
      // abrirModal() só sustenta um overlay por vez — cadastrar a empresa
      // aqui fecha este modal e o reabre em seguida com o que já foi
      // preenchido, em vez de empilhar um modal dentro do outro. Se o
      // cadastro de empresa for cancelado, este modal não reabre sozinho
      // (limitação aceita: é preciso clicar em "Adicionar vínculo" de novo).
      const valoresAtuais = {
        cargoFuncao: inputCargoFuncao.value,
        dataAdmissao: inputDataAdmissao.value,
      };
      abrirModalCriarEmpresa({
        token,
        aoConcluir: (empresaCriada) => {
          abrirModalAdicionarVinculo({
            filiadoId,
            temVinculoAtual,
            token,
            aoConcluir,
            empresaPreSelecionada: empresaCriada,
            valoresIniciais: valoresAtuais,
          });
        },
      });
    },
  });

  if (valoresIniciais?.cargoFuncao) inputCargoFuncao.value = valoresIniciais.cargoFuncao;
  if (valoresIniciais?.dataAdmissao) {
    inputDataAdmissao.value = valoresIniciais.dataAdmissao;
    // custom-date-picker.js só reflete no rótulo visível se `change` disparar.
    inputDataAdmissao.dispatchEvent(new Event('change', { bubbles: true }));
  }

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
    textoBtnConfirmar.textContent = 'Adicionando...';

    try {
      const resultado = await criarVinculo(token, filiadoId, {
        empresaId,
        cargoFuncao: inputCargoFuncao.value.trim(),
        dataAdmissao: inputDataAdmissao.value,
      });
      fecharModal();
      aoConcluir(resultado);
    } catch (erro) {
      alertaTexto.textContent = erro instanceof ApiError ? erro.message : 'Não foi possível adicionar o vínculo.';
      alerta.classList.add('alert--error', 'is-visible');
      btnConfirmar.disabled = false;
      textoBtnConfirmar.textContent = 'Adicionar';
    }
  });
}
