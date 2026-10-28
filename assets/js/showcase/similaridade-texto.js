// Casamento por similaridade da importação assistida (RN-CON-08), sem banco.
//
// No back-end, a sugestão de empresa para cada linha do extrato sai de
// `similarity(lower(razao_social), lower(descricao))` do `pg_trgm`, numa única
// consulta com `CROSS JOIN LATERAL` para o lote inteiro. Aqui a mesma métrica
// é reimplementada: trigramas de cada palavra (com o mesmo preenchimento de
// espaços que o pg_trgm usa) e similaridade de Jaccard entre os conjuntos.

// Mesmos limiares de `importacao.service.ts` — heurística inicial, ainda não
// calibrada com extrato bancário real (limitação registrada na spec).
export const CONFIANCA_ALTA = 0.4;
export const CONFIANCA_MEDIA = 0.2;

function trigramas(texto) {
  const conjunto = new Set();
  // Só `toLowerCase()`, como o `lower()` do SQL — sem remover acento: o
  // back-end também não usa `unaccent`, e o showcase não deve parecer mais
  // esperto do que o produto.
  const palavras = String(texto ?? '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  palavras.forEach((palavra) => {
    const preenchida = `  ${palavra} `;
    for (let indice = 0; indice < preenchida.length - 2; indice += 1) {
      conjunto.add(preenchida.slice(indice, indice + 3));
    }
  });
  return conjunto;
}

export function similaridade(textoA, textoB) {
  const a = trigramas(textoA);
  const b = trigramas(textoB);
  if (a.size === 0 || b.size === 0) return 0;
  let comuns = 0;
  a.forEach((trigrama) => {
    if (b.has(trigrama)) comuns += 1;
  });
  return comuns / (a.size + b.size - comuns);
}

/**
 * A empresa de maior similaridade com a descrição, se passar do limiar
 * mínimo — senão `null`, e o operador escolhe à mão. Nunca é aplicada sem
 * confirmação: quem decide é sempre a etapa 2 da importação.
 */
export function sugerirEmpresa(descricao, empresas) {
  let melhor = null;
  empresas.forEach((empresa) => {
    const pontuacao = similaridade(empresa.razaoSocial, descricao);
    if (!melhor || pontuacao > melhor.pontuacao) melhor = { empresa, pontuacao };
  });
  if (!melhor || melhor.pontuacao < CONFIANCA_MEDIA) return null;
  return {
    empresaId: melhor.empresa.id,
    empresaSugerida: melhor.empresa.razaoSocial,
    confiancaMatch: melhor.pontuacao >= CONFIANCA_ALTA ? 'ALTA' : 'MEDIA',
  };
}
