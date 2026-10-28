// Camada de API FALSA — a versão showcase do `public/assets/js/api.js`.
//
// Mesmo nome de função, mesma assinatura e mesmo formato de retorno do módulo
// real, então as telas (dashboard.js, filiados.js, conciliacao.js...) rodam
// SEM nenhuma alteração: é só trocar este arquivo. Nada aqui usa a rede. As
// regras que o back-end aplica (RBAC por perfil, transições de status,
// vigência, estorno, divergência) são reaplicadas sobre a base fictícia de
// `showcase/banco-ficticio.js`, e os cálculos analíticos vêm de
// `showcase/motor-calculo.js`.
//
// Os códigos de erro são os do catálogo fechado do produto (13 códigos), e as
// mensagens são as do back-end real — a validação que o usuário vê é a mesma.
//
// Isto NUNCA deve ser usado fora do showcase.

import {
  calcularMetricasDashboard,
  listarVencimentos,
  montarConciliacao,
  montarEspelhoDaEmpresa,
  montarEspelhoPorEmpresa,
  montarEvolucao,
  resolverPlanoDoFiliado,
  resumoMensalDaEmpresa,
  valorVigenteDoPlano,
} from './showcase/motor-calculo.js';
import { carregarBanco, salvarBanco, SENHA_DEMO, USUARIOS_DEMO } from './showcase/banco-ficticio.js';
import {
  analisarLinhaCsv,
  baixarArquivo,
  formatarCentavosComoReais,
  formatarCnpjComMascara,
  formatarCpfComMascara,
  formatarDataBr,
  montarCsv,
  neutralizarFormulaCsv,
  paraLinhaCsv,
} from './showcase/csv.js';
import { desenharQrCode, montarBrCode } from './showcase/pix-br-code.js';
import { sugerirEmpresa } from './showcase/similaridade-texto.js';
import {
  agoraIso,
  competenciaAtual,
  cnpjValido,
  cpfValido,
  gerarId,
  hojeIso,
  hojeUtcIso,
  maiorData,
  normalizarTexto,
  somarDias,
  somenteDigitos,
} from './showcase/utilitarios.js';

// --- Erros ----------------------------------------------------------------

/**
 * @typedef {'rede' | 'rate_limit' | 'multiplos_sindicatos' | 'erro'} TipoErroApi
 */
export class ApiError extends Error {
  /**
   * @param {{ tipo: TipoErroApi, mensagem: string, statusCode?: number, code?: string, sindicatos?: Array<{id: string, nome: string}> }} args
   */
  constructor({ tipo, mensagem, statusCode, code, sindicatos }) {
    super(mensagem);
    this.tipo = tipo;
    this.statusCode = statusCode;
    this.code = code;
    this.sindicatos = sindicatos;
  }
}

function falhar(statusCode, code, mensagem) {
  return new ApiError({ tipo: 'erro', mensagem, statusCode, code });
}

/** Igual ao front real: `VALIDATION_ERROR` mostra o motivo específico do campo. */
function erroDeValidacao(mensagem, details) {
  const texto = details?.length ? details.map((detalhe) => detalhe.issue).join(' ') : mensagem;
  return falhar(400, 'VALIDATION_ERROR', texto);
}

const naoEncontrado = (recurso) => falhar(404, 'RESOURCE_NOT_FOUND', `${recurso} não encontrado.`);

function atraso(ms = 220) {
  return new Promise((resolve) => setTimeout(resolve, ms + Math.round(Math.random() * 120)));
}

// --- Sessão e RBAC -----------------------------------------------------------
// O token falso carrega só o id do usuário. O perfil é relido da lista de
// usuários a cada chamada — o equivalente a validar o JWT e aplicar o
// `rbacMiddleware`, que no produto roda antes de qualquer controller.

const PREFIXO_TOKEN = 'showcase-token.';

function usuarioDoToken(token) {
  const usuario = USUARIOS_DEMO.find((item) => `${PREFIXO_TOKEN}${item.id}` === token);
  if (!usuario) throw falhar(401, 'TOKEN_INVALID', 'Token de autenticação inválido ou expirado.');
  return usuario;
}

function autorizar(token, perfis) {
  const usuario = usuarioDoToken(token);
  if (perfis && !perfis.includes(usuario.perfil)) {
    throw falhar(403, 'FORBIDDEN_RESOURCE', 'Perfil sem permissão para acessar este recurso.');
  }
  return usuario;
}

const ADMIN = ['ADMIN'];
const GESTAO = ['ADMIN', 'TESOUREIRO'];
const CADASTRO = ['ADMIN', 'SECRETARIO'];

function paraUsuarioPublico(usuario, banco) {
  return {
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    perfil: usuario.perfil,
    sindicato: { id: banco.sindicato.id, nome: banco.sindicato.nome },
  };
}

// --- Apoio --------------------------------------------------------------------

const PADRAO_COMPETENCIA = /^\d{4}-(0[1-9]|1[0-2])$/;

function exigirCompetencia(competencia, { permitirFutura = false } = {}) {
  if (!competencia || !PADRAO_COMPETENCIA.test(competencia)) {
    throw erroDeValidacao('Dados inválidos.', [{ field: 'competencia', issue: 'Competência deve estar no formato YYYY-MM.' }]);
  }
  if (!permitirFutura && competencia > competenciaAtual()) {
    throw erroDeValidacao('Dados inválidos.', [{ field: 'competencia', issue: 'Competência não pode ser futura.' }]);
  }
}

function paginar(lista, { page, limit } = {}) {
  const pagina = Math.max(1, Number(page) || 1);
  const tamanho = Math.min(100, Math.max(1, Number(limit) || 20));
  const totalRecords = lista.length;
  const inicio = (pagina - 1) * tamanho;
  return {
    data: lista.slice(inicio, inicio + tamanho),
    pagination: { page: pagina, limit: tamanho, totalRecords, totalPages: Math.max(1, Math.ceil(totalRecords / tamanho)) },
  };
}

/** Ordenação genérica `campo` / `-campo`, nulos sempre por último. */
function ordenar(lista, sort, padrao) {
  const chave = sort || padrao;
  const campo = chave.replace(/^-/, '');
  const direcao = chave.startsWith('-') ? -1 : 1;
  return [...lista].sort((a, b) => {
    const va = a[campo];
    const vb = b[campo];
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    const comparacao = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb), 'pt-BR');
    return comparacao * direcao;
  });
}

function textoContem(texto, termo) {
  return normalizarTexto(texto).includes(normalizarTexto(termo));
}

function vazioParaNulo(valor) {
  const texto = typeof valor === 'string' ? valor.trim() : valor;
  return texto === '' || texto === undefined ? null : texto;
}

function vinculoAtual(banco, filiadoId) {
  return banco.vinculos.find((vinculo) => vinculo.filiadoId === filiadoId && vinculo.statusVinculo === 'ATUAL') ?? null;
}

// --- Autenticação -------------------------------------------------------------

/** POST /api/v1/auth/login */
export async function login({ email, senha }) {
  await atraso();
  const usuario = USUARIOS_DEMO.find((item) => item.email.toLowerCase() === String(email).trim().toLowerCase());
  if (!usuario || senha !== SENHA_DEMO) {
    throw falhar(401, 'INVALID_CREDENTIALS', 'E-mail ou senha incorretos.');
  }
  return {
    token: `${PREFIXO_TOKEN}${usuario.id}`,
    expiresIn: 28800,
    usuario: paraUsuarioPublico(usuario, carregarBanco()),
  };
}

/** GET /api/v1/auth/me */
export async function obterUsuarioAutenticado(token) {
  await atraso(80);
  return paraUsuarioPublico(usuarioDoToken(token), carregarBanco());
}

// --- Filiados -------------------------------------------------------------------

const CAMPOS_CADASTRO = [
  'nomeCompleto', 'cpf', 'matricula', 'rg', 'dataNascimento', 'sexo', 'estadoCivil', 'email', 'telefone', 'celular',
  'cep', 'logradouro', 'numero', 'bairro', 'cidade', 'uf', 'dataFiliacao', 'dataVigenciaInicio', 'dataVigenciaFim',
  'observacoes',
];

const TRANSICOES_STATUS = {
  ATIVO: ['INATIVO', 'AFASTADO', 'APOSENTADO'],
  INATIVO: ['ATIVO'],
  AFASTADO: ['ATIVO', 'INATIVO'],
  APOSENTADO: ['INATIVO'],
};

function exposicaoDoCpf(filiado) {
  return filiado.anonimizadoEm ? null : filiado.cpf;
}

function descreverPlano(banco, filiado) {
  const efetivo = resolverPlanoDoFiliado(banco, filiado);
  if (!efetivo) return null;
  return {
    id: efetivo.plano.id,
    codigo: efetivo.plano.codigo,
    nome: efetivo.plano.nome,
    descricao: efetivo.plano.descricao ?? null,
    origem: efetivo.origem,
    valorVigenteCentavos: valorVigenteDoPlano(banco, efetivo.plano.id, hojeIso()),
  };
}

function detalheDoFiliado(banco, filiado) {
  return {
    ...Object.fromEntries(CAMPOS_CADASTRO.map((campo) => [campo, filiado[campo] ?? null])),
    id: filiado.id,
    cpf: exposicaoDoCpf(filiado),
    statusCadastral: filiado.statusCadastral,
    // RN-FIL-04: vigência vencida não muda o status — só acende o alerta.
    vigenciaExpirada: !!filiado.dataVigenciaFim && filiado.dataVigenciaFim < hojeIso(),
    historicoStatus: filiado.historicoStatus,
    historicoMovimentacoes: filiado.historicoMovimentacoes,
    planoContribuicao: descreverPlano(banco, filiado),
    anonimizadoEm: filiado.anonimizadoEm,
    createdAt: filiado.createdAt,
    updatedAt: filiado.updatedAt,
  };
}

function exigirFiliado(banco, id) {
  const filiado = banco.filiados.find((item) => item.id === id);
  if (!filiado) throw naoEncontrado('Filiado');
  return filiado;
}

/** Valida o corpo de POST/PUT e devolve os campos normalizados. */
function validarCadastro(banco, dados, { ignorarId = null } = {}) {
  const campos = Object.fromEntries(CAMPOS_CADASTRO.map((campo) => [campo, vazioParaNulo(dados[campo])]));
  const problemas = [];
  const hoje = hojeUtcIso();

  if (!campos.nomeCompleto) problemas.push({ field: 'nomeCompleto', issue: 'Nome completo é obrigatório.' });
  if (!campos.dataNascimento) problemas.push({ field: 'dataNascimento', issue: 'Data de nascimento é obrigatória.' });
  else if (campos.dataNascimento > hoje) {
    problemas.push({ field: 'dataNascimento', issue: 'Data de nascimento não pode ser futura.' });
  }
  if (!campos.dataFiliacao) problemas.push({ field: 'dataFiliacao', issue: 'Data de filiação é obrigatória.' });
  else if (campos.dataFiliacao > hoje) {
    problemas.push({ field: 'dataFiliacao', issue: 'Data de filiação não pode ser futura.' });
  }
  campos.dataVigenciaInicio ??= campos.dataFiliacao;
  if (campos.dataVigenciaFim && campos.dataVigenciaInicio && campos.dataVigenciaFim < campos.dataVigenciaInicio) {
    problemas.push({ field: 'dataVigenciaFim', issue: 'A vigência não pode terminar antes de começar.' });
  }
  if (problemas.length > 0) throw erroDeValidacao('Dados inválidos.', problemas);

  const cpf = somenteDigitos(campos.cpf);
  if (!cpfValido(cpf)) throw falhar(400, 'INVALID_CPF', 'CPF inválido.');
  // RN-FIL-02: no produto, a garantia real é a constraint única do banco.
  if (banco.filiados.some((item) => item.cpf === cpf && item.id !== ignorarId)) {
    throw falhar(409, 'DUPLICATE_CPF', 'CPF já cadastrado para este sindicato.');
  }
  campos.cpf = cpf;
  return campos;
}

/** GET /api/v1/filiados */
export async function listarFiliados(token, filtros = {}) {
  await atraso();
  autorizar(token);
  const banco = carregarBanco();
  let lista = banco.filiados;
  if (filtros.nome) lista = lista.filter((filiado) => textoContem(filiado.nomeCompleto, filtros.nome));
  // CPF é busca exata (no produto, por `cpf_hash`) — nunca por trecho.
  if (filtros.cpf) lista = lista.filter((filiado) => !filiado.anonimizadoEm && filiado.cpf === somenteDigitos(filtros.cpf));
  if (filtros.matricula) lista = lista.filter((filiado) => textoContem(filiado.matricula ?? '', filtros.matricula));
  if (filtros.status) lista = lista.filter((filiado) => filiado.statusCadastral === filtros.status);

  const linhas = lista.map((filiado) => ({
    id: filiado.id,
    nomeCompleto: filiado.nomeCompleto,
    cpf: exposicaoDoCpf(filiado),
    matricula: filiado.matricula,
    statusCadastral: filiado.statusCadastral,
    dataFiliacao: filiado.dataFiliacao,
    dataVigenciaFim: filiado.dataVigenciaFim,
  }));
  return paginar(ordenar(linhas, filtros.sort, 'nomeCompleto'), filtros);
}

/** GET /api/v1/filiados/:id */
export async function obterFiliado(token, id) {
  await atraso();
  autorizar(token);
  const banco = carregarBanco();
  return detalheDoFiliado(banco, exigirFiliado(banco, id));
}

/** POST /api/v1/filiados */
export async function criarFiliado(token, dados) {
  await atraso();
  autorizar(token, CADASTRO);
  const banco = carregarBanco();
  const campos = validarCadastro(banco, dados);
  const agora = agoraIso();
  const filiado = {
    ...campos,
    id: gerarId('fil'),
    statusCadastral: 'ATIVO',
    planoContribuicaoId: null,
    anonimizadoEm: null,
    historicoStatus: [],
    historicoMovimentacoes: [],
    createdAt: agora,
    updatedAt: agora,
  };
  banco.filiados.push(filiado);
  salvarBanco(banco);
  return {
    id: filiado.id,
    nomeCompleto: filiado.nomeCompleto,
    cpf: filiado.cpf,
    matricula: filiado.matricula,
    statusCadastral: filiado.statusCadastral,
    dataFiliacao: filiado.dataFiliacao,
    createdAt: filiado.createdAt,
  };
}

/** PUT /api/v1/filiados/:id — substituição total (RN-FIL-05). */
export async function atualizarFiliado(token, id, dados) {
  await atraso();
  autorizar(token, CADASTRO);
  const banco = carregarBanco();
  const filiado = exigirFiliado(banco, id);
  // RN-FIL-07: status só muda por PATCH /status, que exige motivo e grava histórico.
  if ('statusCadastral' in dados) {
    throw erroDeValidacao('Dados inválidos.', [
      { field: 'statusCadastral', issue: 'O status só pode ser alterado em PATCH /filiados/:id/status.' },
    ]);
  }
  Object.assign(filiado, validarCadastro(banco, dados, { ignorarId: id }), { updatedAt: agoraIso() });
  salvarBanco(banco);
  return detalheDoFiliado(banco, filiado);
}

/** PATCH /api/v1/filiados/:id/status */
export async function alterarStatusFiliado(token, id, { novoStatus, motivo }) {
  await atraso();
  const usuario = autorizar(token, CADASTRO);
  const banco = carregarBanco();
  const filiado = exigirFiliado(banco, id);

  const motivoLimpo = String(motivo ?? '').trim();
  if (motivoLimpo.length < 5 || motivoLimpo.length > 255) {
    throw erroDeValidacao('Dados inválidos.', [{ field: 'motivo', issue: 'O motivo deve ter entre 5 e 255 caracteres.' }]);
  }
  // RN-FIL-03: a matriz de transições é estrutura de dados, não cadeia de `if`.
  const permitidos = TRANSICOES_STATUS[filiado.statusCadastral] ?? [];
  if (!permitidos.includes(novoStatus)) {
    throw falhar(
      400,
      'INVALID_STATUS_TRANSITION',
      `Não é possível mudar de "${filiado.statusCadastral}" para "${novoStatus}". ` +
        `Destinos permitidos a partir de "${filiado.statusCadastral}": ${permitidos.join(', ')}.`,
    );
  }

  const statusAnterior = filiado.statusCadastral;
  const agora = agoraIso();
  filiado.historicoStatus.unshift({
    statusAnterior,
    statusNovo: novoStatus,
    motivo: motivoLimpo,
    alteradoPor: usuario.nome,
    createdAt: agora,
  });
  filiado.statusCadastral = novoStatus;
  filiado.updatedAt = agora;
  salvarBanco(banco);
  return { id: filiado.id, statusAnterior, novoStatus, updatedAt: agora };
}

/** PATCH /api/v1/filiados/:id/renovar-vigencia */
export async function renovarVigenciaFiliado(token, id, { novaDataVigenciaFim }) {
  await atraso();
  const usuario = autorizar(token, CADASTRO);
  const banco = carregarBanco();
  const filiado = exigirFiliado(banco, id);

  if (!filiado.dataVigenciaFim) {
    throw erroDeValidacao('Dados inválidos.', [
      { field: 'novaDataVigenciaFim', issue: 'Filiado não possui vigência definida para renovar.' },
    ]);
  }
  if (!novaDataVigenciaFim || novaDataVigenciaFim <= filiado.dataVigenciaFim) {
    throw erroDeValidacao('Dados inválidos.', [
      { field: 'novaDataVigenciaFim', issue: 'Nova data de vigência precisa ser posterior à atual.' },
    ]);
  }

  const anterior = filiado.dataVigenciaFim;
  const agora = agoraIso();
  filiado.historicoMovimentacoes.unshift({
    tipoMovimentacao: 'RENOVACAO_VIGENCIA',
    descricao: `Vigência renovada de ${formatarDataBr(anterior)} para ${formatarDataBr(novaDataVigenciaFim)}.`,
    registradoPor: usuario.nome,
    createdAt: agora,
  });
  filiado.dataVigenciaFim = novaDataVigenciaFim;
  filiado.updatedAt = agora;
  salvarBanco(banco);
  return { id: filiado.id, dataVigenciaFimAnterior: anterior, dataVigenciaFimNova: novaDataVigenciaFim, updatedAt: agora };
}

/** POST /api/v1/filiados/:id/anonimizar — irreversível, só ADMIN (RN-LGPD-02). */
export async function anonimizarFiliado(token, id) {
  await atraso();
  const usuario = autorizar(token, ADMIN);
  const banco = carregarBanco();
  const filiado = exigirFiliado(banco, id);
  if (filiado.anonimizadoEm) {
    throw erroDeValidacao('Este filiado já foi anonimizado.');
  }

  const agora = agoraIso();
  // Mesmos campos que `CAMPOS_ANONIMIZACAO` do back-end. O CPF não é apagado
  // (a unicidade continua valendo), mas deixa de ser exposto pela API.
  Object.assign(filiado, {
    nomeCompleto: 'Filiado Anonimizado',
    email: null,
    telefone: null,
    celular: null,
    rg: null,
    logradouro: null,
    numero: null,
    bairro: null,
    cep: null,
    dataNascimento: '1900-01-01',
    sexo: null,
    estadoCivil: null,
    observacoes: null,
    anonimizadoEm: agora,
    updatedAt: agora,
  });
  filiado.historicoMovimentacoes.unshift({
    tipoMovimentacao: 'ANONIMIZACAO',
    descricao: 'Filiado anonimizado (direito ao esquecimento, RN-LGPD-02).',
    registradoPor: usuario.nome,
    createdAt: agora,
  });
  salvarBanco(banco);
  return { id: filiado.id, anonimizadoEm: agora };
}

/** PATCH /api/v1/filiados/:id/plano-contribuicao */
export async function atualizarPlanoContribuicaoFiliado(token, id, { planoContribuicaoId }) {
  await atraso();
  autorizar(token, CADASTRO);
  const banco = carregarBanco();
  const filiado = exigirFiliado(banco, id);
  if (planoContribuicaoId && !banco.planos.some((plano) => plano.id === planoContribuicaoId)) {
    throw naoEncontrado('Plano de contribuição');
  }
  filiado.planoContribuicaoId = planoContribuicaoId ?? null;
  filiado.updatedAt = agoraIso();
  salvarBanco(banco);
  return { id: filiado.id, planoContribuicaoId: filiado.planoContribuicaoId, updatedAt: filiado.updatedAt };
}

// --- Vínculos profissionais -------------------------------------------------------

function paraVinculoPublico(vinculo) {
  return {
    id: vinculo.id,
    empresaId: vinculo.empresaId,
    empresaNome: vinculo.empresaNome,
    empresaCnpj: vinculo.empresaCnpj,
    cargoFuncao: vinculo.cargoFuncao,
    dataAdmissao: vinculo.dataAdmissao,
    dataDesligamento: vinculo.dataDesligamento,
    statusVinculo: vinculo.statusVinculo,
  };
}

/** GET /api/v1/filiados/:filiadoId/vinculos */
export async function listarVinculos(token, filiadoId) {
  await atraso(120);
  autorizar(token);
  const banco = carregarBanco();
  exigirFiliado(banco, filiadoId);
  return banco.vinculos
    .filter((vinculo) => vinculo.filiadoId === filiadoId)
    .sort((a, b) => b.dataAdmissao.localeCompare(a.dataAdmissao))
    .map(paraVinculoPublico);
}

/** POST /api/v1/filiados/:filiadoId/vinculos — abre o novo e fecha o anterior (RN-ASS-02). */
export async function criarVinculo(token, filiadoId, { empresaId, cargoFuncao, dataAdmissao }) {
  await atraso();
  const usuario = autorizar(token, CADASTRO);
  const banco = carregarBanco();
  const filiado = exigirFiliado(banco, filiadoId);

  const problemas = [];
  if (!String(cargoFuncao ?? '').trim()) problemas.push({ field: 'cargoFuncao', issue: 'Cargo/função é obrigatório.' });
  if (!dataAdmissao) problemas.push({ field: 'dataAdmissao', issue: 'Data de admissão é obrigatória.' });
  else if (dataAdmissao > hojeUtcIso()) problemas.push({ field: 'dataAdmissao', issue: 'Data de admissão não pode ser futura.' });
  if (problemas.length > 0) throw erroDeValidacao('Dados inválidos.', problemas);

  const empresa = banco.empresas.find((item) => item.id === empresaId);
  if (!empresa) throw naoEncontrado('Empresa');
  // RN-EMP-02: empresa inativa não aceita novos vínculos.
  if (empresa.status === 'INATIVA') {
    throw erroDeValidacao('Dados inválidos.', [{ field: 'empresaId', issue: 'Empresa inativa não aceita novos vínculos.' }]);
  }

  const anterior = vinculoAtual(banco, filiadoId);
  if (anterior) {
    anterior.statusVinculo = 'ENCERRADO';
    anterior.dataDesligamento = maiorData(dataAdmissao, anterior.dataAdmissao);
  }
  const agora = agoraIso();
  const vinculo = {
    id: gerarId('vin'),
    filiadoId,
    empresaId: empresa.id,
    // Snapshot no momento da abertura (RN-EMP-03): renomear a empresa depois
    // não reescreve o histórico de quem trabalhou lá sob o nome antigo.
    empresaNome: empresa.razaoSocial,
    empresaCnpj: empresa.cnpj,
    cargoFuncao: String(cargoFuncao).trim(),
    dataAdmissao,
    dataDesligamento: null,
    statusVinculo: 'ATUAL',
    createdAt: agora,
  };
  banco.vinculos.push(vinculo);
  if (anterior) {
    filiado.historicoMovimentacoes.unshift({
      tipoMovimentacao: 'MUDANCA_EMPRESA',
      descricao: `Vínculo com ${anterior.empresaNome} encerrado; novo vínculo com ${empresa.razaoSocial}.`,
      registradoPor: usuario.nome,
      createdAt: agora,
    });
  }
  salvarBanco(banco);
  return {
    id: vinculo.id,
    empresaId: vinculo.empresaId,
    empresaNome: vinculo.empresaNome,
    cargoFuncao: vinculo.cargoFuncao,
    dataAdmissao: vinculo.dataAdmissao,
    statusVinculo: vinculo.statusVinculo,
    createdAt: vinculo.createdAt,
  };
}

// --- Dashboard, vencimentos e relatórios -----------------------------------------------

/** GET /api/v1/dashboard/metrics */
export async function obterMetricasDashboard(token) {
  await atraso();
  autorizar(token, GESTAO);
  return calcularMetricasDashboard(carregarBanco());
}

/** GET /api/v1/filiados/vencimentos-proximos */
export async function listarVencimentosProximos(token, filtros = {}) {
  await atraso();
  autorizar(token);
  const dias = Number(filtros.dias) || 30;
  return paginar(listarVencimentos(carregarBanco(), dias), filtros);
}

function linhasDoRelatorioDeFiliados(banco, filtros) {
  let lista = banco.filiados;
  if (filtros.status) lista = lista.filter((filiado) => filiado.statusCadastral === filtros.status);
  if (filtros.dataInicioFiliacao) lista = lista.filter((filiado) => filiado.dataFiliacao >= filtros.dataInicioFiliacao);
  if (filtros.dataFimFiliacao) lista = lista.filter((filiado) => filiado.dataFiliacao <= filtros.dataFimFiliacao);
  return [...lista]
    .sort((a, b) => a.nomeCompleto.localeCompare(b.nomeCompleto, 'pt-BR'))
    .map((filiado) => {
      const vinculo = vinculoAtual(banco, filiado.id);
      return {
        nomeCompleto: filiado.nomeCompleto,
        cpf: exposicaoDoCpf(filiado),
        matricula: filiado.matricula,
        statusCadastral: filiado.statusCadastral,
        dataFiliacao: filiado.dataFiliacao,
        dataVigenciaFim: filiado.dataVigenciaFim,
        empresaNome: vinculo?.empresaNome ?? null,
        cargoFuncao: vinculo?.cargoFuncao ?? null,
      };
    });
}

/** GET /api/v1/reports/filiados?format=json — prévia paginada. */
export async function obterRelatorio(token, filtros = {}) {
  await atraso();
  autorizar(token, GESTAO);
  return paginar(linhasDoRelatorioDeFiliados(carregarBanco(), filtros), filtros);
}

/** GET /api/v1/reports/filiados?format=csv */
export async function baixarRelatorioCsv(token, filtros = {}) {
  await atraso();
  autorizar(token, GESTAO);
  const linhas = linhasDoRelatorioDeFiliados(carregarBanco(), filtros);
  const csv = montarCsv([
    paraLinhaCsv(['Nome Completo', 'CPF', 'Matrícula', 'Status', 'Data Filiação', 'Vigência Fim', 'Empresa', 'Cargo']),
    ...linhas.map((linha) =>
      paraLinhaCsv([
        neutralizarFormulaCsv(linha.nomeCompleto),
        linha.cpf ? formatarCpfComMascara(linha.cpf) : '',
        neutralizarFormulaCsv(linha.matricula ?? ''),
        linha.statusCadastral,
        formatarDataBr(linha.dataFiliacao),
        formatarDataBr(linha.dataVigenciaFim),
        neutralizarFormulaCsv(linha.empresaNome ?? ''),
        neutralizarFormulaCsv(linha.cargoFuncao ?? ''),
      ]),
    ),
  ]);
  baixarArquivo('filiados.csv', csv);
}

// --- Empresas ---------------------------------------------------------------------------

function exigirEmpresa(banco, id) {
  const empresa = banco.empresas.find((item) => item.id === id);
  if (!empresa) throw naoEncontrado('Empresa');
  return empresa;
}

const CAMPOS_EMPRESA = [
  'razaoSocial', 'nomeFantasia', 'emailContato', 'telefoneContato', 'responsavelNome', 'cep', 'logradouro', 'numero',
  'bairro', 'municipio', 'uf', 'observacoes',
];

function detalheDaEmpresa(banco, empresa, { comResumo = true } = {}) {
  const base = {
    id: empresa.id,
    razaoSocial: empresa.razaoSocial,
    nomeFantasia: empresa.nomeFantasia ?? null,
    cnpj: empresa.cnpj,
    status: empresa.status,
    emailContato: empresa.emailContato ?? null,
    telefoneContato: empresa.telefoneContato ?? null,
    responsavelNome: empresa.responsavelNome ?? null,
    cep: empresa.cep ?? null,
    logradouro: empresa.logradouro ?? null,
    numero: empresa.numero ?? null,
    bairro: empresa.bairro ?? null,
    municipio: empresa.municipio ?? null,
    uf: empresa.uf ?? null,
    observacoes: empresa.observacoes ?? null,
    createdAt: empresa.createdAt,
    updatedAt: empresa.updatedAt,
  };
  if (!comResumo) return base;
  // Mesmo ponto único de cálculo do espelho (RN-ESP-01) — nunca um cálculo próprio.
  return { ...base, ...resumoMensalDaEmpresa(banco, empresa.id, competenciaAtual()) };
}

/** GET /api/v1/empresas */
export async function listarEmpresas(token, filtros = {}) {
  await atraso();
  autorizar(token);
  const banco = carregarBanco();
  let lista = banco.empresas;
  if (filtros.razaoSocial) lista = lista.filter((empresa) => textoContem(empresa.razaoSocial, filtros.razaoSocial));
  if (filtros.cnpj) lista = lista.filter((empresa) => empresa.cnpj.includes(somenteDigitos(filtros.cnpj)));
  if (filtros.status) lista = lista.filter((empresa) => empresa.status === filtros.status);
  const linhas = lista.map((empresa) => ({
    id: empresa.id,
    razaoSocial: empresa.razaoSocial,
    nomeFantasia: empresa.nomeFantasia ?? null,
    cnpj: empresa.cnpj,
    status: empresa.status,
    municipio: empresa.municipio ?? null,
    uf: empresa.uf ?? null,
  }));
  return paginar(ordenar(linhas, filtros.sort, 'razaoSocial'), filtros);
}

/** POST /api/v1/empresas */
export async function criarEmpresa(token, dados) {
  await atraso();
  autorizar(token, CADASTRO);
  const banco = carregarBanco();

  if (!String(dados.razaoSocial ?? '').trim()) {
    throw erroDeValidacao('Dados inválidos.', [{ field: 'razaoSocial', issue: 'Razão social é obrigatória.' }]);
  }
  const cnpj = somenteDigitos(dados.cnpj);
  if (!cnpjValido(cnpj)) throw falhar(400, 'INVALID_CNPJ', 'CNPJ inválido.');
  if (banco.empresas.some((empresa) => empresa.cnpj === cnpj)) {
    throw falhar(409, 'DUPLICATE_CNPJ', 'CNPJ já cadastrado para este sindicato.');
  }

  const agora = agoraIso();
  const empresa = {
    id: gerarId('emp'),
    ...Object.fromEntries(CAMPOS_EMPRESA.map((campo) => [campo, vazioParaNulo(dados[campo])])),
    razaoSocial: dados.razaoSocial.trim(),
    cnpj,
    status: 'ATIVA',
    createdAt: agora,
    updatedAt: agora,
  };
  banco.empresas.push(empresa);
  salvarBanco(banco);
  return { id: empresa.id, razaoSocial: empresa.razaoSocial, cnpj: empresa.cnpj, status: empresa.status, createdAt: agora };
}

/** GET /api/v1/empresas/:id */
export async function obterEmpresa(token, id) {
  await atraso(120);
  autorizar(token);
  const banco = carregarBanco();
  return detalheDaEmpresa(banco, exigirEmpresa(banco, id));
}

/** PUT /api/v1/empresas/:id — substituição total; `cnpj` não é alterável. */
export async function atualizarEmpresa(token, id, dados) {
  await atraso();
  autorizar(token, CADASTRO);
  const banco = carregarBanco();
  const empresa = exigirEmpresa(banco, id);
  if (dados.cnpj !== undefined && somenteDigitos(dados.cnpj) !== empresa.cnpj) {
    throw erroDeValidacao('Dados inválidos.', [{ field: 'cnpj', issue: 'CNPJ não é alterável.' }]);
  }
  if (!String(dados.razaoSocial ?? '').trim()) {
    throw erroDeValidacao('Dados inválidos.', [{ field: 'razaoSocial', issue: 'Razão social é obrigatória.' }]);
  }
  Object.assign(
    empresa,
    Object.fromEntries(CAMPOS_EMPRESA.map((campo) => [campo, vazioParaNulo(dados[campo])])),
    { razaoSocial: dados.razaoSocial.trim(), updatedAt: agoraIso() },
  );
  salvarBanco(banco);
  return detalheDaEmpresa(banco, empresa);
}

/** PATCH /api/v1/empresas/:id/status — só ADMIN (RN-EMP-02). */
export async function alterarStatusEmpresa(token, id, { status, motivo }) {
  await atraso();
  autorizar(token, ADMIN);
  const banco = carregarBanco();
  const empresa = exigirEmpresa(banco, id);

  const motivoLimpo = String(motivo ?? '').trim();
  if (motivoLimpo.length < 5 || motivoLimpo.length > 500) {
    throw erroDeValidacao('Dados inválidos.', [{ field: 'motivo', issue: 'O motivo deve ter entre 5 e 500 caracteres.' }]);
  }
  if (empresa.status === status) {
    throw erroDeValidacao(`A empresa já está com o status ${status}.`, [
      { field: 'status', issue: 'O novo status precisa ser diferente do atual.' },
    ]);
  }
  const statusAnterior = empresa.status;
  empresa.status = status;
  empresa.updatedAt = agoraIso();
  salvarBanco(banco);
  return { id: empresa.id, statusAnterior, novoStatus: status, updatedAt: empresa.updatedAt };
}

// --- Planos de contribuição --------------------------------------------------------------

function valoresDoPlano(banco, planoId) {
  return banco.planoValores
    .filter((valor) => valor.planoId === planoId)
    .sort((a, b) => b.vigenciaInicio.localeCompare(a.vigenciaInicio))
    .map(({ id, valorCentavos, vigenciaInicio, vigenciaFim, createdAt }) => ({
      id, valorCentavos, vigenciaInicio, vigenciaFim, createdAt,
    }));
}

function exigirPlano(banco, id) {
  const plano = banco.planos.find((item) => item.id === id);
  if (!plano) throw naoEncontrado('Plano de contribuição');
  return plano;
}

/** POST /api/v1/planos-contribuicao */
export async function criarPlanoContribuicao(token, { codigo, nome, descricao }) {
  await atraso();
  autorizar(token, ADMIN);
  const banco = carregarBanco();
  const codigoLimpo = String(codigo ?? '').trim();
  const nomeLimpo = String(nome ?? '').trim();
  const problemas = [];
  if (!codigoLimpo) problemas.push({ field: 'codigo', issue: 'Código é obrigatório.' });
  else if (banco.planos.some((plano) => plano.codigo.toLowerCase() === codigoLimpo.toLowerCase())) {
    problemas.push({ field: 'codigo', issue: 'Já existe um plano com este código neste sindicato.' });
  }
  if (!nomeLimpo) problemas.push({ field: 'nome', issue: 'Nome é obrigatório.' });
  if (problemas.length > 0) throw erroDeValidacao('Dados inválidos.', problemas);

  const agora = agoraIso();
  const plano = {
    id: gerarId('plano'),
    codigo: codigoLimpo,
    nome: nomeLimpo,
    descricao: vazioParaNulo(descricao),
    ativo: true,
    createdAt: agora,
    updatedAt: agora,
  };
  banco.planos.push(plano);
  salvarBanco(banco);
  return { id: plano.id, codigo: plano.codigo, nome: plano.nome, ativo: true, createdAt: agora };
}

/** GET /api/v1/planos-contribuicao — array puro, sem envelope (planos são poucos). */
export async function listarPlanosContribuicao(token) {
  await atraso(120);
  autorizar(token, GESTAO);
  return carregarBanco()
    .planos.map(({ id, codigo, nome, descricao, ativo }) => ({ id, codigo, nome, descricao: descricao ?? null, ativo }))
    .sort((a, b) => a.codigo.localeCompare(b.codigo));
}

/** GET /api/v1/planos-contribuicao/:id */
export async function obterPlanoContribuicao(token, id) {
  await atraso();
  autorizar(token, GESTAO);
  const banco = carregarBanco();
  const plano = exigirPlano(banco, id);
  return {
    id: plano.id,
    codigo: plano.codigo,
    nome: plano.nome,
    descricao: plano.descricao ?? null,
    ativo: plano.ativo,
    valorVigenteCentavos: valorVigenteDoPlano(banco, plano.id, hojeIso()),
    valores: valoresDoPlano(banco, plano.id),
    createdAt: plano.createdAt,
    updatedAt: plano.updatedAt,
  };
}

/**
 * POST /api/v1/planos-contribuicao/:id/valores — reajuste (RN-CTR-01). Abre
 * uma vigência nova e fecha a aberta no dia anterior, sem deixar buraco.
 * Vigência é imutável: não existe PUT/DELETE de valor.
 */
export async function criarValorPlano(token, planoId, { valorCentavos, vigenciaInicio }) {
  await atraso();
  autorizar(token, ADMIN);
  const banco = carregarBanco();
  exigirPlano(banco, planoId);

  const problemas = [];
  if (!Number.isInteger(valorCentavos) || valorCentavos <= 0) {
    problemas.push({ field: 'valorCentavos', issue: 'O valor deve ser um inteiro positivo, em centavos.' });
  }
  if (!vigenciaInicio) problemas.push({ field: 'vigenciaInicio', issue: 'Início da vigência é obrigatório.' });
  if (problemas.length > 0) throw erroDeValidacao('Dados inválidos.', problemas);

  const existentes = banco.planoValores.filter((valor) => valor.planoId === planoId);
  const aberta = existentes.find((valor) => valor.vigenciaFim === null);
  const ultimoFim = existentes.reduce((maior, valor) => maiorData(maior, valor.vigenciaFim ?? valor.vigenciaInicio), '');

  if (aberta && vigenciaInicio <= aberta.vigenciaInicio) {
    throw falhar(409, 'VIGENCIA_SOBREPOSTA', 'A nova vigência precisa começar depois do início da vigência aberta atual.');
  }
  // No produto, quem pega este caso é a constraint de exclusão `EXCLUDE USING gist`.
  if (!aberta && ultimoFim && vigenciaInicio <= ultimoFim) {
    throw falhar(409, 'VIGENCIA_SOBREPOSTA', 'A vigência informada se sobrepõe a uma vigência já existente para este plano.');
  }

  if (aberta) aberta.vigenciaFim = somarDias(vigenciaInicio, -1);
  const novo = { id: gerarId('valor'), planoId, valorCentavos, vigenciaInicio, vigenciaFim: null, createdAt: agoraIso() };
  banco.planoValores.push(novo);
  salvarBanco(banco);
  return { id: novo.id, valorCentavos, vigenciaInicio, vigenciaFim: null, createdAt: novo.createdAt };
}

/** GET /api/v1/sindicato/plano-padrao */
export async function obterPlanoPadraoSindicato(token) {
  await atraso(120);
  autorizar(token, GESTAO);
  const banco = carregarBanco();
  const plano = banco.planos.find((item) => item.id === banco.sindicato.planoContribuicaoPadraoId);
  return {
    sindicatoId: banco.sindicato.id,
    planoContribuicao: plano
      ? {
          id: plano.id,
          codigo: plano.codigo,
          nome: plano.nome,
          descricao: plano.descricao ?? null,
          valorVigenteCentavos: valorVigenteDoPlano(banco, plano.id, hojeIso()),
        }
      : null,
  };
}

/** PATCH /api/v1/sindicato/plano-padrao */
export async function atualizarPlanoPadraoSindicato(token, { planoContribuicaoId }) {
  await atraso();
  autorizar(token, ADMIN);
  const banco = carregarBanco();
  if (planoContribuicaoId) exigirPlano(banco, planoContribuicaoId);
  banco.sindicato.planoContribuicaoPadraoId = planoContribuicaoId ?? null;
  banco.sindicato.updatedAt = agoraIso();
  salvarBanco(banco);
  return {
    sindicatoId: banco.sindicato.id,
    planoContribuicaoPadraoId: banco.sindicato.planoContribuicaoPadraoId,
    updatedAt: banco.sindicato.updatedAt,
  };
}

// --- Pix manual ---------------------------------------------------------------------------

const TELEFONE_PIX = /^\+55\d{10,11}$/;
const EVP_PIX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_PIX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Os 5 formatos de chave do Bacen, validados só por formato (RN-PIX-01). */
function classificarChavePix(chave) {
  if (!chave) return null;
  if (EVP_PIX.test(chave)) return 'ALEATORIA';
  if (TELEFONE_PIX.test(chave)) return 'TELEFONE';
  if (EMAIL_PIX.test(chave)) return 'EMAIL';
  if (/^[\d.\-/]+$/.test(chave)) {
    const digitos = somenteDigitos(chave);
    if (digitos.length === 11 && cpfValido(digitos)) return 'CPF';
    if (digitos.length === 14 && cnpjValido(digitos)) return 'CNPJ';
  }
  return null;
}

/** O sistema orienta, nunca bloqueia: CPF de pessoa física é aceito com um aviso. */
function avaliarChavePix(chave) {
  const tipoChave = classificarChavePix(chave);
  const avisos =
    tipoChave === 'CPF'
      ? [
          'Chave Pix é um CPF de pessoa física. Considere usar o CNPJ do sindicato ou uma chave aleatória para não expor o CPF de quem a cadastrou.',
        ]
      : [];
  return { tipoChave, avisos };
}

/** GET /api/v1/sindicato/pix */
export async function obterConfiguracaoPix(token) {
  await atraso(120);
  autorizar(token, GESTAO);
  const { sindicato } = carregarBanco();
  const chavePix = sindicato.chavePix ?? null;
  return {
    chavePix,
    nomeRecebedorPix: sindicato.nomeRecebedorPix ?? null,
    cidadeRecebedorPix: sindicato.cidadeRecebedorPix ?? null,
    configurado: !!chavePix && !!sindicato.nomeRecebedorPix && !!sindicato.cidadeRecebedorPix,
    ...avaliarChavePix(chavePix),
  };
}

/** PATCH /api/v1/sindicato/pix — os 3 campos sempre juntos (RN-PIX-01). */
export async function atualizarConfiguracaoPix(token, { chavePix, nomeRecebedorPix, cidadeRecebedorPix }) {
  await atraso();
  autorizar(token, ADMIN);
  const banco = carregarBanco();

  const chave = String(chavePix ?? '').trim();
  const nome = String(nomeRecebedorPix ?? '').trim();
  const cidade = String(cidadeRecebedorPix ?? '').trim();
  const problemas = [];
  if (!classificarChavePix(chave)) {
    problemas.push({ field: 'chavePix', issue: 'Chave Pix inválida. Use CPF, CNPJ, e-mail, telefone (+55DDDNÚMERO) ou chave aleatória.' });
  }
  // Limites reais do BR Code (EMV MPM): rejeitados, nunca truncados em silêncio.
  if (!nome || nome.length > 25) problemas.push({ field: 'nomeRecebedorPix', issue: 'O nome do recebedor deve ter de 1 a 25 caracteres.' });
  if (!cidade || cidade.length > 15) problemas.push({ field: 'cidadeRecebedorPix', issue: 'A cidade do recebedor deve ter de 1 a 15 caracteres.' });
  if (problemas.length > 0) throw erroDeValidacao('Dados inválidos.', problemas);

  const tipoChave = classificarChavePix(chave);
  banco.sindicato.chavePix = tipoChave === 'CPF' || tipoChave === 'CNPJ' ? somenteDigitos(chave) : chave;
  banco.sindicato.nomeRecebedorPix = nome;
  banco.sindicato.cidadeRecebedorPix = cidade;
  banco.sindicato.updatedAt = agoraIso();
  salvarBanco(banco);
  return {
    sindicatoId: banco.sindicato.id,
    chavePix: banco.sindicato.chavePix,
    nomeRecebedorPix: nome,
    cidadeRecebedorPix: cidade,
    ...avaliarChavePix(banco.sindicato.chavePix),
    updatedAt: banco.sindicato.updatedAt,
  };
}

/** GET /api/v1/empresas/:id/pix?competencia=YYYY-MM */
export async function gerarPixEmpresa(token, empresaId, { competencia }) {
  await atraso(300);
  autorizar(token, GESTAO);
  exigirCompetencia(competencia);
  const banco = carregarBanco();
  const empresa = exigirEmpresa(banco, empresaId);
  const { chavePix, nomeRecebedorPix, cidadeRecebedorPix } = banco.sindicato;

  if (!chavePix || !nomeRecebedorPix || !cidadeRecebedorPix) {
    throw erroDeValidacao('O sindicato ainda não configurou a chave Pix.', [
      { field: 'chavePix', issue: 'Configure em PATCH /sindicato/pix antes de gerar um QR.' },
    ]);
  }
  // RN-PIX-02: o valor vem do mesmo ponto único de cálculo do espelho.
  const valorCentavos = montarEspelhoDaEmpresa(banco, competencia, empresaId).totais.valorTotalCentavos;
  if (valorCentavos <= 0) {
    throw erroDeValidacao('Não há valor esperado para esta empresa nesta competência.', [
      { field: 'competencia', issue: 'A empresa não tem valor a cobrar nesta competência.' },
    ]);
  }

  const copiaECola = montarBrCode({
    chavePix,
    nomeRecebedor: nomeRecebedorPix,
    cidadeRecebedor: cidadeRecebedorPix,
    valorCentavos,
  });
  return {
    empresaId: empresa.id,
    razaoSocial: empresa.razaoSocial,
    competencia,
    valorCentavos,
    copiaECola,
    imagemBase64: await desenharQrCode(copiaECola),
    geradoEm: agoraIso(),
  };
}

// --- Espelho de cobrança -----------------------------------------------------------------

/** GET /api/v1/cobrancas/espelho */
export async function obterEspelhoCobranca(token, { competencia, page, limit, incluirZerados } = {}) {
  await atraso();
  autorizar(token, GESTAO);
  exigirCompetencia(competencia);
  const { linhas, ...resto } = montarEspelhoPorEmpresa(carregarBanco(), competencia, {
    incluirZerados: incluirZerados === true || incluirZerados === 'true',
  });
  const { data, pagination } = paginar(linhas, { page, limit });
  return { ...resto, pagination, data };
}

/** GET /api/v1/empresas/:id/espelho */
export async function obterEspelhoEmpresa(token, empresaId, { competencia, page, limit } = {}) {
  await atraso();
  autorizar(token, GESTAO);
  exigirCompetencia(competencia);
  const banco = carregarBanco();
  exigirEmpresa(banco, empresaId);
  const { linhas, ...resto } = montarEspelhoDaEmpresa(banco, competencia, empresaId);
  const { data, pagination } = paginar(linhas, { page, limit });
  return { ...resto, pagination, data };
}

function espelhoParaRelatorio(banco, competencia, empresaId) {
  if (empresaId) {
    exigirEmpresa(banco, empresaId);
    return { escopo: 'filiados', espelho: montarEspelhoDaEmpresa(banco, competencia, empresaId) };
  }
  return { escopo: 'empresas', espelho: montarEspelhoPorEmpresa(banco, competencia) };
}

/** GET /api/v1/reports/espelho?format=json */
export async function obterRelatorioEspelho(token, { competencia, empresaId, page, limit } = {}) {
  await atraso();
  autorizar(token, GESTAO);
  exigirCompetencia(competencia);
  const { escopo, espelho } = espelhoParaRelatorio(carregarBanco(), competencia, empresaId);
  const { linhas, ...resto } = espelho;
  const { data, pagination } = paginar(linhas, { page, limit });
  return { ...resto, escopo, pagination, data };
}

/** GET /api/v1/reports/espelho?format=csv — metadados na 1ª linha, como no back-end. */
export async function baixarRelatorioEspelhoCsv(token, { competencia, empresaId } = {}) {
  await atraso();
  autorizar(token, GESTAO);
  exigirCompetencia(competencia);
  const { escopo, espelho } = espelhoParaRelatorio(carregarBanco(), competencia, empresaId);

  const metadados = paraLinhaCsv([
    'Competência', espelho.competencia, 'Data de referência', formatarDataBr(espelho.dataReferencia), 'Gerado em', espelho.geradoEm,
  ]);
  const corpo =
    escopo === 'empresas'
      ? [
          paraLinhaCsv(['Empresa', 'CNPJ', 'Filiados', 'Valor Total (R$)']),
          ...espelho.linhas.map((linha) =>
            paraLinhaCsv([
              neutralizarFormulaCsv(linha.razaoSocial),
              formatarCnpjComMascara(linha.cnpj),
              String(linha.quantidadeFiliados),
              formatarCentavosComoReais(linha.valorTotalCentavos),
            ]),
          ),
        ]
      : [
          paraLinhaCsv(['Filiado', 'Matrícula', 'Plano', 'Valor (R$)']),
          ...espelho.linhas.map((linha) =>
            paraLinhaCsv([
              neutralizarFormulaCsv(linha.nomeCompleto),
              neutralizarFormulaCsv(linha.matricula ?? ''),
              neutralizarFormulaCsv(linha.planoCodigo),
              formatarCentavosComoReais(linha.valorCentavos),
            ]),
          ),
        ];
  baixarArquivo(`espelho-${competencia}.csv`, montarCsv([metadados, ...corpo]));
}

// --- Recebimentos ------------------------------------------------------------------------------

function paraRecebimentoPublico(recebimento) {
  return {
    id: recebimento.id,
    empresaId: recebimento.empresaId,
    competencia: recebimento.competencia,
    cobrancaId: recebimento.cobrancaId ?? null,
    valorCentavos: recebimento.valorCentavos,
    dataRecebimento: recebimento.dataRecebimento,
    origem: recebimento.origem,
    identificadorExterno: recebimento.identificadorExterno ?? null,
    descricao: recebimento.descricao ?? null,
    estornoDeRecebimentoId: recebimento.estornoDeRecebimentoId ?? null,
    motivo: recebimento.motivo ?? null,
    createdAt: recebimento.createdAt,
  };
}

/**
 * POST /api/v1/recebimentos — `origem` nunca vem do corpo: o back-end grava
 * sempre MANUAL e descarta o campo se for enviado (RN-CON-02).
 */
export async function criarRecebimento(token, { empresaId, competencia, valorCentavos, dataRecebimento, descricao }) {
  await atraso();
  autorizar(token, GESTAO);
  const banco = carregarBanco();

  const problemas = [];
  if (!PADRAO_COMPETENCIA.test(competencia ?? '')) {
    problemas.push({ field: 'competencia', issue: 'Competência deve estar no formato YYYY-MM.' });
  }
  if (!Number.isInteger(valorCentavos) || valorCentavos <= 0) {
    problemas.push({ field: 'valorCentavos', issue: 'O valor deve ser um inteiro positivo, em centavos.' });
  }
  if (!dataRecebimento) problemas.push({ field: 'dataRecebimento', issue: 'Data do recebimento é obrigatória.' });
  // RN-CON-01: a competência pode ser futura (recebimento antecipado); a data do recebimento, não.
  else if (dataRecebimento > hojeUtcIso()) {
    problemas.push({ field: 'dataRecebimento', issue: 'Data do recebimento não pode ser futura.' });
  }
  if (problemas.length > 0) throw erroDeValidacao('Dados inválidos.', problemas);
  exigirEmpresa(banco, empresaId);

  const recebimento = {
    id: gerarId('rec'),
    empresaId,
    competencia,
    cobrancaId: null,
    valorCentavos,
    dataRecebimento,
    origem: 'MANUAL',
    identificadorExterno: null,
    descricao: vazioParaNulo(descricao),
    estornoDeRecebimentoId: null,
    motivo: null,
    createdAt: agoraIso(),
  };
  banco.recebimentos.push(recebimento);
  salvarBanco(banco);
  return paraRecebimentoPublico(recebimento);
}

/** GET /api/v1/recebimentos — estornos aparecem como linhas próprias, com valor negativo. */
export async function listarRecebimentos(token, filtros = {}) {
  await atraso();
  autorizar(token, GESTAO);
  let lista = carregarBanco().recebimentos;
  if (filtros.empresaId) lista = lista.filter((item) => item.empresaId === filtros.empresaId);
  if (filtros.competencia) lista = lista.filter((item) => item.competencia === filtros.competencia);
  if (filtros.dataInicio) lista = lista.filter((item) => item.dataRecebimento >= filtros.dataInicio);
  if (filtros.dataFim) lista = lista.filter((item) => item.dataRecebimento <= filtros.dataFim);
  if (filtros.origem) lista = lista.filter((item) => item.origem === filtros.origem);
  const ordenada = ordenar(lista.map(paraRecebimentoPublico), filtros.sort, '-dataRecebimento');
  return paginar(ordenada, filtros);
}

/**
 * POST /api/v1/recebimentos/:id/estorno — só ADMIN. Nunca altera nem apaga a
 * linha original: cria uma nova, negativa (RN-CON-03). Estornar um estorno é
 * permitido; estornar duas vezes o mesmo recebimento, não.
 */
export async function estornarRecebimento(token, id, { motivo }) {
  await atraso();
  autorizar(token, ADMIN);
  const banco = carregarBanco();
  const original = banco.recebimentos.find((item) => item.id === id);
  if (!original) throw naoEncontrado('Recebimento');

  const motivoLimpo = String(motivo ?? '').trim();
  if (motivoLimpo.length < 5) {
    throw erroDeValidacao('Dados inválidos.', [{ field: 'motivo', issue: 'O motivo deve ter pelo menos 5 caracteres.' }]);
  }
  if (banco.recebimentos.some((item) => item.estornoDeRecebimentoId === id)) {
    throw erroDeValidacao('Este recebimento já foi estornado.', [
      { field: 'id', issue: 'Já existe um estorno registrado para este recebimento.' },
    ]);
  }

  const estorno = {
    id: gerarId('rec'),
    empresaId: original.empresaId,
    competencia: original.competencia,
    cobrancaId: null,
    valorCentavos: -original.valorCentavos,
    dataRecebimento: hojeIso(),
    origem: 'MANUAL',
    identificadorExterno: null,
    descricao: null,
    estornoDeRecebimentoId: original.id,
    motivo: motivoLimpo,
    createdAt: agoraIso(),
  };
  banco.recebimentos.push(estorno);
  salvarBanco(banco);
  return paraRecebimentoPublico(estorno);
}

// --- Importação assistida (RN-CON-08) ------------------------------------------------------

const CABECALHO_IMPORTACAO = ['data', 'valorCentavos', 'identificador', 'descricao'];
const TETO_LINHAS_IMPORTACAO = 5000;
const VALIDADE_LOTE_MS = 30 * 60 * 1000;

function validarLinhaDoExtrato(linha, campos) {
  if (campos.length !== CABECALHO_IMPORTACAO.length) {
    return { erro: { linha, motivo: `Esperadas ${CABECALHO_IMPORTACAO.length} colunas, encontradas ${campos.length}.` } };
  }
  const [dataBruta, valorBruto, identificadorBruto, descricaoBruta] = campos;
  const data = dataBruta.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || Number.isNaN(Date.parse(data))) {
    return { erro: { linha, motivo: 'Data deve estar no formato YYYY-MM-DD e ser uma data válida.' } };
  }
  if (data > hojeUtcIso()) return { erro: { linha, motivo: 'Data não pode ser futura.' } };
  const valorCentavos = Number(valorBruto.trim());
  if (!Number.isInteger(valorCentavos) || valorCentavos <= 0) {
    return { erro: { linha, motivo: 'Valor deve ser um número inteiro positivo, em centavos.' } };
  }
  const identificador = identificadorBruto.trim();
  if (!identificador) return { erro: { linha, motivo: 'Identificador é obrigatório.' } };
  if (identificador.length > 120) return { erro: { linha, motivo: 'Identificador excede 120 caracteres.' } };
  const descricao = descricaoBruta.trim();
  if (descricao.length > 255) return { erro: { linha, motivo: 'Descrição excede 255 caracteres.' } };
  return {
    proposta: {
      linha,
      data,
      valorCentavos,
      // Neutralização já na entrada: o que entra nasce seguro para qualquer
      // exportação futura (CSV Injection, na direção de leitura).
      identificador: neutralizarFormulaCsv(identificador),
      descricao: descricao ? neutralizarFormulaCsv(descricao) : null,
    },
  };
}

/** POST /api/v1/recebimentos/importacao — nada é gravado aqui, só o lote efêmero. */
export async function importarRecebimentos(token, { arquivo, competencia }) {
  await atraso(350);
  autorizar(token, GESTAO);
  exigirCompetencia(competencia, { permitirFutura: true });
  if (!arquivo) {
    throw erroDeValidacao('Arquivo CSV obrigatório.', [{ field: 'arquivo', issue: 'Envie o CSV no campo "arquivo".' }]);
  }
  const banco = carregarBanco();

  const texto = (await arquivo.text()).replace(/^﻿/, '');
  const linhasBrutas = texto.split(/\r?\n/).filter((linha) => linha.trim() !== '');
  if (linhasBrutas.length === 0) throw erroDeValidacao('Arquivo CSV vazio.');

  const cabecalho = analisarLinhaCsv(linhasBrutas[0]).map((campo) => campo.trim().toLowerCase());
  const esperado = CABECALHO_IMPORTACAO.map((campo) => campo.toLowerCase());
  if (cabecalho.length !== esperado.length || !cabecalho.every((campo, indice) => campo === esperado[indice])) {
    throw erroDeValidacao(`Cabeçalho do CSV inválido. Esperado, nesta ordem: ${CABECALHO_IMPORTACAO.join(',')}.`);
  }
  const dados = linhasBrutas.slice(1);
  if (dados.length > TETO_LINHAS_IMPORTACAO) {
    throw erroDeValidacao(`O arquivo excede o limite de ${TETO_LINHAS_IMPORTACAO} linhas (${dados.length} encontradas).`);
  }

  const propostas = [];
  const erros = [];
  dados.forEach((linhaBruta, indice) => {
    // Numeração como no editor de planilha: a linha 1 é o cabeçalho.
    const resultado = validarLinhaDoExtrato(indice + 2, analisarLinhaCsv(linhaBruta));
    if (resultado.erro) {
      erros.push(resultado.erro);
      return;
    }
    const sugestao = sugerirEmpresa(resultado.proposta.descricao ?? '', banco.empresas);
    propostas.push({
      ...resultado.proposta,
      empresaId: sugestao?.empresaId ?? null,
      empresaSugerida: sugestao?.empresaSugerida ?? null,
      confiancaMatch: sugestao?.confiancaMatch ?? null,
    });
  });

  // Limpa lotes vencidos, como o script de limpeza do produto.
  Object.entries(banco.lotesImportacao).forEach(([loteId, lote]) => {
    if (lote.expiraEm < Date.now()) delete banco.lotesImportacao[loteId];
  });
  const loteId = gerarId('lote');
  banco.lotesImportacao[loteId] = { competencia, propostas, expiraEm: Date.now() + VALIDADE_LOTE_MS };
  salvarBanco(banco);
  return { loteId, competencia, propostas, erros };
}

/**
 * POST /api/v1/recebimentos/importacao/:loteId/confirmar — grava tudo ou nada.
 * Omitir uma linha da lista é a forma de descartá-la. Lote inexistente,
 * expirado ou já confirmado respondem o mesmo 404, de propósito.
 */
export async function confirmarImportacaoRecebimentos(token, loteId, { linhas }) {
  await atraso(350);
  autorizar(token, GESTAO);
  const banco = carregarBanco();
  const lote = banco.lotesImportacao[loteId];
  if (!lote || lote.expiraEm < Date.now()) {
    throw naoEncontrado('Lote de importação');
  }

  const criados = [];
  const jaUsados = new Set(banco.recebimentos.map((item) => item.identificadorExterno).filter(Boolean));
  for (const escolha of linhas ?? []) {
    const proposta = lote.propostas.find((item) => item.linha === escolha.linha);
    if (!proposta) {
      throw erroDeValidacao(`A linha ${escolha.linha} não existe neste lote.`, [
        { field: 'linhas', issue: `A linha ${escolha.linha} não existe neste lote.` },
      ]);
    }
    exigirEmpresa(banco, escolha.empresaId);
    // Idempotência: o mesmo lançamento do extrato não entra duas vezes
    // (`uk_recebimentos_identificador_externo` no banco).
    if (jaUsados.has(proposta.identificador)) {
      throw erroDeValidacao(`O identificador "${proposta.identificador}" já foi importado.`, [
        { field: 'linhas', issue: `O identificador "${proposta.identificador}" já foi importado.` },
      ]);
    }
    jaUsados.add(proposta.identificador);
    criados.push({
      id: gerarId('rec'),
      empresaId: escolha.empresaId,
      competencia: lote.competencia,
      cobrancaId: null,
      valorCentavos: proposta.valorCentavos,
      dataRecebimento: proposta.data,
      origem: 'IMPORTACAO',
      identificadorExterno: proposta.identificador,
      descricao: proposta.descricao,
      estornoDeRecebimentoId: null,
      motivo: null,
      createdAt: agoraIso(),
    });
  }

  // Tudo na mesma "transação": grava os recebimentos e apaga o lote, o que
  // impede uma segunda confirmação do mesmo lote.
  banco.recebimentos.push(...criados);
  delete banco.lotesImportacao[loteId];
  salvarBanco(banco);
  return { data: criados.map(paraRecebimentoPublico) };
}

// --- Conciliação -----------------------------------------------------------------------------

function conciliacaoFiltrada(banco, competencia, situacao) {
  const { linhas, ...resto } = montarConciliacao(banco, competencia);
  return { ...resto, linhas: situacao ? linhas.filter((linha) => linha.situacao === situacao) : linhas };
}

/** GET /api/v1/conciliacao — `resumo` é sempre da competência inteira, nunca da página. */
export async function obterConciliacao(token, { competencia, situacao, page, limit } = {}) {
  await atraso();
  autorizar(token, GESTAO);
  exigirCompetencia(competencia);
  const { linhas, ...resto } = conciliacaoFiltrada(carregarBanco(), competencia, situacao);
  const { data, pagination } = paginar(linhas, { page, limit });
  return { ...resto, data, pagination };
}

/** GET /api/v1/conciliacao/evolucao */
export async function obterEvolucaoConciliacao(token, { competencias, empresaId, quedaPercentual } = {}) {
  await atraso(300);
  autorizar(token, GESTAO);
  const banco = carregarBanco();
  if (empresaId) exigirEmpresa(banco, empresaId);
  const quantidade = Math.min(24, Math.max(1, Number(competencias) || 6));
  return montarEvolucao(banco, {
    competencias: quantidade,
    empresaId: empresaId ?? null,
    quedaPercentual: quedaPercentual === undefined ? 10 : Number(quedaPercentual),
  });
}

/**
 * PATCH /api/v1/sindicato/tolerancia — só ADMIN. Mudar a tolerância
 * reclassifica competências passadas na próxima consulta: a divergência nunca
 * é persistida, é sempre derivada (RN-CON-04).
 */
export async function atualizarToleranciaSindicato(token, { toleranciaCentavos }) {
  await atraso();
  autorizar(token, ADMIN);
  if (!Number.isInteger(toleranciaCentavos) || toleranciaCentavos < 0) {
    throw erroDeValidacao('Dados inválidos.', [
      { field: 'toleranciaCentavos', issue: 'A tolerância deve ser um inteiro maior ou igual a zero, em centavos.' },
    ]);
  }
  const banco = carregarBanco();
  banco.sindicato.toleranciaDivergenciaCentavos = toleranciaCentavos;
  banco.sindicato.updatedAt = agoraIso();
  salvarBanco(banco);
  return { sindicatoId: banco.sindicato.id, toleranciaCentavos, updatedAt: banco.sindicato.updatedAt };
}

/** GET /api/v1/reports/conciliacao?format=json */
export async function obterRelatorioConciliacao(token, filtros) {
  return obterConciliacao(token, filtros);
}

/** GET /api/v1/reports/conciliacao?format=csv — sem `resumo`, com tolerância nos metadados. */
export async function baixarRelatorioConciliacaoCsv(token, { competencia, situacao } = {}) {
  await atraso();
  autorizar(token, GESTAO);
  exigirCompetencia(competencia);
  const conciliacao = conciliacaoFiltrada(carregarBanco(), competencia, situacao);

  const metadados = paraLinhaCsv([
    'Competência', conciliacao.competencia, 'Tolerância (R$)', formatarCentavosComoReais(conciliacao.toleranciaCentavos),
    'Gerado em', conciliacao.geradoEm,
  ]);
  const corpo = [
    paraLinhaCsv(['Empresa', 'Filiados', 'Valor Esperado (R$)', 'Valor Recebido (R$)', 'Divergência (R$)', 'Situação', 'Filiados Equivalentes']),
    ...conciliacao.linhas.map((linha) =>
      paraLinhaCsv([
        neutralizarFormulaCsv(linha.razaoSocial),
        String(linha.quantidadeFiliados),
        formatarCentavosComoReais(linha.valorEsperadoCentavos),
        formatarCentavosComoReais(linha.valorRecebidoCentavos),
        formatarCentavosComoReais(linha.divergenciaCentavos),
        linha.situacao,
        linha.filiadosEquivalentes === null ? '' : String(linha.filiadosEquivalentes),
      ]),
    ),
  ];
  baixarArquivo(`conciliacao-${competencia}.csv`, montarCsv([metadados, ...corpo]));
}
