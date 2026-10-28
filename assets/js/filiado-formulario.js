import { obterFiliado, criarFiliado, atualizarFiliado, ApiError } from './api.js';
import { obterToken } from './auth-storage.js';
import { montarShell } from './shell.js';
import { renderizarEstadoPagina, paraValorDeInputData, abrirModal, fecharModal, escaparHtml } from './ui.js';
import { inicializarDatePickerCustomizado } from './custom-date-picker.js';
import { inicializarSelectCustomizado } from './custom-select.js';

// RN-FIL-05/06/07 (07-regras-de-negocio-e-seguranca.md): POST e PUT de
// filiados são restritos a ADMIN/SECRETARIO — mesmo perfil dos dois.
const PERFIS_PERMITIDOS = ['ADMIN', 'SECRETARIO'];

// Um só arquivo pros dois modos — `statusCadastral` nunca aparece aqui em nenhum dos dois,
// porque é proibido no PUT (RN-FIL-07) e não faz sentido no POST (o
// cadastro sempre nasce ATIVO).
const CAMPOS_DO_FORMULARIO = [
  'nomeCompleto',
  'cpf',
  'matricula',
  'rg',
  'dataNascimento',
  'sexo',
  'estadoCivil',
  'email',
  'telefone',
  'celular',
  'cep',
  'logradouro',
  'numero',
  'bairro',
  'cidade',
  'uf',
  'dataFiliacao',
  'dataVigenciaInicio',
  'dataVigenciaFim',
  'observacoes',
];

const container = document.getElementById('conteudo-formulario');
const form = document.getElementById('form-filiado');
const tituloEl = document.getElementById('titulo-formulario');
const subtituloEl = document.getElementById('subtitulo-formulario');
const alertaEl = document.getElementById('alerta-formulario');
const alertaTextoEl = document.getElementById('alerta-formulario-texto');
const btnSalvar = document.getElementById('btn-salvar');
const textoBtnSalvar = document.getElementById('texto-btn-salvar');

function obterIdDaUrl() {
  return new URLSearchParams(window.location.search).get('id');
}

function mostrarAlerta(mensagem) {
  alertaTextoEl.textContent = mensagem;
  alertaEl.classList.add('alert--error', 'is-visible');
}

function esconderAlerta() {
  alertaEl.classList.remove('is-visible');
}

function preencherFormulario(filiado) {
  CAMPOS_DO_FORMULARIO.forEach((campo) => {
    const input = form.elements.namedItem(campo);
    if (!input) return;
    const valor = filiado[campo];
    // Bug #8 (QA 2026-09-21): "Sexo"/"Estado civil" viraram <select> de
    // opções fixas, mas um filiado cadastrado antes dessa mudança pode ter
    // um valor de texto livre que não bate com nenhuma opção — em vez de
    // esvaziar o campo (e arriscar apagar o dado ao salvar, mesmo com a
    // confirmação do Bug #1), preserva o valor existente como opção extra.
    if (input.tagName === 'SELECT' && valor && !Array.from(input.options).some((o) => o.value === valor)) {
      const opcaoExistente = document.createElement('option');
      opcaoExistente.value = valor;
      opcaoExistente.textContent = valor;
      input.appendChild(opcaoExistente);
    }
    input.value = input.type === 'date' ? paraValorDeInputData(valor) : (valor ?? '');
  });
}

function construirPayload() {
  const dados = {};
  CAMPOS_DO_FORMULARIO.forEach((campo) => {
    const input = form.elements.namedItem(campo);
    const valor = input.value.trim();
    dados[campo] = valor === '' ? null : valor;
  });
  return dados;
}

function definirSalvando(salvando) {
  btnSalvar.disabled = salvando;
  textoBtnSalvar.textContent = salvando ? 'Salvando...' : 'Salvar';
}

// Bug #2 do relatório de QA de 2026-09-21: os campos ficavam editáveis
// enquanto os dados do filiado ainda estavam sendo buscados (fetch
// assíncrono), sem nenhum indicador — se o usuário digitasse nesse intervalo,
// o valor buscado sobrescrevia o que ele tinha acabado de digitar, sem
// aviso. Desabilitar os campos até o carregamento terminar elimina a
// condição de corrida (campo desabilitado não aceita digitação).
function definirCamposDesabilitados(desabilitado) {
  CAMPOS_DO_FORMULARIO.forEach((campo) => {
    const input = form.elements.namedItem(campo);
    if (input) input.disabled = desabilitado;
  });
  btnSalvar.disabled = desabilitado;
}

function renderizarSemPermissao() {
  renderizarEstadoPagina(container, {
    icone: 'fa-lock',
    titulo: 'Sem permissão',
    mensagem: 'Seu perfil não tem acesso a cadastro/edição de filiados.',
  });
}

function rotuloDoCampo(campo) {
  return document.querySelector(`label[for="campo-${campo}"]`)?.textContent ?? campo;
}

function temValorPreenchido(valor) {
  return valor !== null && valor !== undefined && valor !== '';
}

async function inicializar() {
  const usuario = await montarShell({ itemAtivo: 'filiados' });
  if (!usuario) return;

  if (!PERFIS_PERMITIDOS.includes(usuario.perfil)) {
    renderizarSemPermissao();
    return;
  }

  const id = obterIdDaUrl();
  let filiadoOriginal = null;

  if (id) {
    tituloEl.textContent = 'Editar Filiado';
    const avisoSubstituicao =
      'A gravação substitui o cadastro inteiro (RN-FIL-05) — revise todos os campos antes de salvar, um campo deixado em branco apaga o valor atual.';
    subtituloEl.textContent = 'Carregando dados do filiado...';
    definirCamposDesabilitados(true);

    try {
      filiadoOriginal = await obterFiliado(obterToken(), id);
      preencherFormulario(filiadoOriginal);
      subtituloEl.textContent = avisoSubstituicao;
      definirCamposDesabilitados(false);
    } catch (erro) {
      const notFound = erro instanceof ApiError && erro.statusCode === 404;
      renderizarEstadoPagina(container, {
        icone: notFound ? 'fa-circle-question' : 'fa-triangle-exclamation',
        titulo: notFound ? 'Filiado não encontrado' : 'Não foi possível carregar',
        mensagem: erro instanceof ApiError ? erro.message : 'Tente novamente em instantes.',
      });
      return;
    }
  }

  // RN-FIL-04 (dataFiliacao) e RN-FIL-08 (dataNascimento) já rejeitam data
  // futura no backend — replicar como `max` aqui dá o mesmo feedback sem
  // esperar a resposta da API (Bug #6 do relatório de QA de 2026-09-21).
  const hojeIso = new Date().toISOString().slice(0, 10);
  form.elements.namedItem('dataNascimento').max = hojeIso;
  form.elements.namedItem('dataFiliacao').max = hojeIso;

  form.querySelectorAll('input[type="date"]').forEach(inicializarDatePickerCustomizado);
  form.querySelectorAll('select').forEach(inicializarSelectCustomizado);

  async function salvar(payload) {
    definirSalvando(true);
    try {
      const resultado = id
        ? await atualizarFiliado(obterToken(), id, payload)
        : await criarFiliado(obterToken(), payload);
      window.location.href = `filiado-detalhe.html?id=${encodeURIComponent(resultado.id)}`;
    } catch (erro) {
      mostrarAlerta(erro instanceof ApiError ? erro.message : 'Não foi possível salvar. Tente novamente.');
      definirSalvando(false);
    }
  }

  // Bug #1 do relatório de QA de 2026-09-21: RN-FIL-05 continua sendo
  // substituição total (decisão de produto, não muda) — mas antes de apagar
  // silenciosamente um campo que já tinha valor, exige confirmação explícita
  // nomeando os campos afetados.
  function confirmarApagamentoDeCampos(campos, payload) {
    const itens = campos.map((campo) => `<li>${escaparHtml(rotuloDoCampo(campo))}</li>`).join('');
    abrirModal(`
      <h2>Confirmar alteração</h2>
      <p class="modal-descricao">
        Estes campos estão preenchidos hoje e ficarão vazios se você salvar — a edição substitui o
        cadastro inteiro (RN-FIL-05):
      </p>
      <ul class="lista-campos-a-apagar">${itens}</ul>
      <div class="acoes-formulario">
        <button type="button" class="btn-ghost" id="btn-cancelar-apagamento">Cancelar</button>
        <button type="button" class="btn-submit" id="btn-confirmar-apagamento">Salvar mesmo assim</button>
      </div>
    `);
    document.getElementById('btn-cancelar-apagamento').addEventListener('click', fecharModal);
    document.getElementById('btn-confirmar-apagamento').addEventListener('click', () => {
      fecharModal();
      void salvar(payload);
    });
  }

  form.addEventListener('submit', (evento) => {
    evento.preventDefault();
    esconderAlerta();

    const payload = construirPayload();

    if (filiadoOriginal) {
      const camposApagados = CAMPOS_DO_FORMULARIO.filter(
        (campo) => temValorPreenchido(filiadoOriginal[campo]) && payload[campo] === null,
      );
      if (camposApagados.length > 0) {
        confirmarApagamentoDeCampos(camposApagados, payload);
        return;
      }
    }

    void salvar(payload);
  });
}

void inicializar();
