// Recebimentos manuais (Fase 4/Fatia C) — RN-CON-* (07-regras-de-negocio-e-
// seguranca.md, seção 14) e guia-front-end-fatia-c.md, seção 2.1.
// SECRETARIO/ASSISTENTE não acessam nenhuma rota desta seção — a tela
// inteira é bloqueada pra eles, não só os botões de escrita.
import { listarRecebimentos, obterEmpresa, ApiError } from './api.js';
import { obterToken } from './auth-storage.js';
import { montarShell } from './shell.js';
import {
  escaparHtml,
  formatarMoeda,
  formatarData,
  formatarCompetencia,
  renderizarPaginacao,
  renderizarLinhasEsqueleto,
  renderizarTabelaVazia,
  renderizarEstadoPagina,
} from './ui.js';
import { inicializarEmpresaSelect } from './empresa-select.js';
import { abrirModalCriarRecebimento } from './acao-criar-recebimento.js';
import { abrirModalEstornarRecebimento } from './acao-estornar-recebimento.js';

const PERFIS_PERMITIDOS = ['ADMIN', 'TESOUREIRO'];
// RN-CON-03: estornar é mais restrito que lançar — só ADMIN.
const PERFIS_ESTORNAR = ['ADMIN'];
const COLUNAS_TABELA = 7;

const LABELS_ORIGEM = {
  MANUAL: 'Manual',
  IMPORTACAO: 'Importação',
  WEBHOOK: 'Webhook',
};

const container = document.getElementById('conteudo-recebimentos');
const form = document.getElementById('form-filtros-recebimentos');
const elementoEmpresaSelect = document.getElementById('filtro-empresa-select');
const inputCompetencia = document.getElementById('filtro-competencia-recebimento');
const inputDataInicio = document.getElementById('filtro-data-inicio-recebimento');
const inputDataFim = document.getElementById('filtro-data-fim-recebimento');
const selectOrigem = document.getElementById('filtro-origem-recebimento');
const selectOrdenar = document.getElementById('ordenar-recebimentos');
const corpoTabela = document.getElementById('corpo-tabela');
const areaPaginacao = document.getElementById('area-paginacao');
const acoesRecebimentos = document.getElementById('acoes-recebimentos');
const btnNovoRecebimento = document.getElementById('btn-novo-recebimento');

let estado = { page: 1, limit: 20, sort: '-dataRecebimento' };
let empresaFiltroId = '';
let usuarioAtual = null;

// GET /recebimentos não devolve razaoSocial (só empresaId) — resolve o nome
// consultando cada empresa distinta da página atual, uma vez por página.
async function mapearEmpresasPorId(token, ids) {
  const unicos = [...new Set(ids)];
  const empresas = await Promise.all(unicos.map((id) => obterEmpresa(token, id).catch(() => null)));
  const mapa = new Map();
  unicos.forEach((id, indice) => mapa.set(id, empresas[indice]));
  return mapa;
}

function renderizarLinhas(recebimentos, mapaEmpresas) {
  const podeEstornar = PERFIS_ESTORNAR.includes(usuarioAtual?.perfil);

  corpoTabela.innerHTML = recebimentos
    .map((recebimento) => {
      const ehEstorno = recebimento.valorCentavos < 0;
      const empresa = mapaEmpresas.get(recebimento.empresaId);
      return `
        <tr class="${ehEstorno ? 'linha-estorno' : ''}" data-id="${escaparHtml(recebimento.id)}">
          <td>${escaparHtml(empresa?.razaoSocial ?? '—')}</td>
          <td>${formatarCompetencia(recebimento.competencia)}</td>
          <td>${formatarMoeda(recebimento.valorCentavos)}${ehEstorno ? ' <span class="badge-status badge-status--neutro">Estorno</span>' : ''}</td>
          <td>${formatarData(recebimento.dataRecebimento)}</td>
          <td>${escaparHtml(LABELS_ORIGEM[recebimento.origem] ?? recebimento.origem)}</td>
          <td>${escaparHtml(recebimento.descricao ?? '—')}</td>
          <td>
            ${
              podeEstornar
                ? `<button type="button" class="btn-acao-linha" data-acao="estornar" title="Estornar">
                     <i class="fa-solid fa-rotate-left" aria-hidden="true"></i>
                   </button>`
                : '—'
            }
          </td>
        </tr>
      `;
    })
    .join('');

  corpoTabela.querySelectorAll('button[data-acao="estornar"]').forEach((botao) => {
    botao.addEventListener('click', () => {
      const linha = botao.closest('tr');
      const recebimento = recebimentos.find((r) => r.id === linha.dataset.id);
      if (!recebimento) return;

      abrirModalEstornarRecebimento({
        recebimento,
        token: obterToken(),
        aoConcluir: () => {
          void carregarRecebimentos();
        },
      });
    });
  });
}

function filtrosAtuais() {
  return {
    empresaId: empresaFiltroId,
    competencia: inputCompetencia.value,
    dataInicio: inputDataInicio.value,
    dataFim: inputDataFim.value,
    origem: selectOrigem.value,
    sort: selectOrdenar.value,
  };
}

async function carregarRecebimentos() {
  const token = obterToken();
  renderizarLinhasEsqueleto(corpoTabela, COLUNAS_TABELA);
  areaPaginacao.innerHTML = '';

  try {
    const resposta = await listarRecebimentos(token, estado);

    if (resposta.data.length === 0) {
      renderizarTabelaVazia(corpoTabela, COLUNAS_TABELA, {
        icone: 'fa-inbox',
        titulo: 'Nenhum recebimento encontrado',
        mensagem: 'Ajuste os filtros e tente novamente.',
      });
      return;
    }

    const mapaEmpresas = await mapearEmpresasPorId(
      token,
      resposta.data.map((r) => r.empresaId),
    );
    renderizarLinhas(resposta.data, mapaEmpresas);
    renderizarPaginacao(areaPaginacao, resposta.pagination, (novaPagina) => {
      estado.page = novaPagina;
      void carregarRecebimentos();
    });
  } catch (erro) {
    const mensagem = erro instanceof ApiError ? erro.message : 'Não foi possível carregar os recebimentos agora.';
    renderizarTabelaVazia(corpoTabela, COLUNAS_TABELA, {
      icone: 'fa-triangle-exclamation',
      titulo: 'Erro ao carregar',
      mensagem,
    });
  }
}

form.addEventListener('submit', (evento) => {
  evento.preventDefault();
  estado = { ...estado, page: 1, ...filtrosAtuais() };
  void carregarRecebimentos();
});

btnNovoRecebimento.addEventListener('click', () => {
  abrirModalCriarRecebimento({
    token: obterToken(),
    aoConcluir: () => {
      void carregarRecebimentos();
    },
  });
});

async function inicializar() {
  const usuario = await montarShell({ itemAtivo: 'recebimentos' });
  if (!usuario) return;

  if (!PERFIS_PERMITIDOS.includes(usuario.perfil)) {
    renderizarEstadoPagina(container, {
      icone: 'fa-lock',
      titulo: 'Sem permissão',
      mensagem: 'Seu perfil não tem acesso a recebimentos.',
    });
    return;
  }

  usuarioAtual = usuario;
  const token = obterToken();

  inicializarEmpresaSelect(elementoEmpresaSelect, {
    token,
    aoSelecionar: (empresa) => {
      empresaFiltroId = empresa?.id ?? '';
    },
  });

  acoesRecebimentos.hidden = false;

  await carregarRecebimentos();
}

void inicializar();
