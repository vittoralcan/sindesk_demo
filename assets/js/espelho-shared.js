// Renderização compartilhada do envelope do Espelho de Cobrança (Fase 4/
// Fatia A) — mesmo formato de `totais`/`inconsistencias` tanto na visão do
// tenant inteiro (GET /cobrancas/espelho, cobrancas-espelho.js) quanto na
// visão por empresa (GET /empresas/:id/espelho, dentro de empresa-detalhe.js)
// — evita duplicar a leitura dos 5 códigos fixos de inconsistência nas duas
// telas. Não é uma tela em si, só os dois blocos que ambas mostram.
import { formatarMoeda, escaparHtml } from './ui.js';

// RN-ESP-04: os 5 códigos vêm sempre, nesta ordem, com quantidade:0 quando
// não há ocorrência — os rótulos/descrições seguem a tabela do guia de
// integração (guia-front-end-fatia-a.md, seção 3.3).
const LABELS_INCONSISTENCIA = {
  FILIADO_SEM_VINCULO: {
    label: 'Filiados sem vínculo',
    descricao: 'Filiado ativo que não está sendo cobrado de ninguém — maior valor comercial do achado.',
    destaque: true,
  },
  FILIADO_SEM_PLANO: {
    label: 'Filiados sem plano',
    descricao: 'Falta atribuir um plano de contribuição, próprio ou o padrão do sindicato.',
  },
  PLANO_SEM_VALOR_VIGENTE: {
    label: 'Planos sem valor vigente',
    descricao: 'O plano existe, mas nenhuma vigência de valor cobre esta competência.',
  },
  VINCULO_SOBREPOSTO: {
    label: 'Vínculos sobrepostos',
    descricao: 'Filiado com dois vínculos abertos ao mesmo tempo — contado uma vez, pelo mais recente.',
  },
  EMPRESA_INATIVA_COM_FILIADOS: {
    label: 'Empresas inativas com filiados',
    descricao: 'Empresa inativa, mas ainda com filiados elegíveis nesta competência.',
    contaEmpresas: true,
  },
};

/** @param {{ empresas: number, filiadosCobraveis: number, valorTotalCentavos: number }} totais */
export function renderizarCartoesTotais(totais) {
  return `
    <div class="grade-metricas">
      <div class="cartao-metrica cartao-metrica--destaque">
        <span class="cartao-metrica-label">Valor total esperado</span>
        <span class="cartao-metrica-valor">${formatarMoeda(totais.valorTotalCentavos)}</span>
      </div>
      <div class="cartao-metrica">
        <span class="cartao-metrica-label">Empresas</span>
        <span class="cartao-metrica-valor">${totais.empresas}</span>
      </div>
      <div class="cartao-metrica">
        <span class="cartao-metrica-label">Filiados cobráveis</span>
        <span class="cartao-metrica-valor">${totais.filiadosCobraveis}</span>
      </div>
    </div>
  `;
}

/** @param {Array<{ codigo: string, quantidade: number, valorEstimadoCentavos: number | null }>} inconsistencias */
export function renderizarInconsistencias(inconsistencias) {
  const itens = inconsistencias
    .map((item) => {
      const meta = LABELS_INCONSISTENCIA[item.codigo] ?? { label: item.codigo, descricao: '' };
      const unidade = meta.contaEmpresas ? 'empresa(s)' : 'filiado(s)';
      return `
        <li class="item-inconsistencia${meta.destaque ? ' item-inconsistencia--destaque' : ''}">
          <div class="item-inconsistencia-cabecalho">
            <span class="item-inconsistencia-label">${escaparHtml(meta.label)}</span>
            <span class="item-inconsistencia-quantidade">${item.quantidade} ${unidade}</span>
          </div>
          <p class="item-inconsistencia-descricao">${escaparHtml(meta.descricao)}</p>
          <span class="item-inconsistencia-valor">Valor estimado: ${formatarMoeda(item.valorEstimadoCentavos)}</span>
        </li>
      `;
    })
    .join('');

  return `<ul class="lista-inconsistencias">${itens}</ul>`;
}
