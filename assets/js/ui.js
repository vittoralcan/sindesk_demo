// Helpers de UI compartilhados entre telas de listagem/detalhe — nenhum
// deles conhece endpoint ou regra de negócio, só formatação e renderização.

const TOM_POR_STATUS = {
  ATIVO: 'sucesso',
  ATIVA: 'sucesso',
  ATUAL: 'sucesso',
  INATIVO: 'neutro',
  INATIVA: 'neutro',
  ENCERRADO: 'neutro',
  AFASTADO: 'alerta',
  APOSENTADO: 'info',
  // situacao da Conciliação (Fase 4/Fatia C) — NAO_RECEBIDO é o alerta mais
  // direto do painel, por isso o único tom 'perigo' do catálogo.
  CONCILIADO: 'sucesso',
  NAO_RECEBIDO: 'perigo',
  RECEBIDO_A_MENOR: 'alerta',
  RECEBIDO_A_MAIOR: 'info',
  SEM_ESPERADO: 'neutro',
};

const LABEL_STATUS = {
  ATIVO: 'Ativo',
  ATIVA: 'Ativa',
  INATIVO: 'Inativo',
  INATIVA: 'Inativa',
  AFASTADO: 'Afastado',
  APOSENTADO: 'Aposentado',
  ATUAL: 'Atual',
  ENCERRADO: 'Encerrado',
  CONCILIADO: 'Conciliado',
  NAO_RECEBIDO: 'Não recebido',
  RECEBIDO_A_MENOR: 'Recebido a menor',
  RECEBIDO_A_MAIOR: 'Recebido a maior',
  SEM_ESPERADO: 'Sem esperado',
};

// --- 2.4 Modal / overlay --- só um aberto por vez; abrirModal() fecha
// qualquer um anterior antes de montar o novo.
let elementoOverlayAtual = null;
let listenerEscAtual = null;

/**
 * Abre um modal com `conteudoHtml` dentro de um `.glass-card`. Fecha com
 * Esc, com o "X", e (por padrão) com clique fora — a confirmação reforçada
 * de anonimização (seção 2.7 do plano) é a única exceção, com
 * `fecharAoClicarFora: false`.
 * @param {string} conteudoHtml
 * @param {{ fecharAoClicarFora?: boolean }} [opcoes]
 * @returns {HTMLElement} o container `.modal-conteudo`, pra quem chamou
 *   poder buscar seus próprios elementos e ligar seus próprios eventos.
 */
export function abrirModal(conteudoHtml, { fecharAoClicarFora = true } = {}) {
  fecharModal();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-card glass-card" role="dialog" aria-modal="true">
      <button type="button" class="modal-fechar" aria-label="Fechar">
        <i class="fa-solid fa-xmark" aria-hidden="true"></i>
      </button>
      <div class="modal-conteudo">${conteudoHtml}</div>
    </div>
  `;
  document.body.appendChild(overlay);
  elementoOverlayAtual = overlay;

  overlay.querySelector('.modal-fechar').addEventListener('click', fecharModal);

  if (fecharAoClicarFora) {
    overlay.addEventListener('click', (evento) => {
      if (evento.target === overlay) fecharModal();
    });
  }

  listenerEscAtual = (evento) => {
    if (evento.key === 'Escape') fecharModal();
  };
  document.addEventListener('keydown', listenerEscAtual);

  return overlay.querySelector('.modal-conteudo');
}

export function fecharModal() {
  elementoOverlayAtual?.remove();
  elementoOverlayAtual = null;

  if (listenerEscAtual) {
    document.removeEventListener('keydown', listenerEscAtual);
    listenerEscAtual = null;
  }
}

export function escaparHtml(texto) {
  const div = document.createElement('div');
  div.textContent = texto ?? '';
  return div.innerHTML;
}

/**
 * @param {string} status um dos 4 status de filiado, 2 de vínculo, 2 de
 *   empresa (ATIVA/INATIVA — Fase 4), ou 5 de situação de conciliação
 *   (Fase 4/Fatia C)
 * @returns {string} HTML do badge, pronto pra inserir na tabela/detalhe
 */
export function renderizarBadgeStatus(status) {
  const tom = TOM_POR_STATUS[status] ?? 'neutro';
  const label = LABEL_STATUS[status] ?? status;
  return `<span class="badge-status badge-status--${tom}">${escaparHtml(label)}</span>`;
}

/** CPF sanitizado (11 dígitos) → "000.000.000-00". `null`/vazio → "—"
 * (filiado anonimizado, ver RN-LGPD-02). */
export function formatarCpf(cpf) {
  if (!cpf) return '—';
  const digitos = String(cpf).replace(/\D/g, '');
  if (digitos.length !== 11) return escaparHtml(cpf);
  return `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-${digitos.slice(9)}`;
}

/** Data ISO ("2026-01-15") → "15/01/2026". `null`/vazio → "—". Para campos
 * `DATE` puros (dataFiliacao, dataVigenciaInicio/Fim, dataAdmissao...). */
export function formatarData(dataIso) {
  if (!dataIso) return '—';
  const [ano, mes, dia] = dataIso.split('-');
  if (!ano || !mes || !dia?.match(/^\d{2}$/)) return escaparHtml(dataIso);
  return `${dia}/${mes}/${ano}`;
}

/** Data vinda da API ("2026-01-15" ou, quando o campo DATE é serializado
 * com horário, "2026-01-15T00:00:00.000Z") → valor aceito por
 * `<input type="date">` ("2026-01-15") ou pelo atributo `min` desse mesmo
 * input. `null`/vazio → string vazia. */
export function paraValorDeInputData(valor) {
  return valor ? valor.slice(0, 10) : '';
}

/** Timestamp ISO completo ("2026-08-08T16:40:00.000Z") → "08/08/2026 13:40"
 * (horário local do navegador). Para campos `TIMESTAMPTZ` (historicoStatus,
 * historicoMovimentacoes, createdAt/updatedAt em geral) — não usar
 * `formatarData` nesses, ela só entende data pura. */
export function formatarDataHora(dataIso) {
  if (!dataIso) return '—';
  const data = new Date(dataIso);
  if (Number.isNaN(data.getTime())) return escaparHtml(dataIso);
  return data.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const formatoMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** Centavos (inteiro) → "R$ 1.234,56". `null`/`undefined` → "—" — NUNCA
 * "R$ 0,00": em vários campos da Fase 4 (valor estimado, valor vigente de
 * plano, valor mensal de empresa) `null` significa "não calculável", não
 * "zero". Quem chama decide se `0` de verdade é um valor válido a exibir. */
export function formatarMoeda(centavos) {
  if (centavos === null || centavos === undefined) return '—';
  return formatoMoeda.format(centavos / 100);
}

/** Competência ("2026-08", o valor de um <input type="month">) → "08/2026".
 * `null`/vazio → "—". Usada em toda tela de espelho/Pix/recebimentos que
 * exibe a competência de volta pro operador. */
export function formatarCompetencia(competencia) {
  const [ano, mes] = String(competencia ?? '').split('-');
  if (!ano || !mes) return '—';
  return `${mes}/${ano}`;
}

/** Competência corrente ("2026-09") — usada como `max` de todo
 * `<input type="month">` de tela que a API recusa em competência futura
 * (espelho, Pix). Recebimento manual e evolução de conciliação aceitam
 * competência futura de propósito — não aplicar `max` nesses. */
export function competenciaAtual() {
  const agora = new Date();
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Renderiza o controle "Anterior · Página X de Y · Próxima" dentro de
 * `container` e liga os botões a `aoMudarPagina(novaPagina)`.
 * @param {HTMLElement} container
 * @param {{ page: number, totalPages: number }} paginacao
 * @param {(pagina: number) => void} aoMudarPagina
 */
export function renderizarPaginacao(container, { page, totalPages }, aoMudarPagina) {
  if (!container) return;

  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = `
    <button type="button" id="pag-anterior" ${page <= 1 ? 'disabled' : ''}>
      <i class="fa-solid fa-chevron-left" aria-hidden="true"></i> Anterior
    </button>
    <span>Página ${page} de ${totalPages}</span>
    <button type="button" id="pag-proxima" ${page >= totalPages ? 'disabled' : ''}>
      Próxima <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
    </button>
  `;

  container.querySelector('#pag-anterior')?.addEventListener('click', () => aoMudarPagina(page - 1));
  container.querySelector('#pag-proxima')?.addEventListener('click', () => aoMudarPagina(page + 1));
}

/**
 * Preenche `tbody` com `quantidade` linhas de esqueleto (carregamento),
 * cada uma com `colunas` blocos pulsando.
 * @param {HTMLTableSectionElement} tbody
 * @param {number} colunas
 * @param {number} [quantidade]
 */
export function renderizarLinhasEsqueleto(tbody, colunas, quantidade = 5) {
  const celula = '<td><div class="bloco-esqueleto"></div></td>';
  tbody.innerHTML = Array.from({ length: quantidade })
    .map(() => `<tr class="linha-esqueleto">${celula.repeat(colunas)}</tr>`)
    .join('');
}

function htmlEstadoGenerico(icone, titulo, mensagem) {
  return `
    <div class="estado-generico">
      <i class="fa-solid ${icone}" aria-hidden="true"></i>
      <strong>${escaparHtml(titulo)}</strong>
      ${mensagem ? `<span>${escaparHtml(mensagem)}</span>` : ''}
    </div>
  `;
}

/**
 * @param {HTMLTableSectionElement} tbody
 * @param {number} colunas
 * @param {{ icone?: string, titulo: string, mensagem?: string }} opcoes
 */
export function renderizarTabelaVazia(tbody, colunas, { icone = 'fa-inbox', titulo, mensagem }) {
  tbody.innerHTML = `<tr><td colspan="${colunas}">${htmlEstadoGenerico(icone, titulo, mensagem)}</td></tr>`;
}

/**
 * Mesmo padrão visual de `renderizarTabelaVazia`, mas pra quando a página
 * inteira falhou (ex.: filiado não encontrado), não só uma tabela.
 * @param {HTMLElement} container
 * @param {{ icone?: string, titulo: string, mensagem?: string }} opcoes
 */
export function renderizarEstadoPagina(container, { icone = 'fa-circle-exclamation', titulo, mensagem }) {
  container.innerHTML = htmlEstadoGenerico(icone, titulo, mensagem);
}

/**
 * @param {{ icone?: string, titulo: string, detalhe?: string, data?: string }} evento
 */
export function renderizarItemEvento({ icone = 'fa-circle-info', titulo, detalhe, data }) {
  return `
    <li class="item-evento">
      <i class="fa-solid ${icone} item-evento-icone" aria-hidden="true"></i>
      <div class="item-evento-corpo">
        <div class="item-evento-titulo">${titulo}</div>
        ${detalhe ? `<div class="item-evento-detalhe">${escaparHtml(detalhe)}</div>` : ''}
      </div>
      ${data ? `<span class="item-evento-data">${escaparHtml(data)}</span>` : ''}
    </li>
  `;
}
