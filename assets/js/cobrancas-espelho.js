// Espelho de Cobrança (Fase 4/Fatia A) — visão do tenant inteiro, uma linha
// por empresa. RN-ESP-* (07-regras-de-negocio-e-seguranca.md, seção 13) e
// guia-front-end-fatia-a.md, seção 3.3.
import { obterEspelhoCobranca, baixarRelatorioEspelhoCsv, ApiError } from './api.js';
import { obterToken } from './auth-storage.js';
import { montarShell } from './shell.js';
import {
  escaparHtml,
  formatarMoeda,
  formatarData,
  formatarDataHora,
  formatarCompetencia,
  competenciaAtual,
  renderizarPaginacao,
  renderizarLinhasEsqueleto,
  renderizarTabelaVazia,
  renderizarEstadoPagina,
} from './ui.js';
import { renderizarCartoesTotais, renderizarInconsistencias } from './espelho-shared.js';

// RN-ESP-*/guia Fatia A, seção 3.3: mesma régua de perfis de
// GET /dashboard/metrics e GET /reports/filiados — SECRETARIO/ASSISTENTE
// continuam vendo o cadastro de empresas, não quanto cada uma deve.
const PERFIS_PERMITIDOS = ['ADMIN', 'TESOUREIRO'];
const COLUNAS_TABELA = 4;

const container = document.getElementById('conteudo-espelho');
const form = document.getElementById('form-filtros-espelho');
const inputCompetencia = document.getElementById('filtro-competencia-espelho');
const checkboxIncluirZerados = document.getElementById('filtro-incluir-zerados');
const alerta = document.getElementById('alerta-espelho');
const alertaTexto = document.getElementById('alerta-espelho-texto');
const metadados = document.getElementById('espelho-metadados');
const secaoTotais = document.getElementById('secao-totais-espelho');
const areaInconsistencias = document.getElementById('area-inconsistencias-espelho');
const corpoTabela = document.getElementById('corpo-tabela');
const areaPaginacao = document.getElementById('area-paginacao');
const btnExportar = document.getElementById('btn-exportar-espelho-csv');
const textoBtnExportar = document.getElementById('texto-btn-exportar-espelho-csv');

let estado = { page: 1, limit: 20 };

function esconderAlerta() {
  alerta.classList.remove('is-visible');
}

function mostrarAlerta(mensagem) {
  alertaTexto.textContent = mensagem;
  alerta.classList.add('alert--error', 'is-visible');
}

function filtrosAtuais() {
  return {
    competencia: inputCompetencia.value,
    incluirZerados: checkboxIncluirZerados.checked || undefined,
  };
}

function renderizarLinhas(empresas) {
  corpoTabela.innerHTML = empresas
    .map(
      (empresa) => `
        <tr class="linha-clicavel" data-id="${escaparHtml(empresa.empresaId)}">
          <td>${escaparHtml(empresa.razaoSocial)}</td>
          <td>${escaparHtml(empresa.cnpj)}</td>
          <td>${empresa.quantidadeFiliados}</td>
          <td>${formatarMoeda(empresa.valorTotalCentavos)}</td>
        </tr>
      `,
    )
    .join('');

  corpoTabela.querySelectorAll('tr.linha-clicavel').forEach((linha) => {
    linha.addEventListener('click', () => {
      window.location.href = `empresa-detalhe.html?id=${encodeURIComponent(linha.dataset.id)}`;
    });
  });
}

async function carregarEspelho() {
  esconderAlerta();
  metadados.textContent = '';
  secaoTotais.innerHTML = '';
  areaInconsistencias.innerHTML = '';
  renderizarLinhasEsqueleto(corpoTabela, COLUNAS_TABELA);
  areaPaginacao.innerHTML = '';

  try {
    const resposta = await obterEspelhoCobranca(obterToken(), { ...estado, ...filtrosAtuais() });

    // geradoEm não é enfeite (guia Fatia A): o espelho é calculado ao vivo,
    // não é congelado — mostrar sempre explica duas consultas divergentes.
    metadados.textContent = `Competência ${formatarCompetencia(resposta.competencia)} · Data de referência ${formatarData(resposta.dataReferencia)} · Gerado em ${formatarDataHora(resposta.geradoEm)}`;
    secaoTotais.innerHTML = renderizarCartoesTotais(resposta.totais);
    areaInconsistencias.innerHTML = renderizarInconsistencias(resposta.inconsistencias);

    if (resposta.data.length === 0) {
      renderizarTabelaVazia(corpoTabela, COLUNAS_TABELA, {
        icone: 'fa-inbox',
        titulo: 'Nenhuma empresa nesta competência',
        mensagem: 'Ajuste os filtros ou a competência e tente novamente.',
      });
      return;
    }

    renderizarLinhas(resposta.data);
    renderizarPaginacao(areaPaginacao, resposta.pagination, (novaPagina) => {
      estado.page = novaPagina;
      void carregarEspelho();
    });
  } catch (erro) {
    metadados.textContent = '';
    const mensagem = erro instanceof ApiError ? erro.message : 'Não foi possível carregar o espelho agora.';
    renderizarTabelaVazia(corpoTabela, COLUNAS_TABELA, {
      icone: 'fa-triangle-exclamation',
      titulo: 'Erro ao carregar',
      mensagem,
    });
  }
}

form.addEventListener('submit', (evento) => {
  evento.preventDefault();
  if (!inputCompetencia.value) {
    mostrarAlerta('Selecione a competência.');
    return;
  }
  estado = { ...estado, page: 1 };
  void carregarEspelho();
});

btnExportar.addEventListener('click', async () => {
  if (!inputCompetencia.value) {
    mostrarAlerta('Selecione a competência antes de exportar.');
    return;
  }
  esconderAlerta();
  btnExportar.disabled = true;
  textoBtnExportar.textContent = 'Gerando...';

  try {
    await baixarRelatorioEspelhoCsv(obterToken(), { competencia: inputCompetencia.value });
  } catch (erro) {
    mostrarAlerta(erro instanceof ApiError ? erro.message : 'Não foi possível gerar o relatório. Tente novamente.');
  } finally {
    btnExportar.disabled = false;
    textoBtnExportar.textContent = 'Exportar CSV';
  }
});

async function inicializar() {
  const usuario = await montarShell({ itemAtivo: 'espelho' });
  if (!usuario) return;

  if (!PERFIS_PERMITIDOS.includes(usuario.perfil)) {
    renderizarEstadoPagina(container, {
      icone: 'fa-lock',
      titulo: 'Sem permissão',
      mensagem: 'Seu perfil não tem acesso ao espelho de cobrança.',
    });
    return;
  }

  // Competência futura é 400 (RN-ESP-05) — trava com `max` pra não deixar
  // escolher algo que a API vai recusar de todo jeito.
  inputCompetencia.max = competenciaAtual();
  inputCompetencia.value = competenciaAtual();
  btnExportar.hidden = false;

  await carregarEspelho();
}

void inicializar();
