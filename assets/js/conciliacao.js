// Painel de Conciliação (Fase 4/Fatia C) — RN-CON-* (07-regras-de-negocio-
// e-seguranca.md, seção 14) e guia-front-end-fatia-c.md, seção 2.2.
import { obterConciliacao, baixarRelatorioConciliacaoCsv, ApiError } from './api.js';
import { obterToken } from './auth-storage.js';
import { montarShell } from './shell.js';
import {
  escaparHtml,
  formatarMoeda,
  formatarDataHora,
  formatarCompetencia,
  competenciaAtual,
  renderizarBadgeStatus,
  renderizarPaginacao,
  renderizarLinhasEsqueleto,
  renderizarTabelaVazia,
  renderizarEstadoPagina,
} from './ui.js';
import { inicializarSelectCustomizado } from './custom-select.js';

const PERFIS_PERMITIDOS = ['ADMIN', 'TESOUREIRO'];
const COLUNAS_TABELA = 8;

// RN-CON-05: as 5 situações, na ordem em que o resumo as expõe.
const SITUACOES_RESUMO = [
  { chave: 'empresasConciliadas', codigo: 'CONCILIADO', label: 'Conciliadas' },
  { chave: 'empresasNaoRecebidas', codigo: 'NAO_RECEBIDO', label: 'Não recebidas' },
  { chave: 'empresasRecebidoAMenor', codigo: 'RECEBIDO_A_MENOR', label: 'Recebido a menor' },
  { chave: 'empresasRecebidoAMaior', codigo: 'RECEBIDO_A_MAIOR', label: 'Recebido a maior' },
  { chave: 'empresasSemEsperado', codigo: 'SEM_ESPERADO', label: 'Sem esperado' },
];

const container = document.getElementById('conteudo-conciliacao');
const form = document.getElementById('form-filtros-conciliacao');
const inputCompetencia = document.getElementById('filtro-competencia-conciliacao');
const selectSituacao = document.getElementById('filtro-situacao-conciliacao');
const alerta = document.getElementById('alerta-conciliacao');
const alertaTexto = document.getElementById('alerta-conciliacao-texto');
const metadados = document.getElementById('conciliacao-metadados');
const secaoTotais = document.getElementById('secao-totais-conciliacao');
const areaResumoSituacoes = document.getElementById('area-resumo-situacoes-conciliacao');
const corpoTabela = document.getElementById('corpo-tabela');
const areaPaginacao = document.getElementById('area-paginacao');
const btnExportar = document.getElementById('btn-exportar-conciliacao-csv');
const textoBtnExportar = document.getElementById('texto-btn-exportar-conciliacao-csv');

let estado = { page: 1, limit: 20 };

function esconderAlerta() {
  alerta.classList.remove('is-visible');
}

function mostrarAlerta(mensagem) {
  alertaTexto.textContent = mensagem;
  alerta.classList.add('alert--error', 'is-visible');
}

function filtrosAtuais() {
  return { competencia: inputCompetencia.value, situacao: selectSituacao.value };
}

function renderizarCartoesResumo(resumo) {
  secaoTotais.innerHTML = `
    <div class="grade-metricas">
      <div class="cartao-metrica">
        <span class="cartao-metrica-label">Valor esperado</span>
        <span class="cartao-metrica-valor">${formatarMoeda(resumo.valorEsperadoCentavos)}</span>
      </div>
      <div class="cartao-metrica">
        <span class="cartao-metrica-label">Valor recebido</span>
        <span class="cartao-metrica-valor">${formatarMoeda(resumo.valorRecebidoCentavos)}</span>
      </div>
      <div class="cartao-metrica cartao-metrica--destaque">
        <span class="cartao-metrica-label">Divergência</span>
        <span class="cartao-metrica-valor">${formatarMoeda(resumo.divergenciaCentavos)}</span>
      </div>
    </div>
  `;

  areaResumoSituacoes.innerHTML = `
    <div class="lista-resumo-situacoes">
      ${SITUACOES_RESUMO.map(
        ({ chave, codigo, label }) => `
          <div class="item-resumo-situacao">
            ${renderizarBadgeStatus(codigo)}
            <span class="item-resumo-situacao-valor">${resumo[chave]}</span>
            <span class="item-resumo-situacao-label">${escaparHtml(label)}</span>
          </div>
        `,
      ).join('')}
    </div>
  `;
}

function renderizarLinhas(empresas) {
  corpoTabela.innerHTML = empresas
    .map(
      (empresa) => `
        <tr>
          <td>${escaparHtml(empresa.razaoSocial)}</td>
          <td>${empresa.quantidadeFiliados}</td>
          <td>${formatarMoeda(empresa.valorEsperadoCentavos)}</td>
          <td>${formatarMoeda(empresa.valorRecebidoCentavos)}</td>
          <td>${formatarMoeda(empresa.divergenciaCentavos)}</td>
          <td>${renderizarBadgeStatus(empresa.situacao)}</td>
          <td>${empresa.filiadosEquivalentes ?? '—'}</td>
          <td>
            <a href="conciliacao-evolucao.html?empresaId=${encodeURIComponent(empresa.empresaId)}" class="btn-acao-linha" title="Ver evolução">
              <i class="fa-solid fa-chart-line" aria-hidden="true"></i>
            </a>
          </td>
        </tr>
      `,
    )
    .join('');
}

async function carregarConciliacao() {
  esconderAlerta();
  metadados.textContent = '';
  secaoTotais.innerHTML = '';
  areaResumoSituacoes.innerHTML = '';
  renderizarLinhasEsqueleto(corpoTabela, COLUNAS_TABELA);
  areaPaginacao.innerHTML = '';

  try {
    const resposta = await obterConciliacao(obterToken(), { ...estado, ...filtrosAtuais() });

    metadados.textContent = `Competência ${formatarCompetencia(resposta.competencia)} · Tolerância ${formatarMoeda(resposta.toleranciaCentavos)} · Gerado em ${formatarDataHora(resposta.geradoEm)}`;
    renderizarCartoesResumo(resposta.resumo);

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
      void carregarConciliacao();
    });
  } catch (erro) {
    metadados.textContent = '';
    const mensagem = erro instanceof ApiError ? erro.message : 'Não foi possível carregar a conciliação agora.';
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
  void carregarConciliacao();
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
    await baixarRelatorioConciliacaoCsv(obterToken(), filtrosAtuais());
  } catch (erro) {
    mostrarAlerta(erro instanceof ApiError ? erro.message : 'Não foi possível gerar o relatório. Tente novamente.');
  } finally {
    btnExportar.disabled = false;
    textoBtnExportar.textContent = 'Exportar CSV';
  }
});

async function inicializar() {
  const usuario = await montarShell({ itemAtivo: 'conciliacao' });
  if (!usuario) return;

  if (!PERFIS_PERMITIDOS.includes(usuario.perfil)) {
    renderizarEstadoPagina(container, {
      icone: 'fa-lock',
      titulo: 'Sem permissão',
      mensagem: 'Seu perfil não tem acesso à conciliação.',
    });
    return;
  }

  inicializarSelectCustomizado(selectSituacao);

  // Competência futura é 400 (mesma régua do espelho) — trava com `max`.
  inputCompetencia.max = competenciaAtual();
  inputCompetencia.value = competenciaAtual();
  btnExportar.hidden = false;

  await carregarConciliacao();
}

void inicializar();
