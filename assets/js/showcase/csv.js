// CSV da versão showcase — as mesmas convenções de `shared/utils/csv.ts`,
// `dinheiro.ts` e `cpf.ts`/`cnpj.ts` do back-end: BOM UTF-8 para o Excel abrir
// acento certo, quebra de linha CRLF, mitigação de CSV Injection (OWASP) e
// valores em reais com vírgula decimal (`9.360,00`) — a única parte do
// sistema em que o dinheiro deixa de ser inteiro em centavos, porque o CSV é
// lido por uma pessoa numa planilha.

const PREFIXOS_FORMULA = ['=', '+', '-', '@'];

/** Texto livre que começa com `=`, `+`, `-` ou `@` viraria fórmula no Excel. */
export function neutralizarFormulaCsv(valor) {
  const aparado = String(valor ?? '').trim();
  return PREFIXOS_FORMULA.some((prefixo) => aparado.startsWith(prefixo)) ? `'${valor}` : String(valor ?? '');
}

function escaparCampo(campo) {
  const texto = String(campo ?? '');
  return /[",\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

export function paraLinhaCsv(campos) {
  return campos.map(escaparCampo).join(',');
}

export function montarCsv(linhas) {
  return `﻿${linhas.join('\r\n')}`;
}

export function formatarCentavosComoReais(centavos) {
  const negativo = centavos < 0;
  const absoluto = Math.abs(Math.trunc(centavos));
  const reais = String(Math.floor(absoluto / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negativo ? '-' : ''}${reais},${String(absoluto % 100).padStart(2, '0')}`;
}

export function formatarDataBr(iso) {
  if (!iso) return '';
  const [ano, mes, dia] = iso.slice(0, 10).split('-');
  return `${dia}/${mes}/${ano}`;
}

export function formatarCpfComMascara(cpf) {
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
}

export function formatarCnpjComMascara(cnpj) {
  return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`;
}

/**
 * Quebra UMA linha de CSV respeitando aspas (RFC 4180). Cada linha do arquivo
 * é uma linha de dados — suficiente para o extrato de colunas fixas da
 * importação assistida, não um parser genérico (mesma limitação do back-end).
 */
export function analisarLinhaCsv(linha) {
  const campos = [];
  let atual = '';
  let entreAspas = false;
  for (let indice = 0; indice < linha.length; indice += 1) {
    const caractere = linha[indice];
    if (entreAspas) {
      if (caractere === '"' && linha[indice + 1] === '"') {
        atual += '"';
        indice += 1;
      } else if (caractere === '"') {
        entreAspas = false;
      } else {
        atual += caractere;
      }
    } else if (caractere === '"') {
      entreAspas = true;
    } else if (caractere === ',') {
      campos.push(atual);
      atual = '';
    } else {
      atual += caractere;
    }
  }
  campos.push(atual);
  return campos;
}

/** Dispara o download no navegador, como `baixarRelatorioCsv` do front real. */
export function baixarArquivo(nome, conteudo) {
  const blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nome;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
