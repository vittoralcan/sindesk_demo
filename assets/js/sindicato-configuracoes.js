import {
  listarPlanosContribuicao,
  obterPlanoPadraoSindicato,
  atualizarPlanoPadraoSindicato,
  obterConfiguracaoPix,
  atualizarConfiguracaoPix,
  obterConciliacao,
  atualizarToleranciaSindicato,
  ApiError,
} from './api.js';
import { obterToken } from './auth-storage.js';
import { montarShell } from './shell.js';
import { renderizarEstadoPagina, competenciaAtual } from './ui.js';
import { inicializarSelectCustomizado } from './custom-select.js';

// RN-CTR-* (07-regras-de-negocio-e-seguranca.md, guia Fatia A): ler o padrão
// é ADMIN/TESOUREIRO; definir é só ADMIN — assimetria deliberada (RN-CTR-03).
// RN-PIX-01/04 (guia-front-end-pix-manual.md, seção 2): mesma régua de
// perfis pra chave Pix.
const PERFIS_PERMITIDOS = ['ADMIN', 'TESOUREIRO'];
const PERFIS_EDITAR = ['ADMIN'];

const container = document.getElementById('conteudo-configuracoes');
const form = document.getElementById('form-plano-padrao');
const selectPlanoPadrao = document.getElementById('select-plano-padrao');
const acoesPlanoPadrao = document.getElementById('acoes-plano-padrao');
const alerta = document.getElementById('alerta-plano-padrao');
const alertaIcone = document.getElementById('alerta-plano-padrao-icone');
const alertaTexto = document.getElementById('alerta-plano-padrao-texto');
const btnSalvar = document.getElementById('btn-salvar-plano-padrao');
const textoBtnSalvar = document.getElementById('texto-btn-salvar-plano-padrao');

const formPix = document.getElementById('form-pix');
const inputChavePix = document.getElementById('input-chave-pix');
const inputNomeRecebedorPix = document.getElementById('input-nome-recebedor-pix');
const inputCidadeRecebedorPix = document.getElementById('input-cidade-recebedor-pix');
const contadorNomeRecebedorPix = document.getElementById('contador-nome-recebedor-pix');
const contadorCidadeRecebedorPix = document.getElementById('contador-cidade-recebedor-pix');
const acoesPix = document.getElementById('acoes-pix');
const alertaPixCpf = document.getElementById('alerta-pix-cpf');
const alertaPixCpfTexto = document.getElementById('alerta-pix-cpf-texto');
const alertaPix = document.getElementById('alerta-plano-pix');
const alertaPixIcone = document.getElementById('alerta-plano-pix-icone');
const alertaPixTexto = document.getElementById('alerta-plano-pix-texto');
const btnSalvarPix = document.getElementById('btn-salvar-pix');
const textoBtnSalvarPix = document.getElementById('texto-btn-salvar-pix');

const formTolerancia = document.getElementById('form-tolerancia');
const inputTolerancia = document.getElementById('input-tolerancia');
const acoesTolerancia = document.getElementById('acoes-tolerancia');
const alertaTolerancia = document.getElementById('alerta-tolerancia');
const alertaToleranciaIcone = document.getElementById('alerta-tolerancia-icone');
const alertaToleranciaTexto = document.getElementById('alerta-tolerancia-texto');
const btnSalvarTolerancia = document.getElementById('btn-salvar-tolerancia');
const textoBtnSalvarTolerancia = document.getElementById('texto-btn-salvar-tolerancia');

/** Esta tela salva no lugar (sem navegar nem fechar modal, diferente do
 * resto do app) — precisa de um jeito de confirmar sucesso, não só erro. */
function mostrarAlerta(mensagem, { tipo }) {
  alerta.classList.remove('alert--error', 'alert--success');
  alertaIcone.className = `fa-solid ${tipo === 'sucesso' ? 'fa-circle-check' : 'fa-circle-exclamation'}`;
  alertaTexto.textContent = mensagem;
  alerta.classList.add(tipo === 'sucesso' ? 'alert--success' : 'alert--error', 'is-visible');
}

function mostrarAlertaPix(mensagem, { tipo }) {
  alertaPix.classList.remove('alert--error', 'alert--success');
  alertaPixIcone.className = `fa-solid ${tipo === 'sucesso' ? 'fa-circle-check' : 'fa-circle-exclamation'}`;
  alertaPixTexto.textContent = mensagem;
  alertaPix.classList.add(tipo === 'sucesso' ? 'alert--success' : 'alert--error', 'is-visible');
}

function preencherOpcoesDePlanos(planos) {
  planos.forEach((plano) => {
    const opcao = document.createElement('option');
    opcao.value = plano.id;
    opcao.textContent = `${plano.codigo} — ${plano.nome}`;
    selectPlanoPadrao.appendChild(opcao);
  });
}

async function carregarSecaoPlanoPadrao(token) {
  const [planos, planoPadrao] = await Promise.all([listarPlanosContribuicao(token), obterPlanoPadraoSindicato(token)]);

  preencherOpcoesDePlanos(planos);
  selectPlanoPadrao.value = planoPadrao.planoContribuicao?.id ?? '';
  inicializarSelectCustomizado(selectPlanoPadrao);
}

/** Reaproveitada depois do PATCH também — a resposta de `atualizarConfiguracaoPix`
 * traz os mesmos campos (`chavePix`/.../`avisos`) que `obterConfiguracaoPix`,
 * então preenche o formulário com o que a API confirmou ter gravado. */
function preencherFormularioPix(configuracao) {
  inputChavePix.value = configuracao.chavePix ?? '';
  inputNomeRecebedorPix.value = configuracao.nomeRecebedorPix ?? '';
  inputCidadeRecebedorPix.value = configuracao.cidadeRecebedorPix ?? '';
  contadorNomeRecebedorPix.textContent = `${inputNomeRecebedorPix.value.length}/25`;
  contadorCidadeRecebedorPix.textContent = `${inputCidadeRecebedorPix.value.length}/15`;

  // RN-PIX-01: só orienta (aviso não bloqueante), nunca bloqueia — hoje o
  // único caso é tipoChave CPF, sugerindo CNPJ do sindicato/chave aleatória.
  if (configuracao.avisos?.length > 0) {
    alertaPixCpfTexto.textContent = configuracao.avisos.join(' ');
    alertaPixCpf.classList.add('is-visible');
  } else {
    alertaPixCpf.classList.remove('is-visible');
  }
}

async function carregarSecaoPix(token) {
  const configuracao = await obterConfiguracaoPix(token);
  preencherFormularioPix(configuracao);
}

function mostrarAlertaTolerancia(mensagem, { tipo }) {
  alertaTolerancia.classList.remove('alert--error', 'alert--success');
  alertaToleranciaIcone.className = `fa-solid ${tipo === 'sucesso' ? 'fa-circle-check' : 'fa-circle-exclamation'}`;
  alertaToleranciaTexto.textContent = mensagem;
  alertaTolerancia.classList.add(tipo === 'sucesso' ? 'alert--success' : 'alert--error', 'is-visible');
}

// Não existe GET /sindicato/tolerancia dedicado — só o PATCH (guia-front-
// end-fatia-c.md, seção 2.2). O valor atual é lido como efeito colateral de
// GET /conciliacao (que sempre devolve `toleranciaCentavos`), usando a
// competência corrente só para ter uma consulta válida — o resultado de
// `data`/`resumo` desta chamada é descartado de propósito.
async function carregarSecaoTolerancia(token) {
  const conciliacao = await obterConciliacao(token, { competencia: competenciaAtual() });
  inputTolerancia.value = (conciliacao.toleranciaCentavos / 100).toFixed(2);
}

async function inicializar() {
  const usuario = await montarShell({ itemAtivo: 'config-sindicato' });
  if (!usuario) return;

  if (!PERFIS_PERMITIDOS.includes(usuario.perfil)) {
    renderizarEstadoPagina(container, {
      icone: 'fa-lock',
      titulo: 'Sem permissão',
      mensagem: 'Seu perfil não tem acesso às configurações do sindicato.',
    });
    return;
  }

  const token = obterToken();
  const podeEditar = PERFIS_EDITAR.includes(usuario.perfil);

  if (!podeEditar) {
    // TESOUREIRO só lê (RN-CTR-03/RN-PIX-04) — mostra a tela em modo
    // leitura, não esconde a seção inteira (ele tem GET, só não tem PATCH).
    selectPlanoPadrao.disabled = true;
    acoesPlanoPadrao.hidden = true;
    inputChavePix.disabled = true;
    inputNomeRecebedorPix.disabled = true;
    inputCidadeRecebedorPix.disabled = true;
    acoesPix.hidden = true;
    // RN-CON-06: PATCH /sindicato/tolerancia é mais restrito ainda — só
    // ADMIN, nem TESOUREIRO (que já edita plano padrão e chave Pix).
    inputTolerancia.disabled = true;
    acoesTolerancia.hidden = true;
  }

  try {
    await Promise.all([carregarSecaoPlanoPadrao(token), carregarSecaoPix(token), carregarSecaoTolerancia(token)]);
  } catch (erro) {
    renderizarEstadoPagina(container, {
      icone: 'fa-triangle-exclamation',
      titulo: 'Não foi possível carregar',
      mensagem: erro instanceof ApiError ? erro.message : 'Tente novamente em instantes.',
    });
    return;
  }

  if (!podeEditar) return;

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    alerta.classList.remove('is-visible');
    btnSalvar.disabled = true;
    textoBtnSalvar.textContent = 'Salvando...';

    try {
      await atualizarPlanoPadraoSindicato(token, {
        planoContribuicaoId: selectPlanoPadrao.value || null,
      });
      mostrarAlerta('Plano padrão atualizado.', { tipo: 'sucesso' });
    } catch (erro) {
      mostrarAlerta(erro instanceof ApiError ? erro.message : 'Não foi possível salvar.', { tipo: 'erro' });
    } finally {
      btnSalvar.disabled = false;
      textoBtnSalvar.textContent = 'Salvar';
    }
  });

  inputNomeRecebedorPix.addEventListener('input', () => {
    contadorNomeRecebedorPix.textContent = `${inputNomeRecebedorPix.value.length}/25`;
  });
  inputCidadeRecebedorPix.addEventListener('input', () => {
    contadorCidadeRecebedorPix.textContent = `${inputCidadeRecebedorPix.value.length}/15`;
  });

  formPix.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    alertaPix.classList.remove('is-visible');
    btnSalvarPix.disabled = true;
    textoBtnSalvarPix.textContent = 'Salvando...';

    try {
      const configuracaoAtualizada = await atualizarConfiguracaoPix(token, {
        chavePix: inputChavePix.value.trim(),
        nomeRecebedorPix: inputNomeRecebedorPix.value.trim(),
        cidadeRecebedorPix: inputCidadeRecebedorPix.value.trim(),
      });
      preencherFormularioPix(configuracaoAtualizada);
      mostrarAlertaPix('Chave Pix atualizada.', { tipo: 'sucesso' });
    } catch (erro) {
      mostrarAlertaPix(erro instanceof ApiError ? erro.message : 'Não foi possível salvar.', { tipo: 'erro' });
    } finally {
      btnSalvarPix.disabled = false;
      textoBtnSalvarPix.textContent = 'Salvar';
    }
  });

  formTolerancia.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    alertaTolerancia.classList.remove('is-visible');
    btnSalvarTolerancia.disabled = true;
    textoBtnSalvarTolerancia.textContent = 'Salvando...';

    try {
      const resultado = await atualizarToleranciaSindicato(token, {
        toleranciaCentavos: Math.round(Number(inputTolerancia.value) * 100),
      });
      inputTolerancia.value = (resultado.toleranciaCentavos / 100).toFixed(2);
      mostrarAlertaTolerancia('Tolerância atualizada.', { tipo: 'sucesso' });
    } catch (erro) {
      mostrarAlertaTolerancia(erro instanceof ApiError ? erro.message : 'Não foi possível salvar.', { tipo: 'erro' });
    } finally {
      btnSalvarTolerancia.disabled = false;
      textoBtnSalvarTolerancia.textContent = 'Salvar';
    }
  });
}

void inicializar();
