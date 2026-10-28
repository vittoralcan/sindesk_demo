import { listarPlanosContribuicao, ApiError } from './api.js';
import { obterToken } from './auth-storage.js';
import { montarShell } from './shell.js';
import { escaparHtml, renderizarBadgeStatus, renderizarLinhasEsqueleto, renderizarTabelaVazia, renderizarEstadoPagina } from './ui.js';
import { abrirModalCriarPlano } from './acao-criar-plano.js';

const COLUNAS_TABELA = 3;

// RN-CTR-* (07-regras-de-negocio-e-seguranca.md, guia Fatia A): leitura de
// planos é ADMIN/TESOUREIRO (mais restrita que Empresas — é informação
// financeira, não só cadastral). Criar plano é só ADMIN.
const PERFIS_PERMITIDOS = ['ADMIN', 'TESOUREIRO'];
const PERFIS_CRIAR = ['ADMIN'];

const container = document.getElementById('conteudo-planos');
const corpoTabela = document.getElementById('corpo-tabela');
const btnNovoPlano = document.getElementById('btn-novo-plano');

function renderizarLinhas(planos) {
  corpoTabela.innerHTML = planos
    .map(
      (plano) => `
        <tr class="linha-clicavel" data-id="${escaparHtml(plano.id)}">
          <td>${escaparHtml(plano.codigo)}</td>
          <td>${escaparHtml(plano.nome)}</td>
          <td>${renderizarBadgeStatus(plano.ativo ? 'ATIVO' : 'INATIVO')}</td>
        </tr>
      `,
    )
    .join('');

  corpoTabela.querySelectorAll('tr.linha-clicavel').forEach((linha) => {
    linha.addEventListener('click', () => {
      window.location.href = `plano-contribuicao-detalhe.html?id=${encodeURIComponent(linha.dataset.id)}`;
    });
  });
}

async function carregarPlanos(token) {
  renderizarLinhasEsqueleto(corpoTabela, COLUNAS_TABELA);

  try {
    const planos = await listarPlanosContribuicao(token);

    if (planos.length === 0) {
      renderizarTabelaVazia(corpoTabela, COLUNAS_TABELA, {
        icone: 'fa-inbox',
        titulo: 'Nenhum plano cadastrado',
        mensagem: 'Crie o primeiro plano de contribuição do sindicato.',
      });
      return;
    }

    renderizarLinhas(planos);
  } catch (erro) {
    const mensagem = erro instanceof ApiError ? erro.message : 'Não foi possível carregar os planos agora.';
    renderizarTabelaVazia(corpoTabela, COLUNAS_TABELA, {
      icone: 'fa-triangle-exclamation',
      titulo: 'Erro ao carregar',
      mensagem,
    });
  }
}

async function inicializar() {
  const usuario = await montarShell({ itemAtivo: 'planos' });
  if (!usuario) return;

  if (!PERFIS_PERMITIDOS.includes(usuario.perfil)) {
    renderizarEstadoPagina(container, {
      icone: 'fa-lock',
      titulo: 'Sem permissão',
      mensagem: 'Seu perfil não tem acesso a planos de contribuição.',
    });
    return;
  }

  if (PERFIS_CRIAR.includes(usuario.perfil)) {
    btnNovoPlano.hidden = false;
    btnNovoPlano.addEventListener('click', () => {
      abrirModalCriarPlano({
        token: obterToken(),
        aoConcluir: (plano) => {
          window.location.href = `plano-contribuicao-detalhe.html?id=${encodeURIComponent(plano.id)}`;
        },
      });
    });
  }

  await carregarPlanos(obterToken());
}

void inicializar();
