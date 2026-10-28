import { obterFiliado, listarVinculos, ApiError } from './api.js';
import { obterToken } from './auth-storage.js';
import { montarShell } from './shell.js';
import {
  escaparHtml,
  renderizarBadgeStatus,
  formatarCpf,
  formatarData,
  formatarDataHora,
  formatarMoeda,
  renderizarEstadoPagina,
  renderizarItemEvento,
} from './ui.js';
import { abrirModalAlterarStatus } from './acao-alterar-status.js';
import { abrirModalAdicionarVinculo } from './acao-adicionar-vinculo.js';
import { abrirModalRenovarVigencia } from './acao-renovar-vigencia.js';
import { abrirModalAnonimizar } from './acao-anonimizar.js';
import { abrirModalAlterarPlanoFiliado } from './acao-alterar-plano-filiado.js';

// RN-FIL-05/06/07, RN-LGPD-02, RN-ASS-02 (07-regras-de-negocio-e-seguranca.md):
// escrita em filiados e vínculos restrita a ADMIN/SECRETARIO; anonimizar é só ADMIN.
const PERFIS_EDITAR = ['ADMIN', 'SECRETARIO'];
const PERFIS_ANONIMIZAR = ['ADMIN'];

const ICONE_POR_TIPO_MOVIMENTACAO = {
  MUDANCA_EMPRESA: 'fa-building',
  RENOVACAO_VIGENCIA: 'fa-calendar-plus',
  ANONIMIZACAO: 'fa-user-slash',
};

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

/**
 * Botão de ação do cabeçalho. `disponivel: false` renderiza desabilitado
 * ("Em breve") — a funcionalidade ainda não foi construída. Sem `href`,
 * vira um `<button>` (pra quem chamou ligar um clique depois, ex.: abrir
 * modal); com `href`, vira link de navegação.
 */
function renderizarBotaoAcao({ id, label, icone, href, perigo = false, disponivel }) {
  const classes = ['btn-ghost', 'btn-acao'];
  if (perigo) classes.push('btn-acao--perigo');
  if (!disponivel) classes.push('btn-acao--desabilitada');

  const idAttr = id ? ` id="${id}"` : '';
  const conteudo = `<i class="fa-solid ${icone}" aria-hidden="true"></i> ${escaparHtml(label)}`;

  if (!disponivel) {
    return `<button type="button"${idAttr} class="${classes.join(' ')}" disabled title="Em breve">${conteudo}</button>`;
  }
  if (href) {
    return `<a href="${href}"${idAttr} class="${classes.join(' ')}">${conteudo}</a>`;
  }
  return `<button type="button"${idAttr} class="${classes.join(' ')}">${conteudo}</button>`;
}

function renderizarAcoes(usuario, filiado) {
  const acoes = [];

  if (PERFIS_EDITAR.includes(usuario.perfil)) {
    acoes.push(
      renderizarBotaoAcao({
        label: 'Editar',
        icone: 'fa-pen',
        href: `filiado-formulario.html?id=${encodeURIComponent(filiado.id)}`,
        disponivel: true,
      }),
    );
    acoes.push(
      renderizarBotaoAcao({ id: 'btn-alterar-status', label: 'Alterar status', icone: 'fa-right-left', disponivel: true }),
    );
    acoes.push(
      renderizarBotaoAcao({
        id: 'btn-renovar-vigencia',
        label: 'Renovar vigência',
        icone: 'fa-calendar-days',
        disponivel: true,
      }),
    );
  }

  // Sem sentido oferecer de novo em quem já foi anonimizado — o aviso logo
  // abaixo do cabeçalho já comunica esse estado.
  if (PERFIS_ANONIMIZAR.includes(usuario.perfil) && !filiado.anonimizadoEm) {
    acoes.push(
      renderizarBotaoAcao({
        id: 'btn-anonimizar',
        label: 'Anonimizar',
        icone: 'fa-user-slash',
        perigo: true,
        disponivel: true,
      }),
    );
  }

  return acoes.join('');
}

function renderizarItensVigencia(filiado) {
  const itens = [
    itemDado('Data de filiação', formatarData(filiado.dataFiliacao)),
    itemDado('Vigência início', formatarData(filiado.dataVigenciaInicio)),
    itemDado('Vigência fim', formatarData(filiado.dataVigenciaFim)),
  ];
  if (filiado.vigenciaExpirada) {
    itens.push(itemDado('Situação', '<span class="badge-status badge-status--alerta">Vigência expirada</span>'));
  }
  return itens.join('');
}

function renderizarListaVinculos(vinculos) {
  if (vinculos === null) {
    return '<p class="subsecao-vazia">Não foi possível carregar os vínculos agora.</p>';
  }
  if (vinculos.length === 0) {
    return '<p class="subsecao-vazia">Nenhum vínculo profissional cadastrado.</p>';
  }
  const itens = vinculos
    .map((v) => {
      const periodo = v.dataDesligamento
        ? `${formatarData(v.dataAdmissao)} — ${formatarData(v.dataDesligamento)}`
        : `Desde ${formatarData(v.dataAdmissao)}`;
      return renderizarItemEvento({
        icone: 'fa-briefcase',
        titulo: `${escaparHtml(v.empresaNome)} — ${escaparHtml(v.cargoFuncao)} ${renderizarBadgeStatus(v.statusVinculo)}`,
        detalhe: periodo,
      });
    })
    .join('');
  return `<ul class="lista-eventos">${itens}</ul>`;
}

/** `planoContribuicao` é o plano EFETIVO já resolvido pelo backend (o
 * próprio do filiado, ou o padrão do sindicato na falta dele) — bloco
 * inteiro `null` é FILIADO_SEM_PLANO, nunca renderizar como R$ 0,00. */
function renderizarPlanoContribuicao(plano) {
  if (!plano) {
    return '<p class="subsecao-vazia">Sem plano de contribuição definido.</p>';
  }
  const origem =
    plano.origem === 'PADRAO_SINDICATO'
      ? 'Padrão do sindicato — <a href="sindicato-configuracoes.html">ver/alterar</a>'
      : 'Próprio deste filiado';
  return `
    <div class="grid-dados">
      ${itemDado('Plano', `${escaparHtml(plano.nome)} <span class="subsecao-vazia">(${escaparHtml(plano.codigo)})</span>`)}
      ${itemDado('Valor vigente', formatarMoeda(plano.valorVigenteCentavos))}
      ${itemDado('Origem', origem)}
    </div>
  `;
}

function renderizarListaHistoricoStatus(historico) {
  if (!historico || historico.length === 0) {
    return '<p class="subsecao-vazia">Nenhuma alteração de status registrada ainda.</p>';
  }
  const itens = historico
    .map((h) =>
      renderizarItemEvento({
        icone: 'fa-right-left',
        titulo: `${renderizarBadgeStatus(h.statusAnterior)} <i class="fa-solid fa-arrow-right-long" aria-hidden="true" style="font-size:11px;"></i> ${renderizarBadgeStatus(h.statusNovo)}`,
        detalhe: h.motivo,
        data: formatarDataHora(h.createdAt),
      }),
    )
    .join('');
  return `<ul class="lista-eventos">${itens}</ul>`;
}

function renderizarListaHistoricoMovimentacoes(historico) {
  if (!historico || historico.length === 0) {
    return '<p class="subsecao-vazia">Nenhuma movimentação registrada ainda.</p>';
  }
  const itens = historico
    .map((h) =>
      renderizarItemEvento({
        icone: ICONE_POR_TIPO_MOVIMENTACAO[h.tipoMovimentacao] ?? 'fa-circle-info',
        titulo: escaparHtml(h.descricao),
        data: formatarDataHora(h.createdAt),
      }),
    )
    .join('');
  return `<ul class="lista-eventos">${itens}</ul>`;
}

function ligarEventosDeAcoes(usuario, filiado, vinculos) {
  document.getElementById('btn-alterar-status')?.addEventListener('click', () => {
    abrirModalAlterarStatus({
      filiado,
      token: obterToken(),
      aoConcluir: () => {
        void carregarERenderizar(usuario, filiado.id);
      },
    });
  });

  document.getElementById('btn-adicionar-vinculo')?.addEventListener('click', () => {
    abrirModalAdicionarVinculo({
      filiadoId: filiado.id,
      temVinculoAtual: Array.isArray(vinculos) && vinculos.some((v) => v.statusVinculo === 'ATUAL'),
      token: obterToken(),
      aoConcluir: () => {
        void carregarERenderizar(usuario, filiado.id);
      },
    });
  });

  document.getElementById('btn-renovar-vigencia')?.addEventListener('click', () => {
    abrirModalRenovarVigencia({
      filiado,
      token: obterToken(),
      aoConcluir: () => {
        void carregarERenderizar(usuario, filiado.id);
      },
    });
  });

  document.getElementById('btn-anonimizar')?.addEventListener('click', () => {
    abrirModalAnonimizar({
      filiado,
      token: obterToken(),
      aoConcluir: () => {
        void carregarERenderizar(usuario, filiado.id);
      },
    });
  });

  document.getElementById('btn-alterar-plano')?.addEventListener('click', () => {
    abrirModalAlterarPlanoFiliado({
      filiado,
      token: obterToken(),
      aoConcluir: () => {
        void carregarERenderizar(usuario, filiado.id);
      },
    });
  });
}

function renderizarConteudo(usuario, filiado, vinculos) {
  const avisoAnonimizado = filiado.anonimizadoEm
    ? `<div class="alert alert--warning is-visible" role="status">
         <i class="fa-solid fa-user-slash" aria-hidden="true"></i>
         <span>Este filiado foi anonimizado em ${formatarDataHora(filiado.anonimizadoEm)} — os dados pessoais abaixo já vêm mascarados pela API, isto não é uma falha de carregamento.</span>
       </div>`
    : '';

  container.innerHTML = `
    <a href="filiados.html" class="link-voltar"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Voltar para Filiados</a>

    <div class="pagina-cabecalho">
      <div class="detalhe-titulo">
        <h1>${escaparHtml(filiado.nomeCompleto)}</h1>
        ${renderizarBadgeStatus(filiado.statusCadastral)}
      </div>
      <div class="detalhe-acoes">${renderizarAcoes(usuario, filiado)}</div>
    </div>

    ${avisoAnonimizado}

    <div class="secoes-detalhe">
      <fieldset class="secao-detalhe">
        <legend>Dados pessoais</legend>
        <div class="grid-dados">
          ${itemDado('CPF', formatarCpf(filiado.cpf))}
          ${itemDado('Matrícula', escaparHtml(filiado.matricula ?? '—'))}
          ${itemDado('RG', escaparHtml(filiado.rg ?? '—'))}
          ${itemDado('Data de nascimento', formatarData(filiado.dataNascimento))}
          ${itemDado('Sexo', escaparHtml(filiado.sexo ?? '—'))}
          ${itemDado('Estado civil', escaparHtml(filiado.estadoCivil ?? '—'))}
        </div>
      </fieldset>

      <fieldset class="secao-detalhe">
        <legend>Contato</legend>
        <div class="grid-dados">
          ${itemDado('E-mail', escaparHtml(filiado.email ?? '—'))}
          ${itemDado('Telefone', escaparHtml(filiado.telefone ?? '—'))}
          ${itemDado('Celular', escaparHtml(filiado.celular ?? '—'))}
        </div>
      </fieldset>

      <fieldset class="secao-detalhe">
        <legend>Endereço</legend>
        <div class="grid-dados">
          ${itemDado('CEP', escaparHtml(filiado.cep ?? '—'))}
          ${itemDado('Logradouro', escaparHtml(filiado.logradouro ?? '—'))}
          ${itemDado('Número', escaparHtml(filiado.numero ?? '—'))}
          ${itemDado('Bairro', escaparHtml(filiado.bairro ?? '—'))}
          ${itemDado('Cidade', escaparHtml(filiado.cidade ?? '—'))}
          ${itemDado('UF', escaparHtml(filiado.uf ?? '—'))}
        </div>
      </fieldset>

      <fieldset class="secao-detalhe">
        <legend>Vigência e filiação</legend>
        <div class="grid-dados">${renderizarItensVigencia(filiado)}</div>
      </fieldset>

      ${
        filiado.observacoes
          ? `<fieldset class="secao-detalhe">
              <legend>Observações</legend>
              <p class="texto-observacoes">${escaparHtml(filiado.observacoes)}</p>
            </fieldset>`
          : ''
      }

      <fieldset class="secao-detalhe">
        <div class="subsecao-titulo">
          <span>Vínculos profissionais</span>
          ${
            PERFIS_EDITAR.includes(usuario.perfil)
              ? `<button type="button" class="btn-ghost" id="btn-adicionar-vinculo">
                   <i class="fa-solid fa-plus" aria-hidden="true"></i> Adicionar vínculo
                 </button>`
              : ''
          }
        </div>
        ${renderizarListaVinculos(vinculos)}
      </fieldset>

      <fieldset class="secao-detalhe">
        <div class="subsecao-titulo">
          <span>Plano de contribuição</span>
          ${
            PERFIS_EDITAR.includes(usuario.perfil)
              ? `<button type="button" class="btn-ghost" id="btn-alterar-plano">
                   <i class="fa-solid fa-right-left" aria-hidden="true"></i> Alterar plano
                 </button>`
              : ''
          }
        </div>
        ${renderizarPlanoContribuicao(filiado.planoContribuicao)}
      </fieldset>

      <fieldset class="secao-detalhe">
        <div class="subsecao-titulo"><span>Histórico de movimentações</span></div>
        ${renderizarListaHistoricoMovimentacoes(filiado.historicoMovimentacoes)}
      </fieldset>

      <fieldset class="secao-detalhe">
        <div class="subsecao-titulo"><span>Histórico de status</span></div>
        ${renderizarListaHistoricoStatus(filiado.historicoStatus)}
      </fieldset>
    </div>
  `;

  ligarEventosDeAcoes(usuario, filiado, vinculos);
}

/** GET /filiados/:filiadoId/vinculos não faz parte de GET /filiados/:id —
 * é endpoint próprio (rest-api-spec.md, seção 5). Falha aqui não derruba a
 * página inteira (o filiado já carregou), só essa seção mostra erro. */
async function buscarVinculos(id) {
  try {
    return await listarVinculos(obterToken(), id);
  } catch (erro) {
    console.warn('Não foi possível carregar os vínculos profissionais agora.', erro);
    return null;
  }
}

/** Busca o filiado (e seus vínculos) e renderiza — reaproveitada na carga
 * inicial e depois que qualquer modal de ação (alterar status, adicionar
 * vínculo, renovar vigência, anonimizar) conclui com sucesso, pra refletir
 * o estado novo. */
async function carregarERenderizar(usuario, id) {
  try {
    const filiado = await obterFiliado(obterToken(), id);
    const vinculos = await buscarVinculos(id);
    renderizarConteudo(usuario, filiado, vinculos);
  } catch (erro) {
    const notFound = erro instanceof ApiError && erro.statusCode === 404;
    renderizarEstadoPagina(container, {
      icone: notFound ? 'fa-circle-question' : 'fa-triangle-exclamation',
      titulo: notFound ? 'Filiado não encontrado' : 'Não foi possível carregar',
      mensagem: erro instanceof ApiError ? erro.message : 'Tente novamente em instantes.',
    });
  }
}

async function inicializar() {
  const usuario = await montarShell({ itemAtivo: 'filiados' });
  if (!usuario) return;

  const id = obterIdDaUrl();
  if (!id) {
    renderizarEstadoPagina(container, {
      icone: 'fa-circle-question',
      titulo: 'Nenhum filiado especificado',
      mensagem: 'Volte para a listagem e selecione um filiado.',
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
