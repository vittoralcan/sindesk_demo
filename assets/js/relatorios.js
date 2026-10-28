import { obterRelatorio, baixarRelatorioCsv, ApiError } from './api.js';
import { obterToken } from './auth-storage.js';
import { montarShell } from './shell.js';
import {
  escaparHtml,
  renderizarBadgeStatus,
  formatarCpf,
  formatarData,
  renderizarPaginacao,
  renderizarLinhasEsqueleto,
  renderizarTabelaVazia,
  renderizarEstadoPagina,
} from './ui.js';
import { inicializarSelectCustomizado } from './custom-select.js';
import { inicializarDatePickerCustomizado } from './custom-date-picker.js';

// RN-REL-01 (07-regras-de-negocio-e-seguranca.md): exportação em massa é
// superfície de exfiltração diferente da listagem paginada — mesma régua
// restrita do Dashboard, nem SECRETARIO nem ASSISTENTE (que continuam
// vendo os mesmos dados via GET /filiados, só não exportam em lote).
const PERFIS_PERMITIDOS = ['ADMIN', 'TESOUREIRO'];
const COLUNAS_TABELA = 6;

const container = document.getElementById('conteudo-relatorios');
const formFiltros = document.getElementById('form-filtros-relatorio');
const selectStatus = document.getElementById('filtro-status');
const inputDataInicio = document.getElementById('filtro-data-inicio');
const inputDataFim = document.getElementById('filtro-data-fim');
const corpoTabela = document.getElementById('corpo-tabela');
const areaPaginacao = document.getElementById('area-paginacao');
const alertaEl = document.getElementById('alerta-relatorio');
const alertaTextoEl = document.getElementById('alerta-relatorio-texto');
const btnExportar = document.getElementById('btn-exportar-csv');
const textoBtnExportar = document.getElementById('texto-btn-exportar-csv');

let estado = { page: 1, limit: 20, status: '', dataInicioFiliacao: '', dataFimFiliacao: '' };

function mostrarAlerta(mensagem) {
  alertaTextoEl.textContent = mensagem;
  alertaEl.classList.add('alert--error', 'is-visible');
}

function esconderAlerta() {
  alertaEl.classList.remove('is-visible');
}

function filtrosAtuais() {
  return {
    status: selectStatus.value,
    dataInicioFiliacao: inputDataInicio.value,
    dataFimFiliacao: inputDataFim.value,
  };
}

function renderizarLinhas(itens) {
  corpoTabela.innerHTML = itens
    .map(
      (item) => `
        <tr>
          <td>${escaparHtml(item.nomeCompleto)}</td>
          <td>${formatarCpf(item.cpf)}</td>
          <td>${escaparHtml(item.matricula ?? '—')}</td>
          <td>${renderizarBadgeStatus(item.statusCadastral)}</td>
          <td>${formatarData(item.dataFiliacao)}</td>
          <td>${formatarData(item.dataVigenciaFim)}</td>
        </tr>
      `,
    )
    .join('');
}

// Bug #5 do relatório de QA de 2026-09-21 (mesma causa de filiados.js): sem
// essa trava, a resposta de uma busca mais antiga (ainda em voo) podia
// chegar depois de uma busca filtrada mais recente e sobrescrever a tabela.
let requisicaoAtual = 0;

async function carregarPreview() {
  const idRequisicao = ++requisicaoAtual;
  esconderAlerta();
  renderizarLinhasEsqueleto(corpoTabela, COLUNAS_TABELA);
  areaPaginacao.innerHTML = '';

  try {
    const resposta = await obterRelatorio(obterToken(), estado);
    if (idRequisicao !== requisicaoAtual) return;

    if (resposta.data.length === 0) {
      renderizarTabelaVazia(corpoTabela, COLUNAS_TABELA, {
        icone: 'fa-inbox',
        titulo: 'Nenhum filiado encontrado',
        mensagem: 'Ajuste os filtros e tente novamente.',
      });
      return;
    }

    renderizarLinhas(resposta.data);
    renderizarPaginacao(areaPaginacao, resposta.pagination, (novaPagina) => {
      estado.page = novaPagina;
      void carregarPreview();
    });
  } catch (erro) {
    if (idRequisicao !== requisicaoAtual) return;
    const mensagem = erro instanceof ApiError ? erro.message : 'Não foi possível carregar a prévia agora.';
    renderizarTabelaVazia(corpoTabela, COLUNAS_TABELA, {
      icone: 'fa-triangle-exclamation',
      titulo: 'Erro ao carregar',
      mensagem,
    });
  }
}

formFiltros.addEventListener('submit', (evento) => {
  evento.preventDefault();
  estado = { ...estado, page: 1, ...filtrosAtuais() };
  void carregarPreview();
});

btnExportar.addEventListener('click', async () => {
  esconderAlerta();
  btnExportar.disabled = true;
  textoBtnExportar.textContent = 'Gerando...';

  try {
    // O teto de 10.000 linhas (RN-REL-02) é verificado pela API antes de
    // qualquer linha ser buscada — se exceder, cai direto no catch abaixo
    // com a mensagem já orientando a filtrar mais (vem pronta do backend).
    await baixarRelatorioCsv(obterToken(), filtrosAtuais());
  } catch (erro) {
    mostrarAlerta(erro instanceof ApiError ? erro.message : 'Não foi possível gerar o relatório. Tente novamente.');
  } finally {
    btnExportar.disabled = false;
    textoBtnExportar.textContent = 'Exportar CSV';
  }
});

async function inicializar() {
  const usuario = await montarShell({ itemAtivo: 'relatorios' });
  if (!usuario) return;

  if (!PERFIS_PERMITIDOS.includes(usuario.perfil)) {
    renderizarEstadoPagina(container, {
      icone: 'fa-lock',
      titulo: 'Sem permissão',
      mensagem: 'Seu perfil não tem acesso a relatórios.',
    });
    return;
  }

  inicializarSelectCustomizado(selectStatus);
  inicializarDatePickerCustomizado(inputDataInicio);
  inicializarDatePickerCustomizado(inputDataFim);

  await carregarPreview();
}

void inicializar();
