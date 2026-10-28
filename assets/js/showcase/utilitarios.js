// Utilitários da versão showcase — datas, gerador pseudoaleatório
// determinístico e CPF/CNPJ. Nada aqui existe no front-end de produção: são
// as peças que a camada de API falsa (../api.js) precisa para fazer, no
// navegador, o que o back-end real faz no PostgreSQL.

const pad = (numero) => String(numero).padStart(2, '0');

/**
 * PRNG mulberry32. Determinístico de propósito: a mesma semente gera sempre a
 * mesma base fictícia, então dois visitantes veem os mesmos números e um bug
 * de tela é reproduzível. `Math.random()` daria uma base diferente a cada
 * restauração.
 */
export function criarSorteador(semente) {
  let estado = semente >>> 0;
  function numero() {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    numero,
    inteiro: (minimo, maximo) => minimo + Math.floor(numero() * (maximo - minimo + 1)),
    escolher: (lista) => lista[Math.floor(numero() * lista.length)],
    chance: (probabilidade) => numero() < probabilidade,
  };
}

export function gerarId(prefixo = 'id') {
  const aleatorio =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
  return `${prefixo}-${aleatorio}`;
}

export function somenteDigitos(valor) {
  return String(valor ?? '').replace(/\D/g, '');
}

/** Minúsculas e sem acento — busca por nome tolerante a "Joao" x "João". */
export function normalizarTexto(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

// --- Datas ---------------------------------------------------------------
// Toda data de negócio é string `YYYY-MM-DD` (o equivalente ao `DATE` do
// Postgres). A aritmética passa por UTC para não sofrer com horário de verão;
// "hoje" é a data local do navegador, a mesma que o usuário vê no calendário.

export function hojeIso() {
  const agora = new Date();
  return `${agora.getFullYear()}-${pad(agora.getMonth() + 1)}-${pad(agora.getDate())}`;
}

/**
 * "Hoje" em UTC — é a referência do back-end para rejeitar data futura
 * (`hojeUtcMeiaNoite()`), e a mesma que o `max` dos campos de data da UI usa.
 * Perto da meia-noite no Brasil ela já é o dia seguinte da data local.
 */
export function hojeUtcIso() {
  return new Date().toISOString().slice(0, 10);
}

export function agoraIso() {
  return new Date().toISOString();
}

function paraDataUtc(iso) {
  const [ano, mes, dia] = iso.split('-').map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia));
}

function deDataUtc(data) {
  return data.toISOString().slice(0, 10);
}

export function somarDias(iso, dias) {
  const data = paraDataUtc(iso);
  data.setUTCDate(data.getUTCDate() + dias);
  return deDataUtc(data);
}

export function menorData(a, b) {
  return a <= b ? a : b;
}

export function maiorData(a, b) {
  return a >= b ? a : b;
}

/** Carimbo de data/hora para históricos gerados (13h UTC = 10h em Brasília). */
export function carimbo(dataIso, hora = '13:00') {
  return `${dataIso}T${hora}:00.000Z`;
}

// --- Competências (YYYY-MM) ------------------------------------------------
// Espelho do `shared/utils/competencia.ts` do back-end: a data de referência
// de uma competência é o último dia do mês (RN-CTR-04).

export function competenciaAtual() {
  return hojeIso().slice(0, 7);
}

export function somarMeses(competencia, meses) {
  const [ano, mes] = competencia.split('-').map(Number);
  return deDataUtc(new Date(Date.UTC(ano, mes - 1 + meses, 1))).slice(0, 7);
}

export function primeiroDia(competencia) {
  return `${competencia}-01`;
}

export function ultimoDia(competencia) {
  return somarDias(primeiroDia(somarMeses(competencia, 1)), -1);
}

/** As `quantidade` últimas competências, da mais antiga para a atual. */
export function ultimasCompetencias(quantidade) {
  const atual = competenciaAtual();
  return Array.from({ length: quantidade }, (_, indice) => somarMeses(atual, indice - quantidade + 1));
}

// --- CPF / CNPJ ----------------------------------------------------------
// Mesmo algoritmo de `shared/utils/cpf.ts` e `cnpj.ts`: dígito verificador e
// rejeição de sequências repetidas. Os documentos gerados são
// matematicamente válidos, mas fictícios.

function digitoCpf(digitos) {
  const soma = digitos.reduce((total, digito, indice) => total + digito * (digitos.length + 1 - indice), 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function cpfValido(cpf) {
  const limpo = somenteDigitos(cpf);
  if (limpo.length !== 11 || /^(\d)\1{10}$/.test(limpo)) return false;
  const digitos = [...limpo].map(Number);
  return digitoCpf(digitos.slice(0, 9)) === digitos[9] && digitoCpf(digitos.slice(0, 10)) === digitos[10];
}

export function gerarCpf(sorteador) {
  let base;
  do {
    base = Array.from({ length: 9 }, () => sorteador.inteiro(0, 9));
  } while (new Set(base).size === 1);
  const primeiro = digitoCpf(base);
  const segundo = digitoCpf([...base, primeiro]);
  return [...base, primeiro, segundo].join('');
}

const PESOS_CNPJ_1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const PESOS_CNPJ_2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

function digitoCnpj(digitos) {
  const pesos = digitos.length === 12 ? PESOS_CNPJ_1 : PESOS_CNPJ_2;
  const soma = digitos.reduce((total, digito, indice) => total + digito * pesos[indice], 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function cnpjValido(cnpj) {
  const limpo = somenteDigitos(cnpj);
  if (limpo.length !== 14 || /^(\d)\1{13}$/.test(limpo)) return false;
  const digitos = [...limpo].map(Number);
  return digitoCnpj(digitos.slice(0, 12)) === digitos[12] && digitoCnpj(digitos.slice(0, 13)) === digitos[13];
}

/** Completa uma base de 12 dígitos (raiz + filial) com os dois verificadores. */
export function completarCnpj(base12) {
  const digitos = [...base12].map(Number);
  const primeiro = digitoCnpj(digitos);
  const segundo = digitoCnpj([...digitos, primeiro]);
  return `${base12}${primeiro}${segundo}`;
}
