import { obterPlanoContribuicao, ApiError } from './api.js';
import { obterToken } from './auth-storage.js';
import { montarShell } from './shell.js';
import { escaparHtml, renderizarBadgeStatus, renderizarEstadoPagina, renderizarItemEvento, formatarData, formatarMoeda } from './ui.js';
import { abrirModalCriarValorPlano } from './acao-criar-valor-plano.js';

// RN-CTR-* (07-regras-de-negocio-e-seguranca.md, guia Fatia A): mesma régua
// de leitura de planos-contribuicao.js; abrir vigência nova é só ADMIN.
const PERFIS_PERMITIDOS = ['ADMIN', 'TESOUREIRO'];
const PERFIS_NOVA_VIGENCIA = ['ADMIN'];

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

function renderizarHistoricoValores(valores) {
  if (valores.length === 0) {
    return '<p class="subsecao-vazia">Nenhum valor cadastrado ainda — o plano existe, mas não tem vigência de valor.</p>';
  }
  const itens = valores
    .map((valor) => {
      const periodo = valor.vigenciaFim
        ? `${formatarData(valor.vigenciaInicio)} — ${formatarData(valor.vigenciaFim)}`
        : `Desde ${formatarData(valor.vigenciaInicio)} (em vigor)`;
      return renderizarItemEvento({
        icone: 'fa-sack-dollar',
        titulo: formatarMoeda(valor.valorCentavos),
        detalhe: periodo,
      });
    })
    .join('');
  return `<ul class="lista-eventos">${itens}</ul>`;
}

function renderizarConteudo(usuario, plano) {
  container.innerHTML = `
    <a href="planos-contribuicao.html" class="link-voltar"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Voltar para Planos de Contribuição</a>

    <div class="pagina-cabecalho">
      <div class="detalhe-titulo">
        <h1>${escaparHtml(plano.nome)}</h1>
        ${renderizarBadgeStatus(plano.ativo ? 'ATIVO' : 'INATIVO')}
      </div>
    </div>

    <div class="secoes-detalhe">
      <fieldset class="secao-detalhe">
        <legend>Identidade do plano</legend>
        <div class="grid-dados">
          ${itemDado('Código', escaparHtml(plano.codigo))}
          ${itemDado('Valor vigente hoje', formatarMoeda(plano.valorVigenteCentavos))}
        </div>
      </fieldset>

      ${
        plano.descricao
          ? `<fieldset class="secao-detalhe">
              <legend>Descrição</legend>
              <p class="texto-observacoes">${escaparHtml(plano.descricao)}</p>
            </fieldset>`
          : ''
      }

      <fieldset class="secao-detalhe">
        <div class="subsecao-titulo">
          <span>Histórico de valores</span>
          ${
            PERFIS_NOVA_VIGENCIA.includes(usuario.perfil)
              ? `<button type="button" class="btn-ghost" id="btn-nova-vigencia">
                   <i class="fa-solid fa-plus" aria-hidden="true"></i> Nova vigência de valor
                 </button>`
              : ''
          }
        </div>
        ${renderizarHistoricoValores(plano.valores)}
      </fieldset>
    </div>
  `;

  document.getElementById('btn-nova-vigencia')?.addEventListener('click', () => {
    abrirModalCriarValorPlano({
      planoId: plano.id,
      token: obterToken(),
      aoConcluir: () => {
        void carregarERenderizar(usuario, plano.id);
      },
    });
  });
}

async function carregarERenderizar(usuario, id) {
  try {
    const plano = await obterPlanoContribuicao(obterToken(), id);
    renderizarConteudo(usuario, plano);
  } catch (erro) {
    const notFound = erro instanceof ApiError && erro.statusCode === 404;
    renderizarEstadoPagina(container, {
      icone: notFound ? 'fa-circle-question' : 'fa-triangle-exclamation',
      titulo: notFound ? 'Plano não encontrado' : 'Não foi possível carregar',
      mensagem: erro instanceof ApiError ? erro.message : 'Tente novamente em instantes.',
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

  const id = obterIdDaUrl();
  if (!id) {
    renderizarEstadoPagina(container, {
      icone: 'fa-circle-question',
      titulo: 'Nenhum plano especificado',
      mensagem: 'Volte para a listagem e selecione um plano.',
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
