// Base fictícia da versão showcase — o "banco de dados" que a camada de API
// falsa (../api.js) consulta. Tudo aqui é inventado: o sindicato, a cidade,
// as empresas, as pessoas, os CPFs/CNPJs (matematicamente válidos, mas
// gerados) e os valores.
//
// A base é gerada de forma determinística (mesma semente → mesmos dados) e
// relativa à data de hoje, para que a tela de vencimentos, a competência
// atual e a série histórica façam sentido em qualquer dia em que alguém abrir
// o showcase. Fica guardada em sessionStorage: sobrevive à navegação entre
// páginas e volta ao estado original ao fechar a aba ou clicar em
// "Restaurar dados".
//
// Cada cenário abaixo existe para exercitar uma regra de negócio específica
// — o comentário de cada um diz qual.

import { calcularEsperado } from './motor-calculo.js';
import {
  carimbo,
  completarCnpj,
  competenciaAtual,
  criarSorteador,
  gerarCpf,
  hojeIso,
  maiorData,
  menorData,
  normalizarTexto,
  primeiroDia,
  somarDias,
  somarMeses,
  ultimoDia,
} from './utilitarios.js';

const CHAVE_BANCO = 'sindesk-showcase.banco.v1';
const SEMENTE = 20260915;

export const SENHA_DEMO = 'Demo@1234';

export const USUARIOS_DEMO = [
  { id: 'usr-admin', nome: 'Helena Duarte', email: 'admin@sindmetal.example', perfil: 'ADMIN' },
  { id: 'usr-tesoureiro', nome: 'Otávio Mourão', email: 'tesoureiro@sindmetal.example', perfil: 'TESOUREIRO' },
  { id: 'usr-secretario', nome: 'Beatriz Campos', email: 'secretario@sindmetal.example', perfil: 'SECRETARIO' },
  { id: 'usr-assistente', nome: 'Rafael Prado', email: 'assistente@sindmetal.example', perfil: 'ASSISTENTE' },
];

const NOMES_FEMININOS = [
  'Ana', 'Beatriz', 'Camila', 'Daniela', 'Eduarda', 'Fernanda', 'Gabriela', 'Isabela', 'Juliana', 'Larissa',
  'Mariana', 'Natália', 'Patrícia', 'Renata', 'Sabrina', 'Tatiane', 'Vanessa', 'Yasmin', 'Aline', 'Bruna',
  'Carolina', 'Débora', 'Elaine', 'Fabiana', 'Giovana', 'Jéssica', 'Letícia', 'Luana', 'Michele', 'Priscila',
  'Raquel', 'Simone', 'Talita', 'Viviane', 'Rosana', 'Cláudia',
];
const NOMES_MASCULINOS = [
  'André', 'Bruno', 'Carlos', 'Diego', 'Eduardo', 'Fábio', 'Gustavo', 'Henrique', 'Igor', 'João', 'Leonardo',
  'Marcelo', 'Nícolas', 'Paulo', 'Rafael', 'Rodrigo', 'Samuel', 'Thiago', 'Vinícius', 'Alexandre', 'Caio',
  'Danilo', 'Emerson', 'Felipe', 'Gilberto', 'Hugo', 'Júlio', 'Lucas', 'Mateus', 'Renato', 'Sérgio', 'Wagner',
  'Wellington', 'Antônio', 'Francisco', 'Ricardo',
];
const SOBRENOMES = [
  'Almeida', 'Barbosa', 'Cardoso', 'Carvalho', 'Castro', 'Costa', 'Dias', 'Fernandes', 'Ferreira', 'Freitas',
  'Gomes', 'Lima', 'Lopes', 'Martins', 'Medeiros', 'Mendes', 'Monteiro', 'Moreira', 'Nascimento', 'Nogueira',
  'Oliveira', 'Pereira', 'Pinto', 'Ramos', 'Ribeiro', 'Rocha', 'Santos', 'Siqueira', 'Silva', 'Soares', 'Souza',
  'Teixeira', 'Vieira', 'Xavier', 'Andrade', 'Batista', 'Brito', 'Correia', 'Macedo', 'Queiroz',
];
const CARGOS = [
  ['Operador de máquinas CNC', 'Operadora de máquinas CNC'],
  ['Soldador', 'Soldadora'],
  ['Torneiro mecânico', 'Torneira mecânica'],
  ['Fresador', 'Fresadora'],
  ['Caldeireiro', 'Caldeireira'],
  ['Inspetor de qualidade', 'Inspetora de qualidade'],
  ['Eletricista industrial', 'Eletricista industrial'],
  ['Mecânico de manutenção', 'Mecânica de manutenção'],
  ['Auxiliar de produção', 'Auxiliar de produção'],
  ['Almoxarife', 'Almoxarife'],
  ['Montador', 'Montadora'],
  ['Ajustador mecânico', 'Ajustadora mecânica'],
  ['Pintor industrial', 'Pintora industrial'],
  ['Técnico de segurança do trabalho', 'Técnica de segurança do trabalho'],
];
const CARGO_APRENDIZ = ['Jovem aprendiz — mecânica', 'Jovem aprendiz — mecânica'];
const BAIRROS = [
  'Centro', 'Jardim Primavera', 'Vila Operária', 'Bairro das Acácias', 'Morada do Sol', 'São Cristóvão',
  'Nova Aurora', 'Parque das Águas', 'Santa Luzia', 'Alto da Serra',
];
const LOGRADOUROS = [
  'Rua das Palmeiras', 'Rua dos Ferroviários', 'Avenida Brasil', 'Rua Sete de Setembro', 'Rua das Hortênsias',
  'Rua Professor Lindolfo Reis', 'Avenida dos Metalúrgicos', 'Rua do Cruzeiro', 'Travessa Boa Esperança',
  'Rua Coronel Amâncio Prates',
];
const ESTADOS_CIVIS = ['SOLTEIRO', 'CASADO', 'CASADO', 'DIVORCIADO', 'UNIAO_ESTAVEL'];
const OBSERVACOES = [
  'Representante sindical de base (CIPA).',
  'Prefere contato por WhatsApp.',
  'Participou da comissão de negociação da última data-base.',
  'Solicitou segunda via da carteirinha.',
];

const PLANOS = [
  {
    id: 'plano-padrao',
    codigo: 'PADRAO',
    nome: 'Contribuição associativa padrão',
    descricao: 'Mensalidade descontada em folha dos filiados da ativa.',
    // [valor em centavos, competência de início, competência de fim] — relativas
    // ao mês atual. Vigências contíguas, sem buraco nem sobreposição (RN-CTR-01);
    // o reajuste de 6 meses atrás aparece na série histórica da evolução.
    vigencias: [
      [3500, -42, -31],
      [3800, -30, -7],
      [4200, -6, null],
    ],
  },
  {
    id: 'plano-aprendiz',
    codigo: 'APRENDIZ',
    nome: 'Contribuição reduzida — aprendizes',
    descricao: 'Valor reduzido para jovens aprendizes e estagiários.',
    vigencias: [
      [1900, -30, -7],
      [2100, -6, null],
    ],
  },
  {
    id: 'plano-aposentado',
    codigo: 'APOSENTADO',
    nome: 'Contribuição de aposentados',
    descricao: 'Contribuição voluntária, paga direto ao sindicato, fora da folha.',
    vigencias: [[2000, -30, null]],
  },
  {
    // Plano sem nenhum valor cadastrado: quem estiver nele cai em
    // PLANO_SEM_VALOR_VIGENTE no espelho (RN-ESP-04), nunca em "R$ 0,00".
    id: 'plano-saude',
    codigo: 'SAUDE-PLUS',
    nome: 'Contribuição + convênio de saúde',
    descricao: 'Plano em implantação: o valor só será cadastrado quando o convênio for fechado.',
    vigencias: [],
  },
];

const EMPRESAS = [
  {
    id: 'emp-aco-forte',
    razaoSocial: 'Aço Forte Indústria Metalúrgica Ltda',
    nomeFantasia: 'Aço Forte',
    raizCnpj: '41827365',
    responsavelNome: 'Marta Lacerda',
    logradouro: 'Avenida das Siderúrgicas',
    numero: '1500',
    bairro: 'Distrito Industrial',
  },
  {
    id: 'emp-fundicao-horizonte',
    razaoSocial: 'Fundição Horizonte S.A.',
    nomeFantasia: 'Fundição Horizonte',
    raizCnpj: '52938476',
    responsavelNome: 'Jorge Albuquerque',
    logradouro: 'Rodovia dos Inconfidentes, km 12',
    numero: 's/n',
    bairro: 'Distrito Industrial',
  },
  {
    id: 'emp-usinagem-precisa',
    razaoSocial: 'Usinagem Precisa Ltda',
    nomeFantasia: 'Usinagem Precisa',
    raizCnpj: '63049587',
    responsavelNome: 'Cíntia Moraes',
    logradouro: 'Rua dos Torneiros',
    numero: '220',
    bairro: 'Parque das Águas',
  },
  {
    id: 'emp-metalurgica-ventura',
    razaoSocial: 'Metalúrgica Ventura Ltda',
    nomeFantasia: 'Ventura Metais',
    raizCnpj: '74150698',
    responsavelNome: 'Ronaldo Vasques',
    logradouro: 'Avenida dos Metalúrgicos',
    numero: '3100',
    bairro: 'Distrito Industrial',
  },
  {
    id: 'emp-caldeiraria-boa-vista',
    razaoSocial: 'Caldeiraria Boa Vista Ltda',
    nomeFantasia: 'Caldeiraria Boa Vista',
    raizCnpj: '85261709',
    responsavelNome: 'Sílvia Rangel',
    logradouro: 'Rua do Cruzeiro',
    numero: '45',
    bairro: 'Alto da Serra',
  },
  {
    id: 'emp-estamparia-delta',
    razaoSocial: 'Estamparia Delta Ltda',
    nomeFantasia: 'Delta Estampos',
    raizCnpj: '96372810',
    responsavelNome: 'Paulo Henrique Sato',
    logradouro: 'Rua das Hortênsias',
    numero: '780',
    bairro: 'Santa Luzia',
  },
  {
    // RN-EMP-02: empresa INATIVA não some — e, com filiados ainda elegíveis,
    // gera EMPRESA_INATIVA_COM_FILIADOS no espelho.
    id: 'emp-ferramentaria-serra-azul',
    razaoSocial: 'Ferramentaria Serra Azul Ltda',
    nomeFantasia: 'Serra Azul Ferramentas',
    raizCnpj: '17483921',
    responsavelNome: 'Edson Paiva',
    logradouro: 'Travessa Boa Esperança',
    numero: '12',
    bairro: 'Vila Operária',
    status: 'INATIVA',
    observacoes: 'Encerrou as atividades na cidade. Aguardando a baixa dos vínculos dos funcionários.',
  },
  {
    // Empresa ATIVA sem nenhum filiado: só aparece no espelho com
    // "incluir zerados", e na conciliação como SEM_ESPERADO.
    id: 'emp-tornearia-nova-era',
    razaoSocial: 'Tornearia Nova Era ME',
    nomeFantasia: 'Nova Era Usinados',
    raizCnpj: '28594032',
    responsavelNome: 'Luciana Freire',
    logradouro: 'Rua Sete de Setembro',
    numero: '1024',
    bairro: 'Centro',
  },
];

// --- Persistência ---------------------------------------------------------

export function carregarBanco() {
  try {
    const bruto = sessionStorage.getItem(CHAVE_BANCO);
    if (bruto) return JSON.parse(bruto);
  } catch {
    // sessionStorage indisponível (modo privado restrito, iframe) — segue
    // com uma base nova em memória; só não persiste entre páginas.
  }
  const banco = gerarBanco();
  salvarBanco(banco);
  return banco;
}

export function salvarBanco(banco) {
  try {
    sessionStorage.setItem(CHAVE_BANCO, JSON.stringify(banco));
  } catch {
    // Mesmo caso acima: sem persistência, mas sem quebrar a tela.
  }
}

export function restaurarBanco() {
  try {
    sessionStorage.removeItem(CHAVE_BANCO);
  } catch {
    // nada a limpar
  }
}

// --- Geração --------------------------------------------------------------

function gerarBanco() {
  const sorteador = criarSorteador(SEMENTE);
  const hoje = hojeIso();
  const atual = competenciaAtual();
  const mes = (deslocamento) => somarMeses(atual, deslocamento);
  /** Dia `dia` da competência, sem passar do fim do mês nem de hoje. */
  const diaDe = (competencia, dia) =>
    menorData(menorData(`${competencia}-${String(dia).padStart(2, '0')}`, ultimoDia(competencia)), hoje);

  const banco = {
    versao: 1,
    sindicato: {
      id: 'sindicato-vale-aurora',
      nome: 'Sindicato dos Metalúrgicos de Vale Aurora',
      planoContribuicaoPadraoId: 'plano-padrao',
      // R$ 1,00 de tolerância (RN-CON-06): a Estamparia Delta pagou 40
      // centavos a menos e aparece CONCILIADA. Zere a tolerância em
      // Configurações para vê-la virar RECEBIDO_A_MENOR.
      toleranciaDivergenciaCentavos: 100,
      chavePix: '5f0c9a3e-7b42-4d1e-9a6f-3c8e2b7d4a10',
      nomeRecebedorPix: 'SINDMETAL VALE AURORA',
      cidadeRecebedorPix: 'VALE AURORA',
      updatedAt: carimbo(somarDias(hoje, -40)),
    },
    planos: [],
    planoValores: [],
    empresas: [],
    filiados: [],
    vinculos: [],
    recebimentos: [],
    lotesImportacao: {},
  };

  PLANOS.forEach(({ vigencias, ...plano }) => {
    const criadoEm = carimbo(primeiroDia(mes(-42)));
    banco.planos.push({ ...plano, ativo: true, createdAt: criadoEm, updatedAt: criadoEm });
    vigencias.forEach(([valorCentavos, inicio, fim], indice) => {
      banco.planoValores.push({
        id: `${plano.id}-valor-${indice + 1}`,
        planoId: plano.id,
        valorCentavos,
        vigenciaInicio: primeiroDia(mes(inicio)),
        vigenciaFim: fim === null ? null : ultimoDia(mes(fim)),
        createdAt: carimbo(somarDias(primeiroDia(mes(inicio)), -10)),
      });
    });
  });

  EMPRESAS.forEach(({ raizCnpj, ...empresa }, indice) => {
    const criadaEm = carimbo(somarDias(hoje, -2100 + indice * 37));
    banco.empresas.push({
      emailContato: `rh@${normalizarTexto(empresa.nomeFantasia).replace(/[^a-z]/g, '')}.example`,
      telefoneContato: `3132${String(400000 + indice * 7319).slice(0, 6)}`,
      cep: `35${String(170000 + indice * 911).slice(0, 6)}`,
      municipio: 'Vale Aurora',
      uf: 'MG',
      observacoes: null,
      status: 'ATIVA',
      ...empresa,
      cnpj: completarCnpj(`${raizCnpj}0001`),
      createdAt: criadaEm,
      updatedAt: empresa.status === 'INATIVA' ? carimbo(diaDe(mes(-2), 14)) : criadaEm,
    });
  });

  const fabrica = criarFabricaDeFiliados(banco, sorteador, hoje);
  const { novoFiliado, novoVinculo, registrarStatus, registrarMovimentacao } = fabrica;
  const empresaNome = (id) => banco.empresas.find((empresa) => empresa.id === id).razaoSocial;

  /** Filiado antigo, presente em toda a série histórica (filiado há 14+ meses). */
  function estavel(empresaId, opcoes = {}) {
    const dataFiliacao = somarDias(hoje, -sorteador.inteiro(430, 2900));
    const filiado = novoFiliado({ dataFiliacao, ...opcoes });
    novoVinculo(filiado, {
      empresaId,
      dataAdmissao: somarDias(dataFiliacao, -sorteador.inteiro(0, 900)),
      aprendiz: opcoes.planoContribuicaoId === 'plano-aprendiz',
    });
    return filiado;
  }

  /** Admitido e filiado numa competência recente — a empresa "cresce" na série. */
  function admitidoEm(empresaId, competencia) {
    const dataAdmissao = diaDe(competencia, sorteador.inteiro(3, 18));
    const dataFiliacao = menorData(menorData(somarDias(dataAdmissao, sorteador.inteiro(0, 5)), ultimoDia(competencia)), hoje);
    const filiado = novoFiliado({ dataFiliacao });
    novoVinculo(filiado, { empresaId, dataAdmissao });
    return filiado;
  }

  /** Troca de empresa: fecha o vínculo anterior e abre o novo (RN-ASS-02, MUDANCA_EMPRESA). */
  function mudarDeEmpresa(filiado, empresaDestinoId, competencia) {
    const anterior = banco.vinculos.find((vinculo) => vinculo.filiadoId === filiado.id && vinculo.statusVinculo === 'ATUAL');
    const desligamento = diaDe(competencia, 10);
    anterior.dataDesligamento = desligamento;
    anterior.statusVinculo = 'ENCERRADO';
    novoVinculo(filiado, { empresaId: empresaDestinoId, dataAdmissao: somarDias(desligamento, sorteador.inteiro(1, 6)) });
    registrarMovimentacao(filiado, {
      tipoMovimentacao: 'MUDANCA_EMPRESA',
      descricao: `Vínculo com ${anterior.empresaNome} encerrado; novo vínculo com ${empresaNome(empresaDestinoId)}.`,
      data: desligamento,
    });
  }

  // Aço Forte — a maior empresa, crescendo mês a mês. Tem aprendizes (plano
  // reduzido), então "filiados equivalentes" da conciliação vira null: com
  // valores mistos, a conversão não faz sentido.
  for (let i = 0; i < 24; i += 1) estavel('emp-aco-forte');
  for (let i = 0; i < 4; i += 1) estavel('emp-aco-forte', { planoContribuicaoId: 'plano-aprendiz', aprendiz: true });
  [-5, -4, -2, -1].forEach((deslocamento) => admitidoEm('emp-aco-forte', mes(deslocamento)));
  admitidoEm('emp-aco-forte', atual);
  // Dois filiados num plano sem valor cadastrado → PLANO_SEM_VALOR_VIGENTE.
  for (let i = 0; i < 2; i += 1) {
    estavel('emp-aco-forte', {
      planoContribuicaoId: 'plano-saude',
      observacoes: 'Aderiu ao plano com convênio de saúde, ainda sem valor definido.',
    });
  }

  // Fundição Horizonte — todos no plano padrão (valor único), então a
  // conciliação consegue dizer "faltou o equivalente a N filiados".
  for (let i = 0; i < 22; i += 1) estavel('emp-fundicao-horizonte');
  // Vínculo sobreposto (RN-ESP-02): dado migrado da planilha antiga, com um
  // vínculo anterior sem data de desligamento. O espelho conta só o de
  // admissão mais recente e reporta VINCULO_SOBREPOSTO — nunca cobra duas vezes.
  const sobreposto = estavel('emp-fundicao-horizonte', {
    observacoes: 'Vínculo antigo migrado da planilha sem data de desligamento — conferir com o RH.',
  });
  const vinculoAtualSobreposto = banco.vinculos.find((vinculo) => vinculo.filiadoId === sobreposto.id);
  novoVinculo(sobreposto, {
    empresaId: 'emp-caldeiraria-boa-vista',
    dataAdmissao: somarDias(vinculoAtualSobreposto.dataAdmissao, -800),
    statusVinculo: 'ENCERRADO',
  });

  // Usinagem Precisa — perdeu 2 de 17 filiados há 7 meses (queda de 11,8%,
  // acima do limiar de 10% da evolução, RN-CON-07). Visível ao pedir 12
  // competências na tela de evolução.
  const usinagem = Array.from({ length: 17 }, () => estavel('emp-usinagem-precisa'));
  usinagem.slice(0, 2).forEach((filiado) => mudarDeEmpresa(filiado, 'emp-estamparia-delta', mes(-7)));

  // Metalúrgica Ventura — perdeu 8 de 20 filiados há 3 meses (queda de 40%):
  // é o caso que a tela de evolução existe para mostrar, "estamos perdendo
  // filiados nessa empresa e ninguém percebeu".
  const ventura = Array.from({ length: 20 }, () => estavel('emp-metalurgica-ventura'));
  ventura.slice(0, 5).forEach((filiado) => mudarDeEmpresa(filiado, 'emp-aco-forte', mes(-3)));
  ventura.slice(5, 8).forEach((filiado) => mudarDeEmpresa(filiado, 'emp-usinagem-precisa', mes(-3)));

  for (let i = 0; i < 8; i += 1) estavel('emp-caldeiraria-boa-vista');
  for (let i = 0; i < 2; i += 1) estavel('emp-caldeiraria-boa-vista', { planoContribuicaoId: 'plano-aprendiz', aprendiz: true });
  for (let i = 0; i < 6; i += 1) estavel('emp-estamparia-delta');
  for (let i = 0; i < 3; i += 1) estavel('emp-ferramentaria-serra-azul');

  // Filiados sem vínculo profissional — FILIADO_SEM_VINCULO, o item de maior
  // valor comercial do espelho: receita que não está sendo cobrada de ninguém.
  [-2, -1, 0].forEach((deslocamento) => {
    novoFiliado({
      dataFiliacao: diaDe(mes(deslocamento), sorteador.inteiro(2, 20)),
      semMatricula: deslocamento === 0,
      observacoes: 'Filiação feita no plantão da portaria — falta informar a empresa.',
    });
  });
  for (let i = 0; i < 3; i += 1) {
    novoFiliado({
      dataFiliacao: somarDias(hoje, -sorteador.inteiro(200, 1200)),
      observacoes: 'Cadastro migrado da planilha sem a empresa empregadora.',
    });
  }

  // Afastados: vínculo ativo, mas fora da cobrança (RN-ESP-01 exige ATIVO).
  const motivosAfastamento = [
    'Afastamento por auxílio-doença (INSS).',
    'Licença-maternidade.',
    'Afastamento por acidente de trabalho (CAT emitida).',
  ];
  ['emp-aco-forte', 'emp-aco-forte', 'emp-aco-forte', 'emp-fundicao-horizonte', 'emp-fundicao-horizonte', 'emp-usinagem-precisa', 'emp-caldeiraria-boa-vista'].forEach(
    (empresaId) => {
      const filiado = estavel(empresaId);
      registrarStatus(filiado, 'AFASTADO', sorteador.escolher(motivosAfastamento), somarDias(hoje, -sorteador.inteiro(20, 160)));
    },
  );

  // Dois que voltaram de afastamento — histórico com ida e volta.
  banco.filiados
    .filter((filiado) => filiado.statusCadastral === 'ATIVO' && filiado.vinculoPrincipal === 'emp-fundicao-horizonte')
    .slice(0, 2)
    .forEach((filiado) => {
      const saida = somarDias(hoje, -sorteador.inteiro(200, 300));
      registrarStatus(filiado, 'AFASTADO', 'Afastamento por auxílio-doença (INSS).', saida);
      registrarStatus(filiado, 'ATIVO', 'Retorno ao trabalho após alta médica.', somarDias(saida, sorteador.inteiro(30, 90)));
    });

  // Inativos: desfiliados que continuam empregados (vínculo ATUAL).
  const motivosDesfiliacao = [
    'Pedido de desfiliação protocolado na secretaria.',
    'Solicitou o cancelamento da contribuição associativa.',
    'Desfiliação após mudança de categoria profissional.',
  ];
  // Mudar o status não mexe na vigência (são regras independentes), então a
  // vigência deles fica como estava — igual ao produto.
  const inativos = ['emp-aco-forte', 'emp-aco-forte', 'emp-fundicao-horizonte', 'emp-usinagem-precisa', 'emp-metalurgica-ventura', 'emp-metalurgica-ventura', 'emp-caldeiraria-boa-vista', 'emp-estamparia-delta', 'emp-aco-forte', 'emp-fundicao-horizonte', 'emp-usinagem-precisa', 'emp-estamparia-delta'].map(
    (empresaId) => {
      const filiado = estavel(empresaId);
      registrarStatus(filiado, 'INATIVO', sorteador.escolher(motivosDesfiliacao), somarDias(hoje, -sorteador.inteiro(90, 400)));
      return filiado;
    },
  );
  fabrica.anonimizar(inativos[inativos.length - 1], somarDias(hoje, -25));

  // Aposentados: vínculo encerrado (histórico migrado), vigência sem fim.
  for (let i = 0; i < 9; i += 1) {
    const filiado = novoFiliado({
      dataFiliacao: somarDias(hoje, -sorteador.inteiro(3000, 9000)),
      nascimentoEntre: [1948, 1962],
      planoContribuicaoId: i % 2 === 0 ? 'plano-aposentado' : null,
      vigenciaIndeterminada: true,
    });
    const aposentadoria = somarDias(hoje, -sorteador.inteiro(200, 2500));
    novoVinculo(filiado, {
      empresaId: sorteador.escolher(['emp-aco-forte', 'emp-fundicao-horizonte', 'emp-metalurgica-ventura']),
      dataAdmissao: somarDias(filiado.dataFiliacao, -sorteador.inteiro(100, 1500)),
      dataDesligamento: aposentadoria,
      statusVinculo: 'ENCERRADO',
    });
    registrarStatus(filiado, 'APOSENTADO', 'Aposentadoria por tempo de contribuição concedida pelo INSS.', aposentadoria);
  }

  fabrica.finalizar();
  gerarRecebimentos(banco, sorteador, { mes, diaDe, hoje, atual });
  return banco;
}

function criarFabricaDeFiliados(banco, sorteador, hoje) {
  const nomesUsados = new Set();
  const cpfsUsados = new Set();

  function sortearNome(sexo) {
    for (;;) {
      const primeiro = sorteador.escolher(sexo === 'FEMININO' ? NOMES_FEMININOS : NOMES_MASCULINOS);
      const meio = sorteador.escolher(SOBRENOMES);
      const ultimo = sorteador.escolher(SOBRENOMES);
      const nome = `${primeiro} ${meio} ${ultimo}`;
      if (meio !== ultimo && !nomesUsados.has(nome)) {
        nomesUsados.add(nome);
        return { nome, primeiro, ultimo };
      }
    }
  }

  function sortearCpf() {
    for (;;) {
      const cpf = gerarCpf(sorteador);
      if (!cpfsUsados.has(cpf)) {
        cpfsUsados.add(cpf);
        return cpf;
      }
    }
  }

  function novoFiliado({
    dataFiliacao,
    planoContribuicaoId = null,
    observacoes = null,
    semMatricula = false,
    aprendiz = false,
    vigenciaIndeterminada = false,
    nascimentoEntre = aprendiz ? [2005, 2008] : [1966, 2002],
  }) {
    const sexo = sorteador.chance(0.38) ? 'FEMININO' : 'MASCULINO';
    const { nome, primeiro, ultimo } = sortearNome(sexo);
    const anoNascimento = sorteador.inteiro(nascimentoEntre[0], nascimentoEntre[1]);
    const temContato = sorteador.chance(0.85);
    // Vigência anual, renovada até hoje: a maior parte vence no próximo ano,
    // alguns caem nas janelas de 30/60 dias e alguns já venceram (vigência
    // expirada não muda o status sozinha — RN-FIL-04).
    const sorteioVigencia = sorteador.numero();
    let dataVigenciaFim;
    if (sorteioVigencia < 0.06) dataVigenciaFim = somarDias(hoje, sorteador.inteiro(1, 30));
    else if (sorteioVigencia < 0.11) dataVigenciaFim = somarDias(hoje, sorteador.inteiro(31, 60));
    else if (sorteioVigencia < 0.14) dataVigenciaFim = somarDias(hoje, -sorteador.inteiro(5, 90));
    else dataVigenciaFim = somarDias(hoje, sorteador.inteiro(61, 700));
    dataVigenciaFim = vigenciaIndeterminada ? null : maiorData(dataVigenciaFim, somarDias(dataFiliacao, 365));

    const filiado = {
      id: `fil-${String(banco.filiados.length + 1).padStart(4, '0')}`,
      nomeCompleto: nome,
      cpf: sortearCpf(),
      rg: sorteador.chance(0.7) ? `MG-${sorteador.inteiro(10, 25)}.${sorteador.inteiro(100, 999)}.${sorteador.inteiro(100, 999)}` : null,
      matricula: semMatricula ? null : 'pendente',
      dataNascimento: `${anoNascimento}-${String(sorteador.inteiro(1, 12)).padStart(2, '0')}-${String(sorteador.inteiro(1, 28)).padStart(2, '0')}`,
      sexo,
      estadoCivil: sorteador.escolher(ESTADOS_CIVIS),
      email: temContato ? `${normalizarTexto(primeiro)}.${normalizarTexto(ultimo)}@email.example` : null,
      telefone: sorteador.chance(0.3) ? `3133${sorteador.inteiro(100000, 999999)}` : null,
      celular: temContato ? `319${sorteador.inteiro(80000000, 99999999)}` : null,
      cep: `35${sorteador.inteiro(170000, 179999)}`,
      logradouro: sorteador.escolher(LOGRADOUROS),
      numero: String(sorteador.inteiro(10, 1999)),
      bairro: sorteador.escolher(BAIRROS),
      cidade: 'Vale Aurora',
      uf: 'MG',
      statusCadastral: 'ATIVO',
      dataFiliacao,
      dataVigenciaInicio: dataFiliacao,
      dataVigenciaFim,
      observacoes: observacoes ?? (sorteador.chance(0.12) ? sorteador.escolher(OBSERVACOES) : null),
      planoContribuicaoId,
      anonimizadoEm: null,
      historicoStatus: [],
      historicoMovimentacoes: [],
      createdAt: carimbo(dataFiliacao),
      updatedAt: carimbo(dataFiliacao),
      vinculoPrincipal: null,
    };
    banco.filiados.push(filiado);

    // Renovações de vigência registradas no histórico (RN-ASS-04).
    if (dataVigenciaFim && dataVigenciaFim > somarDias(dataFiliacao, 400) && sorteador.chance(0.4)) {
      const renovadaEm = somarDias(dataVigenciaFim, -sorteador.inteiro(330, 380));
      if (renovadaEm > dataFiliacao && renovadaEm <= hoje) {
        registrarMovimentacao(filiado, {
          tipoMovimentacao: 'RENOVACAO_VIGENCIA',
          descricao: `Vigência renovada de ${formatarDataBr(somarDias(dataVigenciaFim, -365))} para ${formatarDataBr(dataVigenciaFim)}.`,
          data: renovadaEm,
        });
      }
    }
    return filiado;
  }

  function novoVinculo(filiado, { empresaId, dataAdmissao, dataDesligamento = null, statusVinculo, aprendiz = false }) {
    const empresa = banco.empresas.find((item) => item.id === empresaId);
    const cargos = aprendiz ? CARGO_APRENDIZ : sorteador.escolher(CARGOS);
    const vinculo = {
      id: `vin-${String(banco.vinculos.length + 1).padStart(4, '0')}`,
      filiadoId: filiado.id,
      empresaId,
      // Snapshot do nome/CNPJ no momento da abertura (RN-EMP-03): renomear a
      // empresa depois não reescreve o histórico.
      empresaNome: empresa.razaoSocial,
      empresaCnpj: empresa.cnpj,
      cargoFuncao: cargos[filiado.sexo === 'FEMININO' ? 1 : 0],
      dataAdmissao,
      dataDesligamento,
      statusVinculo: statusVinculo ?? (dataDesligamento ? 'ENCERRADO' : 'ATUAL'),
      createdAt: carimbo(maiorData(dataAdmissao, filiado.dataFiliacao)),
    };
    banco.vinculos.push(vinculo);
    if (vinculo.statusVinculo === 'ATUAL') filiado.vinculoPrincipal = empresaId;
    return vinculo;
  }

  function registrarStatus(filiado, statusNovo, motivo, data) {
    filiado.historicoStatus.unshift({
      statusAnterior: filiado.statusCadastral,
      statusNovo,
      motivo,
      alteradoPor: sorteador.escolher(['Helena Duarte', 'Beatriz Campos']),
      createdAt: carimbo(data, `${sorteador.inteiro(12, 20)}:${sorteador.escolher(['05', '20', '35', '50'])}`),
    });
    filiado.statusCadastral = statusNovo;
    filiado.updatedAt = carimbo(data);
  }

  function registrarMovimentacao(filiado, { tipoMovimentacao, descricao, data }) {
    filiado.historicoMovimentacoes.unshift({
      tipoMovimentacao,
      descricao,
      registradoPor: sorteador.escolher(['Helena Duarte', 'Beatriz Campos']),
      createdAt: carimbo(data, `${sorteador.inteiro(12, 20)}:${sorteador.escolher(['10', '25', '40', '55'])}`),
    });
    filiado.historicoMovimentacoes.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** RN-LGPD-02: pseudonimização — mesmos campos que o back-end limpa. */
  function anonimizar(filiado, data) {
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
      anonimizadoEm: carimbo(data),
      updatedAt: carimbo(data),
    });
    registrarMovimentacao(filiado, {
      tipoMovimentacao: 'ANONIMIZACAO',
      descricao: 'Filiado anonimizado (direito ao esquecimento, RN-LGPD-02).',
      data,
    });
  }

  /** Matrículas em ordem de filiação, como num livro de registro. */
  function finalizar() {
    [...banco.filiados]
      .sort((a, b) => a.dataFiliacao.localeCompare(b.dataFiliacao))
      .forEach((filiado, indice) => {
        if (filiado.matricula === 'pendente') filiado.matricula = `VA-${String(indice + 1).padStart(4, '0')}`;
      });
    banco.filiados.forEach((filiado) => delete filiado.vinculoPrincipal);
  }

  return { novoFiliado, novoVinculo, registrarStatus, registrarMovimentacao, anonimizar, finalizar };
}

function formatarDataBr(iso) {
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

/** Descrição no estilo de extrato bancário: caixa alta, sem acento, abreviada. */
function descricaoDeExtrato(razaoSocial) {
  const limpa = normalizarTexto(razaoSocial).toUpperCase().replace(/[^A-Z0-9 ]/g, '');
  return `TED RECEBIDA ${limpa.replace(/ (LTDA|SA|ME)$/, '')}`;
}

/**
 * Recebimentos dos últimos 13 meses, derivados do próprio espelho: cada
 * empresa paga o que o motor de cálculo diz que ela deve, e os desvios abaixo
 * são inseridos de propósito, um por situação de conciliação (RN-CON-05).
 */
function gerarRecebimentos(banco, sorteador, { mes, diaDe, hoje, atual }) {
  let sequencia = 0;
  const lancar = (dados) => {
    sequencia += 1;
    const recebimento = {
      id: `rec-${String(sequencia).padStart(4, '0')}`,
      cobrancaId: null,
      identificadorExterno: null,
      descricao: null,
      estornoDeRecebimentoId: null,
      motivo: null,
      ...dados,
      createdAt: carimbo(dados.dataRecebimento, `${sorteador.inteiro(12, 20)}:${sorteador.escolher(['00', '15', '30', '45'])}`),
    };
    banco.recebimentos.push(recebimento);
    return recebimento;
  };

  for (let deslocamento = -12; deslocamento <= 0; deslocamento += 1) {
    const competencia = mes(deslocamento);
    const esperado = calcularEsperado(banco, competencia);

    banco.empresas.forEach((empresa) => {
      const cobraveis = esperado.cobraveis.filter((linha) => linha.empresaId === empresa.id);
      const devido = cobraveis.reduce((total, linha) => total + linha.valorCentavos, 0);
      if (devido === 0) return;
      const unitario = cobraveis[0].valorCentavos;

      // A competência C é repassada no começo de C+1; a competência atual,
      // no piloto com Pix manual, já foi paga e conferida no extrato.
      const dataBase =
        deslocamento === 0
          ? maiorData(primeiroDia(atual), somarDias(hoje, -sorteador.inteiro(1, 4)))
          : diaDe(mes(deslocamento + 1), sorteador.inteiro(5, 9));
      const importado = deslocamento >= -3 && deslocamento <= -1;
      const base = {
        empresaId: empresa.id,
        competencia,
        origem: importado ? 'IMPORTACAO' : 'MANUAL',
        identificadorExterno: importado ? `EXT-${competencia.replace('-', '')}-${String(sequencia + 1).padStart(4, '0')}` : null,
        descricao: importado
          ? descricaoDeExtrato(empresa.razaoSocial)
          : deslocamento === 0
            ? 'Pix recebido — conferido no extrato bancário.'
            : `Repasse da folha de ${competencia.slice(5)}/${competencia.slice(0, 4)}.`,
      };

      let parcelas = [devido];
      if (empresa.id === 'emp-fundicao-horizonte' && deslocamento === 0) parcelas = [devido - 3 * unitario];
      if (empresa.id === 'emp-fundicao-horizonte' && deslocamento === -4) parcelas = [devido - 2 * unitario, 2 * unitario];
      if (empresa.id === 'emp-usinagem-precisa' && deslocamento === 0) parcelas = [];
      if (empresa.id === 'emp-caldeiraria-boa-vista' && deslocamento === 0) parcelas = [devido + 4200];
      if (empresa.id === 'emp-estamparia-delta' && deslocamento === 0) parcelas = [devido - 40];
      if (empresa.id === 'emp-ferramentaria-serra-azul' && deslocamento >= -2) parcelas = [];

      parcelas.forEach((valorCentavos, indice) => {
        lancar({
          ...base,
          valorCentavos,
          dataRecebimento: menorData(somarDias(dataBase, indice * 10), hoje),
          ...(indice > 0
            ? {
                origem: 'MANUAL',
                identificadorExterno: null,
                descricao: 'Complemento — a empresa havia esquecido 2 admitidos na folha.',
              }
            : {}),
        });
      });

      // RN-CON-03: lançamento em duplicidade corrigido por estorno — a linha
      // original nunca é apagada; o estorno é uma linha nova, negativa.
      if (empresa.id === 'emp-aco-forte' && deslocamento === -2) {
        const duplicado = lancar({
          ...base,
          origem: 'MANUAL',
          identificadorExterno: null,
          descricao: 'Repasse lançado manualmente antes da importação do extrato.',
          valorCentavos: devido,
          dataRecebimento: dataBase,
        });
        lancar({
          empresaId: empresa.id,
          competencia,
          origem: 'MANUAL',
          valorCentavos: -devido,
          dataRecebimento: menorData(somarDias(dataBase, 2), hoje),
          estornoDeRecebimentoId: duplicado.id,
          motivo: 'Lançamento em duplicidade: o mesmo depósito também veio na importação do extrato.',
        });
      }
    });
  }
}
