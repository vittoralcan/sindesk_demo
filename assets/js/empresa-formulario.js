import { obterEmpresa, criarEmpresa, atualizarEmpresa, ApiError } from './api.js';
import { obterToken } from './auth-storage.js';
import { montarShell } from './shell.js';
import { renderizarEstadoPagina } from './ui.js';

// RN-EMP-* (07-regras-de-negocio-e-seguranca.md, guia Fatia A): POST e PUT
// de empresas são restritos a ADMIN/SECRETARIO — mesmo perfil de filiados.
const PERFIS_PERMITIDOS = ['ADMIN', 'SECRETARIO'];

// Um só arquivo pros dois modos, mesmo padrão de filiado-formulario.js.
// `status` nunca aparece aqui — não faz sentido no POST (nasce sempre
// ATIVA) e é proibido no PUT (transição só por PATCH /empresas/:id/status).
const CAMPOS_DO_FORMULARIO = [
  'razaoSocial',
  'cnpj',
  'nomeFantasia',
  'emailContato',
  'telefoneContato',
  'responsavelNome',
  'cep',
  'logradouro',
  'numero',
  'bairro',
  'municipio',
  'uf',
  'observacoes',
];

const container = document.getElementById('conteudo-formulario');
const form = document.getElementById('form-empresa');
const tituloEl = document.getElementById('titulo-formulario');
const subtituloEl = document.getElementById('subtitulo-formulario');
const alertaEl = document.getElementById('alerta-formulario');
const alertaTextoEl = document.getElementById('alerta-formulario-texto');
const btnSalvar = document.getElementById('btn-salvar');
const textoBtnSalvar = document.getElementById('texto-btn-salvar');
const inputCnpj = document.getElementById('campo-cnpj');
const avisoCnpjFixo = document.getElementById('aviso-cnpj-fixo');

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

function preencherFormulario(empresa) {
  CAMPOS_DO_FORMULARIO.forEach((campo) => {
    const input = form.elements.namedItem(campo);
    if (!input) return;
    input.value = empresa[campo] ?? '';
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

function renderizarSemPermissao() {
  renderizarEstadoPagina(container, {
    icone: 'fa-lock',
    titulo: 'Sem permissão',
    mensagem: 'Seu perfil não tem acesso a cadastro/edição de empresas.',
  });
}

async function inicializar() {
  const usuario = await montarShell({ itemAtivo: 'empresas' });
  if (!usuario) return;

  if (!PERFIS_PERMITIDOS.includes(usuario.perfil)) {
    renderizarSemPermissao();
    return;
  }

  const id = obterIdDaUrl();

  if (id) {
    tituloEl.textContent = 'Editar Empresa';
    subtituloEl.textContent =
      'A gravação substitui o cadastro inteiro — revise todos os campos antes de salvar, um campo deixado em branco apaga o valor atual.';

    // RN-EMP-* (guia Fatia A): cnpj não é alterável depois do cadastro —
    // reenviar o mesmo valor é aceito, valor diferente é 400. Trava aqui
    // é só UX (evita o usuário editar pra nada); quem decide de verdade
    // continua sendo a API.
    inputCnpj.readOnly = true;
    avisoCnpjFixo.hidden = false;

    try {
      const empresa = await obterEmpresa(obterToken(), id);
      preencherFormulario(empresa);
    } catch (erro) {
      const notFound = erro instanceof ApiError && erro.statusCode === 404;
      renderizarEstadoPagina(container, {
        icone: notFound ? 'fa-circle-question' : 'fa-triangle-exclamation',
        titulo: notFound ? 'Empresa não encontrada' : 'Não foi possível carregar',
        mensagem: erro instanceof ApiError ? erro.message : 'Tente novamente em instantes.',
      });
      return;
    }
  }

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    esconderAlerta();
    definirSalvando(true);

    const payload = construirPayload();

    try {
      const resultado = id
        ? await atualizarEmpresa(obterToken(), id, payload)
        : await criarEmpresa(obterToken(), payload);
      window.location.href = `empresa-detalhe.html?id=${encodeURIComponent(resultado.id)}`;
    } catch (erro) {
      mostrarAlerta(erro instanceof ApiError ? erro.message : 'Não foi possível salvar. Tente novamente.');
      definirSalvando(false);
    }
  });
}

void inicializar();
