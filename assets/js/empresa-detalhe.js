import { obterEmpresa, obterEspelhoEmpresa, ApiError } from './api.js';
import { obterToken } from './auth-storage.js';
import { montarShell } from './shell.js';
import {
  escaparHtml,
  renderizarBadgeStatus,
  renderizarEstadoPagina,
  formatarMoeda,
  formatarData,
  formatarDataHora,
  formatarCompetencia,
  competenciaAtual,
  renderizarPaginacao,
  renderizarLinhasEsqueleto,
  renderizarTabelaVazia,
} from './ui.js';
import { renderizarCartoesTotais, renderizarInconsistencias } from './espelho-shared.js';
import { abrirModalAlterarStatusEmpresa } from './acao-alterar-status-empresa.js';

// RN-EMP-* (07-regras-de-negocio-e-seguranca.md, guia Fatia A): editar é
// ADMIN/SECRETARIO (mesmo perfil de filiados); alterar status é ADMIN only.
const PERFIS_EDITAR = ['ADMIN', 'SECRETARIO'];
const PERFIS_ALTERAR_STATUS = ['ADMIN'];
// RN-ESP-*/guia Fatia A, seção 3.3: espelho de cobrança é ADMIN/TESOUREIRO
// só — SECRETARIO/ASSISTENTE continuam vendo o cadastro, não quanto a
// empresa deve.
const PERFIS_ESPELHO = ['ADMIN', 'TESOUREIRO'];
const COLUNAS_TABELA_ESPELHO = 4;

let estadoEspelho = { page: 1, limit: 20 };

const container = document.getElementById('conteudo-detalhe');

function obterIdDaUrl() {
  return new URLSearchParams(window.location.search).get('id');
}

function itemDado(label, valorHtml) {
  return `
    <div class="item-dado">
      <span class="label">${escaparHtml(label)}</span>
      <span class="valor">${valorHtml}</span>
    </div>
  `;
}

function renderizarBotaoAcao({ id, label, icone, href, disponivel = true }) {
  const idAttr = id ? ` id="${id}"` : '';
  const conteudo = `<i class="fa-solid ${icone}" aria-hidden="true"></i> ${escaparHtml(label)}`;
  const classes = 'btn-ghost btn-acao';

  if (!disponivel) {
    return `<button type="button"${idAttr} class="${classes} btn-acao--desabilitada" disabled>${conteudo}</button>`;
  }
  if (href) {
    return `<a href="${href}"${idAttr} class="${classes}">${conteudo}</a>`;
  }
  return `<button type="button"${idAttr} class="${classes}">${conteudo}</button>`;
}

function renderizarAcoes(usuario, empresa) {
  const acoes = [];

  if (PERFIS_EDITAR.includes(usuario.perfil)) {
    acoes.push(
      renderizarBotaoAcao({
        label: 'Editar',
        icone: 'fa-pen',
        href: `empresa-formulario.html?id=${encodeURIComponent(empresa.id)}`,
      }),
    );
  }

  if (PERFIS_ALTERAR_STATUS.includes(usuario.perfil)) {
    acoes.push(renderizarBotaoAcao({ id: 'btn-alterar-status', label: 'Alterar status', icone: 'fa-right-left' }));
  }

  return acoes.join('');
}

function renderizarConteudo(usuario, empresa) {
  container.innerHTML = `
    <a href="empresas.html" class="link-voltar"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Voltar para Empresas</a>

    <div class="pagina-cabecalho">
      <div class="detalhe-titulo">
        <h1>${escaparHtml(empresa.razaoSocial)}</h1>
        ${renderizarBadgeStatus(empresa.status)}
      </div>
      <div class="detalhe-acoes">${renderizarAcoes(usuario, empresa)}</div>
    </div>

    <div class="secoes-detalhe">
      <fieldset class="secao-detalhe">
        <legend>Dados cadastrais</legend>
        <div class="grid-dados">
          ${itemDado('Razão social', escaparHtml(empresa.razaoSocial))}
          ${itemDado('Nome fantasia', escaparHtml(empresa.nomeFantasia ?? '—'))}
          ${itemDado('CNPJ', escaparHtml(empresa.cnpj))}
          ${itemDado('E-mail de contato', escaparHtml(empresa.emailContato ?? '—'))}
          ${itemDado('Telefone de contato', escaparHtml(empresa.telefoneContato ?? '—'))}
          ${itemDado('Responsável', escaparHtml(empresa.responsavelNome ?? '—'))}
        </div>
      </fieldset>

      <fieldset class="secao-detalhe">
        <legend>Endereço</legend>
        <div class="grid-dados">
          ${itemDado('CEP', escaparHtml(empresa.cep ?? '—'))}
          ${itemDado('Logradouro', escaparHtml(empresa.logradouro ?? '—'))}
          ${itemDado('Número', escaparHtml(empresa.numero ?? '—'))}
          ${itemDado('Bairro', escaparHtml(empresa.bairro ?? '—'))}
          ${itemDado('Município', escaparHtml(empresa.municipio ?? '—'))}
          ${itemDado('UF', escaparHtml(empresa.uf ?? '—'))}
        </div>
      </fieldset>

      <fieldset class="secao-detalhe">
        <legend>Indicadores</legend>
        <div class="grid-dados">
          ${itemDado('Filiados ativos vinculados', escaparHtml(String(empresa.filiadosAtivos ?? 0)))}
          ${itemDado('Valor mensal estimado', formatarMoeda(empresa.valorMensalEstimadoCentavos))}
        </div>
      </fieldset>

      ${
        empresa.observacoes
          ? `<fieldset class="secao-detalhe">
              <legend>Observações</legend>
              <p class="texto-observacoes">${escaparHtml(empresa.observacoes)}</p>
            </fieldset>`
          : ''
      }

      ${
        PERFIS_ESPELHO.includes(usuario.perfil)
          ? `<fieldset class="secao-detalhe">
              <legend>Espelho de cobrança</legend>
              <form id="form-espelho-empresa" class="barra-filtros">
                <div class="campo-formulario">
                  <label for="input-competencia-espelho-empresa">Competência</label>
                  <input type="month" id="input-competencia-espelho-empresa" pattern="\\d{4}-\\d{2}" required>
                </div>
                <button type="submit" class="btn-ghost">
                  <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i> Consultar
                </button>
                <a href="gerar-pix.html?empresaId=${encodeURIComponent(empresa.id)}" class="btn-ghost btn-acao" id="link-gerar-pix-empresa">
                  <i class="fa-solid fa-qrcode" aria-hidden="true"></i> Gerar Pix
                </a>
              </form>

              <div id="alerta-espelho-empresa" class="alert" role="alert" aria-live="polite">
                <i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i>
                <span id="alerta-espelho-empresa-texto"></span>
              </div>

              <p class="subsecao-vazia" id="espelho-empresa-metadados"></p>
              <div id="secao-totais-espelho-empresa"></div>
              <div id="area-inconsistencias-espelho-empresa"></div>

              <div class="tabela-wrapper">
                <table class="tabela">
                  <thead>
                    <tr>
                      <th>Filiado</th>
                      <th>Matrícula</th>
                      <th>Plano</th>
                      <th>Valor</th>
                    </tr>
                  </thead>
                  <tbody id="corpo-tabela-espelho-empresa"></tbody>
                </table>
              </div>
              <div id="area-paginacao-espelho-empresa" class="paginacao"></div>
            </fieldset>`
          : ''
      }
    </div>
  `;

  document.getElementById('btn-alterar-status')?.addEventListener('click', () => {
    abrirModalAlterarStatusEmpresa({
      empresa,
      token: obterToken(),
      aoConcluir: () => {
        void carregarERenderizar(usuario, empresa.id);
      },
    });
  });

  if (PERFIS_ESPELHO.includes(usuario.perfil)) {
    inicializarEspelho(empresa.id);
  }
}

function renderizarLinhasEspelho(filiados) {
  const corpoTabela = document.getElementById('corpo-tabela-espelho-empresa');
  corpoTabela.innerHTML = filiados
    .map(
      (filiado) => `
        <tr>
          <td>${escaparHtml(filiado.nomeCompleto)}</td>
          <td>${escaparHtml(filiado.matricula ?? '—')}</td>
          <td>${escaparHtml(filiado.planoCodigo)}</td>
          <td>${formatarMoeda(filiado.valorCentavos)}</td>
        </tr>
      `,
    )
    .join('');
}

async function carregarEspelhoEmpresa(empresaId, competencia) {
  const alerta = document.getElementById('alerta-espelho-empresa');
  const alertaTexto = document.getElementById('alerta-espelho-empresa-texto');
  const metadados = document.getElementById('espelho-empresa-metadados');
  const secaoTotais = document.getElementById('secao-totais-espelho-empresa');
  const areaInconsistencias = document.getElementById('area-inconsistencias-espelho-empresa');
  const corpoTabela = document.getElementById('corpo-tabela-espelho-empresa');
  const areaPaginacao = document.getElementById('area-paginacao-espelho-empresa');

  alerta.classList.remove('is-visible');
  metadados.textContent = '';
  secaoTotais.innerHTML = '';
  areaInconsistencias.innerHTML = '';
  renderizarLinhasEsqueleto(corpoTabela, COLUNAS_TABELA_ESPELHO);
  areaPaginacao.innerHTML = '';

  try {
    const resposta = await obterEspelhoEmpresa(obterToken(), empresaId, { ...estadoEspelho, competencia });

    metadados.textContent = `Competência ${formatarCompetencia(resposta.competencia)} · Data de referência ${formatarData(resposta.dataReferencia)} · Gerado em ${formatarDataHora(resposta.geradoEm)}`;
    secaoTotais.innerHTML = renderizarCartoesTotais(resposta.totais);
    areaInconsistencias.innerHTML = renderizarInconsistencias(resposta.inconsistencias);

    if (resposta.data.length === 0) {
      renderizarTabelaVazia(corpoTabela, COLUNAS_TABELA_ESPELHO, {
        icone: 'fa-inbox',
        titulo: 'Nenhum filiado cobrável nesta competência',
        mensagem: 'Ajuste a competência e tente novamente.',
      });
      return;
    }

    renderizarLinhasEspelho(resposta.data);
    renderizarPaginacao(areaPaginacao, resposta.pagination, (novaPagina) => {
      estadoEspelho.page = novaPagina;
      void carregarEspelhoEmpresa(empresaId, competencia);
    });
  } catch (erro) {
    metadados.textContent = '';
    alertaTexto.textContent = erro instanceof ApiError ? erro.message : 'Não foi possível carregar o espelho agora.';
    alerta.classList.add('alert--error', 'is-visible');
    renderizarTabelaVazia(corpoTabela, COLUNAS_TABELA_ESPELHO, {
      icone: 'fa-triangle-exclamation',
      titulo: 'Erro ao carregar',
    });
  }
}

function inicializarEspelho(empresaId) {
  const form = document.getElementById('form-espelho-empresa');
  const inputCompetencia = document.getElementById('input-competencia-espelho-empresa');
  const linkGerarPix = document.getElementById('link-gerar-pix-empresa');

  // Competência futura é 400 (RN-ESP-05) — trava com `max`, e o link
  // "Gerar Pix" reaproveita a mesma competência já consultada aqui (o valor
  // do Pix vem do mesmo cálculo do espelho — guia-front-end-pix-manual.md).
  inputCompetencia.max = competenciaAtual();
  inputCompetencia.value = competenciaAtual();

  function atualizarLinkGerarPix() {
    linkGerarPix.href = `gerar-pix.html?empresaId=${encodeURIComponent(empresaId)}&competencia=${encodeURIComponent(inputCompetencia.value)}`;
  }
  atualizarLinkGerarPix();
  inputCompetencia.addEventListener('change', atualizarLinkGerarPix);

  form.addEventListener('submit', (evento) => {
    evento.preventDefault();
    estadoEspelho = { page: 1, limit: 20 };
    void carregarEspelhoEmpresa(empresaId, inputCompetencia.value);
  });

  void carregarEspelhoEmpresa(empresaId, inputCompetencia.value);
}

async function carregarERenderizar(usuario, id) {
  try {
    const empresa = await obterEmpresa(obterToken(), id);
    renderizarConteudo(usuario, empresa);
  } catch (erro) {
    const notFound = erro instanceof ApiError && erro.statusCode === 404;
    renderizarEstadoPagina(container, {
      icone: notFound ? 'fa-circle-question' : 'fa-triangle-exclamation',
      titulo: notFound ? 'Empresa não encontrada' : 'Não foi possível carregar',
      mensagem: erro instanceof ApiError ? erro.message : 'Tente novamente em instantes.',
    });
  }
}

async function inicializar() {
  const usuario = await montarShell({ itemAtivo: 'empresas' });
  if (!usuario) return;

  const id = obterIdDaUrl();
  if (!id) {
    renderizarEstadoPagina(container, {
      icone: 'fa-circle-question',
      titulo: 'Nenhuma empresa especificada',
      mensagem: 'Volte para a listagem e selecione uma empresa.',
    });
    return;
  }

  container.innerHTML = `
    <div class="estado-generico">
      <i class="fa-solid fa-spinner fa-spin-pulse" aria-hidden="true"></i>
      <span>Carregando...</span>
    </div>
  `;

  await carregarERenderizar(usuario, id);
}

void inicializar();
