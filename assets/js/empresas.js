import { listarEmpresas, ApiError } from './api.js';
import { obterToken } from './auth-storage.js';
import { montarShell } from './shell.js';
import { escaparHtml, renderizarBadgeStatus, renderizarPaginacao, renderizarLinhasEsqueleto, renderizarTabelaVazia } from './ui.js';
import { abrirModalAlterarStatusEmpresa } from './acao-alterar-status-empresa.js';
import { inicializarSelectCustomizado } from './custom-select.js';

const COLUNAS_TABELA = 6;

const formFiltros = document.getElementById('form-filtros');
const inputRazaoSocial = document.getElementById('filtro-razao-social');
const inputCnpj = document.getElementById('filtro-cnpj');
const selectStatus = document.getElementById('filtro-status');
const corpoTabela = document.getElementById('corpo-tabela');
const areaPaginacao = document.getElementById('area-paginacao');
const btnNovaEmpresa = document.getElementById('btn-nova-empresa');

// RN-EMP-* (07-regras-de-negocio-e-seguranca.md, guia Fatia A): leitura de
// empresas é aberta a todos os perfis — só criar/editar (ADMIN/SECRETARIO)
// e alterar status (ADMIN) são restritos.
const PERFIS_COM_ESCRITA = ['ADMIN', 'SECRETARIO'];
const PERFIS_ALTERAR_STATUS = ['ADMIN'];

let estado = {
  page: 1,
  limit: 20,
  razaoSocial: '',
  cnpj: '',
  status: '',
  sort: 'razaoSocial',
};

// Preenchido em inicializar() — decide se a coluna Ações mostra o botão de
// alterar status em cada linha.
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

function renderizarLinhas(empresas) {
  const podeAlterarStatus = PERFIS_ALTERAR_STATUS.includes(usuarioAtual?.perfil);

  corpoTabela.innerHTML = empresas
    .map((empresa) => {
      const municipioUf = [empresa.municipio, empresa.uf].filter(Boolean).join('/');
      return `
        <tr class="linha-clicavel" data-id="${escaparHtml(empresa.id)}">
          <td>${escaparHtml(empresa.razaoSocial)}</td>
          <td>${escaparHtml(empresa.nomeFantasia ?? '—')}</td>
          <td>${escaparHtml(empresa.cnpj)}</td>
          <td>${escaparHtml(municipioUf || '—')}</td>
          <td>${renderizarBadgeStatus(empresa.status)}</td>
          <td>
            ${
              podeAlterarStatus
                ? `<button type="button" class="btn-acao-linha" data-acao="alterar-status" title="Alterar status">
                     <i class="fa-solid fa-right-left" aria-hidden="true"></i>
                   </button>`
                : '—'
            }
          </td>
        </tr>
      `;
    })
    .join('');

  corpoTabela.querySelectorAll('tr.linha-clicavel').forEach((linha) => {
    linha.addEventListener('click', () => {
      window.location.href = `empresa-detalhe.html?id=${encodeURIComponent(linha.dataset.id)}`;
    });
  });

  corpoTabela.querySelectorAll('button[data-acao="alterar-status"]').forEach((botao) => {
    botao.addEventListener('click', (evento) => {
      evento.stopPropagation(); // não deve disparar a navegação da linha
      const linha = botao.closest('tr');
      const empresa = empresas.find((e) => e.id === linha.dataset.id);
      if (!empresa) return;

      abrirModalAlterarStatusEmpresa({
        empresa,
        token: obterToken(),
        aoConcluir: () => {
          void carregarEmpresas();
        },
      });
    });
  });
}

async function carregarEmpresas() {
  const token = obterToken();
  renderizarLinhasEsqueleto(corpoTabela, COLUNAS_TABELA);
  areaPaginacao.innerHTML = '';
  atualizarIndicadoresDeOrdenacao();

  try {
    const resposta = await listarEmpresas(token, estado);

    if (resposta.data.length === 0) {
      renderizarTabelaVazia(corpoTabela, COLUNAS_TABELA, {
        icone: 'fa-inbox',
        titulo: 'Nenhuma empresa encontrada',
        mensagem: 'Ajuste os filtros e tente novamente.',
      });
      return;
    }

    renderizarLinhas(resposta.data);
    renderizarPaginacao(areaPaginacao, resposta.pagination, (novaPagina) => {
      estado.page = novaPagina;
      void carregarEmpresas();
    });
  } catch (erro) {
    const mensagem = erro instanceof ApiError ? erro.message : 'Não foi possível carregar as empresas agora.';
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
    razaoSocial: inputRazaoSocial.value.trim(),
    cnpj: inputCnpj.value.trim(),
    status: selectStatus.value,
  };
  void carregarEmpresas();
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
    void carregarEmpresas();
  });
});

btnNovaEmpresa.addEventListener('click', () => {
  window.location.href = 'empresa-formulario.html';
});

async function inicializar() {
  const usuario = await montarShell({ itemAtivo: 'empresas' });
  if (!usuario) return;

  inicializarSelectCustomizado(selectStatus);
  usuarioAtual = usuario;

  if (PERFIS_COM_ESCRITA.includes(usuario.perfil)) {
    btnNovaEmpresa.hidden = false;
  }

  await carregarEmpresas();
}

void inicializar();
