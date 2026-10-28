// Motor de cálculo da versão showcase — a parte analítica do Sindesk,
// reescrita em JavaScript puro para rodar no navegador sobre a base fictícia.
//
// No produto, estes números saem de SQL de agregação no PostgreSQL
// (`COUNT(*) FILTER`, `DISTINCT ON`, `COALESCE` do plano efetivo). Aqui as
// mesmas regras são aplicadas sobre arrays em memória — cada função cita a
// regra de negócio que implementa, para que dê para conferir uma contra a
// outra. Funções puras: recebem o banco e devolvem o resultado, sem gravar
// nada (o espelho é sempre calculado ao vivo, RN-ESP-03).

import { agoraIso, hojeIso, somarDias, ultimoDia, ultimasCompetencias } from './utilitarios.js';

// --- Planos ---------------------------------------------------------------

/** RN-CTR-01: o valor vive em vigências fechadas nos dois lados. */
export function valorVigenteDoPlano(banco, planoId, dataReferencia) {
  const vigencia = banco.planoValores.find(
    (valor) =>
      valor.planoId === planoId &&
      valor.vigenciaInicio <= dataReferencia &&
      (valor.vigenciaFim === null || valor.vigenciaFim >= dataReferencia),
  );
  return vigencia ? vigencia.valorCentavos : null;
}

/**
 * RN-CTR-03: plano efetivo = o próprio do filiado ou, na falta dele, o padrão
 * do sindicato — o `COALESCE` que a agregação do espelho faz em SQL.
 */
export function resolverPlanoDoFiliado(banco, filiado) {
  const planoId = filiado.planoContribuicaoId ?? banco.sindicato.planoContribuicaoPadraoId;
  const plano = planoId ? banco.planos.find((item) => item.id === planoId) : null;
  if (!plano) return null;
  return { plano, origem: filiado.planoContribuicaoId ? 'PROPRIO' : 'PADRAO_SINDICATO' };
}

// --- Espelho de cobrança (ponto único de cálculo) ----------------------------

/**
 * Equivalente a `calcularEsperado` do back-end: tudo que responde "quanto se
 * deveria arrecadar na competência C" passa por aqui — espelho, exportação,
 * conciliação, evolução e Pix. Nenhuma tela recalcula por conta própria.
 *
 * RN-ESP-01: entra quem está ATIVO, não anonimizado, já filiado na data de
 * referência (último dia da competência) e com vínculo elegível por DATAS —
 * nunca por `statusVinculo = 'ATUAL'`, que responderia "quem trabalha lá
 * hoje", a pergunta errada para um mês passado.
 */
export function calcularEsperado(banco, competencia, { empresaId = null } = {}) {
  const dataReferencia = ultimoDia(competencia);
  const empresasPorId = new Map(banco.empresas.map((empresa) => [empresa.id, empresa]));

  const linhas = banco.filiados
    .filter(
      (filiado) =>
        filiado.statusCadastral === 'ATIVO' && !filiado.anonimizadoEm && filiado.dataFiliacao <= dataReferencia,
    )
    .map((filiado) => {
      // RN-ESP-02: vínculos sobrepostos — vale o de admissão mais recente
      // (o `DISTINCT ON ... ORDER BY data_admissao DESC` do SQL). Nunca conta
      // o mesmo filiado duas vezes.
      const elegiveis = banco.vinculos
        .filter(
          (vinculo) =>
            vinculo.filiadoId === filiado.id &&
            vinculo.empresaId &&
            vinculo.dataAdmissao <= dataReferencia &&
            (!vinculo.dataDesligamento || vinculo.dataDesligamento > dataReferencia),
        )
        .sort((a, b) => b.dataAdmissao.localeCompare(a.dataAdmissao) || a.empresaId.localeCompare(b.empresaId));
      const vinculo = elegiveis[0] ?? null;
      const planoEfetivo = resolverPlanoDoFiliado(banco, filiado);

      return {
        filiadoId: filiado.id,
        nomeCompleto: filiado.nomeCompleto,
        matricula: filiado.matricula,
        empresaId: vinculo?.empresaId ?? null,
        empresaStatus: vinculo ? empresasPorId.get(vinculo.empresaId)?.status : null,
        vinculosElegiveis: elegiveis.length,
        planoId: planoEfetivo?.plano.id ?? null,
        planoCodigo: planoEfetivo?.plano.codigo ?? null,
        valorCentavos: planoEfetivo ? valorVigenteDoPlano(banco, planoEfetivo.plano.id, dataReferencia) : null,
      };
    });

  // O filtro por empresa vem DEPOIS do desempate (RN-ESP-02): aplicado antes,
  // quem trocou de empresa no meio do mês apareceria na empresa antiga.
  const escopo = empresaId ? linhas.filter((linha) => linha.empresaId === empresaId) : linhas;

  // Sem plano ou sem valor vigente o filiado NÃO entra nos totais — só nas
  // inconsistências. Listá-lo com zero diria que ele não deve nada.
  const cobraveis = escopo
    .filter((linha) => linha.empresaId && linha.valorCentavos !== null)
    .sort((a, b) => a.nomeCompleto.localeCompare(b.nomeCompleto, 'pt-BR'));

  return {
    competencia,
    dataReferencia,
    geradoEm: agoraIso(),
    cobraveis,
    inconsistencias: apurarInconsistencias(escopo),
  };
}

/** `0` = nenhuma ocorrência; número = soma estimada; `null` = há ocorrências, nenhuma estimável. */
function estimar(linhas) {
  if (linhas.length === 0) return 0;
  const conhecidas = linhas.filter((linha) => linha.valorCentavos !== null);
  if (conhecidas.length === 0) return null;
  return conhecidas.reduce((total, linha) => total + linha.valorCentavos, 0);
}

/**
 * RN-ESP-04: os cinco códigos saem sempre, em ordem fixa, mesmo com
 * quantidade zero — "não apareceu" nunca fica ambíguo entre "não houve" e
 * "não foi calculado".
 */
function apurarInconsistencias(linhas) {
  const semVinculo = linhas.filter((linha) => linha.empresaId === null);
  const comVinculo = linhas.filter((linha) => linha.empresaId !== null);
  const semPlano = comVinculo.filter((linha) => linha.planoId === null);
  const semValorVigente = comVinculo.filter((linha) => linha.planoId !== null && linha.valorCentavos === null);
  const sobrepostos = comVinculo.filter((linha) => linha.vinculosElegiveis > 1);
  const deEmpresaInativa = comVinculo.filter((linha) => linha.empresaStatus === 'INATIVA');

  return [
    { codigo: 'FILIADO_SEM_VINCULO', quantidade: semVinculo.length, valorEstimadoCentavos: estimar(semVinculo) },
    { codigo: 'FILIADO_SEM_PLANO', quantidade: semPlano.length, valorEstimadoCentavos: semPlano.length === 0 ? 0 : null },
    {
      codigo: 'PLANO_SEM_VALOR_VIGENTE',
      quantidade: semValorVigente.length,
      valorEstimadoCentavos: semValorVigente.length === 0 ? 0 : null,
    },
    { codigo: 'VINCULO_SOBREPOSTO', quantidade: sobrepostos.length, valorEstimadoCentavos: estimar(sobrepostos) },
    {
      // Conta EMPRESAS, não filiados — é o sujeito do código.
      codigo: 'EMPRESA_INATIVA_COM_FILIADOS',
      quantidade: new Set(deEmpresaInativa.map((linha) => linha.empresaId)).size,
      valorEstimadoCentavos: estimar(deEmpresaInativa),
    },
  ];
}

function somar(cobraveis) {
  return cobraveis.reduce((total, linha) => total + linha.valorCentavos, 0);
}

function agruparPorEmpresa(cobraveis) {
  const grupos = new Map();
  cobraveis.forEach((linha) => {
    const grupo = grupos.get(linha.empresaId) ?? [];
    grupo.push(linha);
    grupos.set(linha.empresaId, grupo);
  });
  return grupos;
}

/** `GET /cobrancas/espelho` — uma linha por empresa. */
export function montarEspelhoPorEmpresa(banco, competencia, { incluirZerados = false } = {}) {
  const esperado = calcularEsperado(banco, competencia);
  const grupos = agruparPorEmpresa(esperado.cobraveis);

  const empresas = banco.empresas.filter(
    (empresa) => grupos.has(empresa.id) || (incluirZerados && empresa.status === 'ATIVA'),
  );
  const linhas = empresas
    .map((empresa) => {
      const cobraveis = grupos.get(empresa.id) ?? [];
      return {
        empresaId: empresa.id,
        razaoSocial: empresa.razaoSocial,
        cnpj: empresa.cnpj,
        quantidadeFiliados: cobraveis.length,
        valorTotalCentavos: somar(cobraveis),
      };
    })
    .sort((a, b) => a.razaoSocial.localeCompare(b.razaoSocial, 'pt-BR'));

  return {
    competencia,
    dataReferencia: esperado.dataReferencia,
    geradoEm: esperado.geradoEm,
    totais: {
      empresas: linhas.length,
      filiadosCobraveis: esperado.cobraveis.length,
      valorTotalCentavos: somar(esperado.cobraveis),
    },
    inconsistencias: esperado.inconsistencias,
    linhas,
  };
}

/** `GET /empresas/:id/espelho` — uma linha por filiado daquela empresa. */
export function montarEspelhoDaEmpresa(banco, competencia, empresaId) {
  const esperado = calcularEsperado(banco, competencia, { empresaId });
  const linhas = esperado.cobraveis.map((linha) => ({
    filiadoId: linha.filiadoId,
    nomeCompleto: linha.nomeCompleto,
    matricula: linha.matricula,
    planoCodigo: linha.planoCodigo,
    valorCentavos: linha.valorCentavos,
  }));

  return {
    competencia,
    dataReferencia: esperado.dataReferencia,
    geradoEm: esperado.geradoEm,
    totais: {
      empresas: linhas.length === 0 ? 0 : 1,
      filiadosCobraveis: linhas.length,
      valorTotalCentavos: somar(esperado.cobraveis),
    },
    inconsistencias: esperado.inconsistencias,
    linhas,
  };
}

/** Valor mensal estimado de uma empresa (`GET /empresas/:id`) — mesmo ponto único. */
export function resumoMensalDaEmpresa(banco, empresaId, competencia) {
  const esperado = calcularEsperado(banco, competencia, { empresaId });
  return { filiadosAtivos: esperado.cobraveis.length, valorMensalEstimadoCentavos: somar(esperado.cobraveis) };
}

// --- Conciliação -------------------------------------------------------------

/** RN-CON-03/04: o saldo é sempre SUM(valor), que absorve estornos (linhas negativas). */
function recebidoPorEmpresa(banco, competencia) {
  const somas = new Map();
  banco.recebimentos
    .filter((recebimento) => recebimento.competencia === competencia)
    .forEach((recebimento) => {
      somas.set(recebimento.empresaId, (somas.get(recebimento.empresaId) ?? 0) + recebimento.valorCentavos);
    });
  return somas;
}

/** RN-CON-05 — avaliada nesta ordem; a primeira condição verdadeira vence. */
export function classificarSituacao(valorEsperadoCentavos, valorRecebidoCentavos, toleranciaCentavos) {
  if (valorEsperadoCentavos === 0 && valorRecebidoCentavos === 0) return 'SEM_ESPERADO';
  if (valorEsperadoCentavos > 0 && valorRecebidoCentavos === 0) return 'NAO_RECEBIDO';
  const divergencia = valorRecebidoCentavos - valorEsperadoCentavos;
  if (Math.abs(divergencia) <= toleranciaCentavos) return 'CONCILIADO';
  if (divergencia < -toleranciaCentavos) return 'RECEBIDO_A_MENOR';
  return 'RECEBIDO_A_MAIOR';
}

/**
 * "Faltou o equivalente a N filiados" só faz sentido quando todo filiado da
 * empresa paga o mesmo valor — com planos mistos, a conversão vira `null`.
 */
function calcularFiliadosEquivalentes(divergenciaCentavos, cobraveis) {
  if (cobraveis.length === 0) return null;
  const valor = cobraveis[0].valorCentavos;
  if (valor === 0 || !cobraveis.every((linha) => linha.valorCentavos === valor)) return null;
  return Math.round(Math.abs(divergenciaCentavos) / valor);
}

/** `GET /conciliacao` sem paginação — todas as empresas do tenant, pior divergência primeiro. */
export function montarConciliacao(banco, competencia) {
  const esperado = calcularEsperado(banco, competencia);
  const grupos = agruparPorEmpresa(esperado.cobraveis);
  const recebido = recebidoPorEmpresa(banco, competencia);
  const tolerancia = banco.sindicato.toleranciaDivergenciaCentavos;

  const linhas = banco.empresas
    .map((empresa) => {
      const cobraveis = grupos.get(empresa.id) ?? [];
      const valorEsperadoCentavos = somar(cobraveis);
      const valorRecebidoCentavos = recebido.get(empresa.id) ?? 0;
      const divergenciaCentavos = valorRecebidoCentavos - valorEsperadoCentavos;
      return {
        empresaId: empresa.id,
        razaoSocial: empresa.razaoSocial,
        quantidadeFiliados: cobraveis.length,
        valorEsperadoCentavos,
        valorRecebidoCentavos,
        divergenciaCentavos,
        situacao: classificarSituacao(valorEsperadoCentavos, valorRecebidoCentavos, tolerancia),
        filiadosEquivalentes: calcularFiliadosEquivalentes(divergenciaCentavos, cobraveis),
      };
    })
    .sort((a, b) => a.divergenciaCentavos - b.divergenciaCentavos || a.razaoSocial.localeCompare(b.razaoSocial));

  const contar = (situacao) => linhas.filter((linha) => linha.situacao === situacao).length;
  const valorEsperadoCentavos = linhas.reduce((total, linha) => total + linha.valorEsperadoCentavos, 0);
  const valorRecebidoCentavos = linhas.reduce((total, linha) => total + linha.valorRecebidoCentavos, 0);

  return {
    competencia,
    toleranciaCentavos: tolerancia,
    geradoEm: esperado.geradoEm,
    resumo: {
      valorEsperadoCentavos,
      valorRecebidoCentavos,
      divergenciaCentavos: valorRecebidoCentavos - valorEsperadoCentavos,
      empresasConciliadas: contar('CONCILIADO'),
      empresasNaoRecebidas: contar('NAO_RECEBIDO'),
      empresasRecebidoAMenor: contar('RECEBIDO_A_MENOR'),
      empresasRecebidoAMaior: contar('RECEBIDO_A_MAIOR'),
      empresasSemEsperado: contar('SEM_ESPERADO'),
    },
    linhas,
  };
}

/**
 * RN-CON-07: série das últimas N competências por empresa. `quedaFiliados`
 * acende quando a quantidade cai MAIS do que `quedaPercentual` em relação ao
 * ponto anterior da série; o primeiro ponto nunca é queda (não há anterior) e
 * zero nunca "cai" (não existe percentual de queda a partir de zero).
 */
export function montarEvolucao(banco, { competencias = 6, empresaId = null, quedaPercentual = 10 } = {}) {
  const lista = ultimasCompetencias(competencias);
  const porCompetencia = lista.map((competencia) => ({
    competencia,
    grupos: agruparPorEmpresa(calcularEsperado(banco, competencia).cobraveis),
    recebido: recebidoPorEmpresa(banco, competencia),
  }));

  const empresas = empresaId ? banco.empresas.filter((empresa) => empresa.id === empresaId) : banco.empresas;

  const data = empresas.map((empresa) => {
    let quantidadeAnterior = null;
    const serie = porCompetencia.map(({ competencia, grupos, recebido }) => {
      const cobraveis = grupos.get(empresa.id) ?? [];
      const quantidadeFiliados = cobraveis.length;
      const quedaFiliados =
        quantidadeAnterior !== null &&
        quantidadeAnterior > 0 &&
        ((quantidadeAnterior - quantidadeFiliados) / quantidadeAnterior) * 100 > quedaPercentual;
      quantidadeAnterior = quantidadeFiliados;
      return {
        competencia,
        quantidadeFiliados,
        valorEsperadoCentavos: somar(cobraveis),
        valorRecebidoCentavos: recebido.get(empresa.id) ?? 0,
        quedaFiliados,
      };
    });
    return { empresaId: empresa.id, razaoSocial: empresa.razaoSocial, serie };
  });

  return { competencias, quedaPercentual, geradoEm: agoraIso(), data };
}

// --- Dashboard e vencimentos -------------------------------------------------

/**
 * Espelho de `dashboard.repository.ts#obterMetricas` — no back-end é UMA
 * consulta com `COUNT(*) FILTER (WHERE ...)` por métrica, em vez de oito
 * idas ao banco. Os filtros abaixo são os mesmos `WHERE` daquela consulta
 * (inclusive a ausência de filtro de status nas janelas de vencimento).
 */
export function calcularMetricasDashboard(banco) {
  const hoje = hojeIso();
  const mesAtual = hoje.slice(0, 7);
  const ate30 = somarDias(hoje, 30);
  const ate60 = somarDias(hoje, 60);
  const filiados = banco.filiados;
  const contar = (predicado) => filiados.filter(predicado).length;
  const venceEntre = (filiado, fim) =>
    !!filiado.dataVigenciaFim && filiado.dataVigenciaFim >= hoje && filiado.dataVigenciaFim <= fim;

  return {
    totalFiliados: filiados.length,
    filiadosAtivos: contar((filiado) => filiado.statusCadastral === 'ATIVO'),
    filiadosInativos: contar((filiado) => filiado.statusCadastral === 'INATIVO'),
    filiadosAfastados: contar((filiado) => filiado.statusCadastral === 'AFASTADO'),
    filiadosAposentados: contar((filiado) => filiado.statusCadastral === 'APOSENTADO'),
    novasFiliacoesMesAtual: contar((filiado) => filiado.dataFiliacao.slice(0, 7) === mesAtual),
    vencimentosProximos30Dias: contar((filiado) => venceEntre(filiado, ate30)),
    vencimentosProximos60Dias: contar((filiado) => venceEntre(filiado, ate60)),
  };
}

/** RN-ASS-05: ATIVO com vigência terminando entre hoje e hoje + `dias`, mais próximo primeiro. */
export function listarVencimentos(banco, dias) {
  const hoje = hojeIso();
  const limite = somarDias(hoje, dias);
  return banco.filiados
    .filter(
      (filiado) =>
        filiado.statusCadastral === 'ATIVO' &&
        filiado.dataVigenciaFim &&
        filiado.dataVigenciaFim >= hoje &&
        filiado.dataVigenciaFim <= limite,
    )
    .sort((a, b) => a.dataVigenciaFim.localeCompare(b.dataVigenciaFim))
    .map((filiado) => ({
      id: filiado.id,
      nomeCompleto: filiado.nomeCompleto,
      cpf: filiado.anonimizadoEm ? null : filiado.cpf,
      dataVigenciaFim: filiado.dataVigenciaFim,
      diasParaVencer: Math.round((Date.parse(filiado.dataVigenciaFim) - Date.parse(hoje)) / 86400000),
    }));
}
