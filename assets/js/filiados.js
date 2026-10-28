import { listarFiliados, ApiError } from './api.js';
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
} from './ui.js';
import { abrirModalAlterarStatus } from './acao-alterar-status.js';
import { inicializarSelectCustomizado } from './custom-select.js';

const COLUNAS_TABELA = 7;

const formFiltros = document.getElementById('form-filtros');
const inputNome = document.getElementById('filtro-nome');
const inputCpf = document.getElementById('filtro-cpf');
const inputMatricula = document.getElementById('filtro-matricula');
const selectStatus = document.getElementById('filtro-status');
const corpoTabela = document.getElementById('corpo-tabela');
const areaPaginacao = document.getElementById('area-paginacao');
const btnNovoFiliado = document.getElementById('btn-novo-filiado');

// Perfis com escrita em filiados (RN-FIL-* — POST/PUT/PATCH restritos a
// ADMIN/SECRETARIO).
const PERFIS_COM_ESCRITA = ['ADMIN', 'SECRETARIO'];

let estado = {
  page: 1,
  limit: 20,
  nome: '',
  cpf: '',
  matricula: '',
  status: '',
  sort: 'nomeCompleto',
};

// Preenchido em inicializar() — usado pra decidir se a coluna Ações mostra
// o botão de alterar status em cada linha.
let usuarioAtual = null;

function colunaAtualDoSort() {
  const campo = estado.sort.replace(/^-/, '');
  const direcao = estado.sort.startsWith('-') ? 'desc' : 'asc';
  return { campo, direcao };
}

function atualizarIndicadoresDeOrdenacao() {
  const { campo, direcao } = colunaAtualDoSort();
  document.querySelectorAll('th.ordenavel').forEach((th) => {
    th.classList.remove('ordenado-asc', 'ordenado-desc');
    if (th.dataset.sort === campo) {
      th.classList.add(direcao === 'asc' ? 'ordenado-asc' : 'ordenado-desc');
    }
  });
}

const PERFIS_ALTERAR_STATUS = ['ADMIN', 'SECRETARIO'];

function renderizarLinhas(filiados) {
  const podeAlterarStatus = PERFIS_ALTERAR_STATUS.includes(usuarioAtual?.perfil);

  corpoTabela.innerHTML = filiados
    .map(
      (filiado) => `
        <tr class="linha-clicavel" data-id="${escaparHtml(filiado.id)}">
          <td>${escaparHtml(filiado.nomeCompleto)}</td>
          <td>${formatarCpf(filiado.cpf)}</td>
          <td>${escaparHtml(filiado.matricula ?? '—')}</td>
          <td>${renderizarBadgeStatus(filiado.statusCadastral)}</td>
          <td>${formatarData(filiado.dataFiliacao)}</td>
          <td>${formatarData(filiado.dataVigenciaFim)}</td>
          <td>
            <button type="button" class="btn-acao-linha" data-acao="ver" title="Ver detalhes">
              <i class="fa-solid fa-eye" aria-hidden="true"></i>
            </button>
            ${
              podeAlterarStatus
                ? `<button type="button" class="btn-acao-linha" data-acao="alterar-status" title="Alterar status">
                     <i class="fa-solid fa-right-left" aria-hidden="true"></i>
                   </button>`
                : ''
            }
          </td>
        </tr>
      `,
    )
    .join('');

  corpoTabela.querySelectorAll('tr.linha-clicavel').forEach((linha) => {
    linha.addEventListener('click', () => {
      window.location.href = `filiado-detalhe.html?id=${encodeURIComponent(linha.dataset.id)}`;
    });
  });

  // Bug #13 do relatório de QA de 2026-09-21: a linha inteira já era
  // clicável (cursor + destaque de hover já existiam em components.css),
  // mas isso é imperceptível em telas touch, que não têm estado de hover —
  // este botão dá uma affordance explícita e sempre visível, igual à ação
  // de alterar status ao lado.
  corpoTabela.querySelectorAll('button[data-acao="ver"]').forEach((botao) => {
    botao.addEventListener('click', (evento) => {
      evento.stopPropagation();
      const linha = botao.closest('tr');
      window.location.href = `filiado-detalhe.html?id=${encodeURIComponent(linha.dataset.id)}`;
    });
  });

  corpoTabela.querySelectorAll('button[data-acao="alterar-status"]').forEach((botao) => {
    botao.addEventListener('click', (evento) => {
      evento.stopPropagation(); // não deve disparar a navegação da linha
      const linha = botao.closest('tr');
      const filiado = filiados.find((f) => f.id === linha.dataset.id);
      if (!filiado) return;

      abrirModalAlterarStatus({
        filiado,
        token: obterToken(),
        aoConcluir: () => {
          void carregarFiliados();
        },
      });
    });
  });
}

// Bug #5 do relatório de QA de 2026-09-21: a busca inicial (sem filtro),
// disparada por inicializar(), podia ainda estar em voo quando o usuário
// aplicava um filtro rápido — sem essa trava, a resposta da busca antiga
// (mais lenta) podia chegar DEPOIS da filtrada e sobrescrever a tabela com
// os dados errados. Um clique repetido "funcionava" só porque, na segunda
// vez, não havia mais nenhuma requisição concorrente mais antiga em voo.
// Cada chamada carimba um número; só a resposta da chamada mais recente é
// aplicada, as demais são silenciosamente descartadas.
let requisicaoAtual = 0;

async function carregarFiliados() {
  const idRequisicao = ++requisicaoAtual;
  const token = obterToken();
  renderizarLinhasEsqueleto(corpoTabela, COLUNAS_TABELA);
  areaPaginacao.innerHTML = '';
  atualizarIndicadoresDeOrdenacao();

  try {
    const resposta = await listarFiliados(token, estado);
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
      void carregarFiliados();
    });
  } catch (erro) {
    if (idRequisicao !== requisicaoAtual) return;
    const mensagem = erro instanceof ApiError ? erro.message : 'Não foi possível carregar os filiados agora.';
    renderizarTabelaVazia(corpoTabela, COLUNAS_TABELA, {
      icone: 'fa-triangle-exclamation',
      titulo: 'Erro ao carregar',
      mensagem,
    });
  }
}

formFiltros.addEventListener('submit', (evento) => {
  evento.preventDefault();
  estado = {
    ...estado,
    page: 1,
    nome: inputNome.value.trim(),
    cpf: inputCpf.value.trim(),
    matricula: inputMatricula.value.trim(),
    status: selectStatus.value,
  };
  void carregarFiliados();
});

document.querySelectorAll('th.ordenavel').forEach((th) => {
  th.addEventListener('click', () => {
    const { campo, direcao } = colunaAtualDoSort();
    const mesmoCampo = th.dataset.sort === campo;
    const novaDirecao = mesmoCampo && direcao === 'asc' ? 'desc' : 'asc';
    estado = {
      ...estado,
      page: 1,
      sort: novaDirecao === 'desc' ? `-${th.dataset.sort}` : th.dataset.sort,
    };
    void carregarFiliados();
  });
});

btnNovoFiliado.addEventListener('click', () => {
  window.location.href = 'filiado-formulario.html';
});

async function inicializar() {
  const usuario = await montarShell({ itemAtivo: 'filiados' });
  if (!usuario) return;

  inicializarSelectCustomizado(selectStatus);
  usuarioAtual = usuario;

  if (PERFIS_COM_ESCRITA.includes(usuario.perfil)) {
    btnNovoFiliado.hidden = false;
  }

  await carregarFiliados();
}

void inicializar();
