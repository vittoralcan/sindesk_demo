// Importação assistida de extrato (Fase 4/Fatia C) — RN-CON-08
// (07-regras-de-negocio-e-seguranca.md, seção 14) e guia-front-end-fatia-c.md,
// seção 2.3. Fluxo de duas etapas: nada é gravado até a confirmação humana
// da etapa 2 — o "casamento" de empresa por semelhança de texto é sempre um
// palpite, nunca aplicado sozinho.
import { importarRecebimentos, confirmarImportacaoRecebimentos, ApiError } from './api.js';
import { obterToken } from './auth-storage.js';
import { montarShell } from './shell.js';
import { escaparHtml, formatarMoeda, formatarData, renderizarEstadoPagina } from './ui.js';
import { inicializarEmpresaSelect } from './empresa-select.js';

const PERFIS_PERMITIDOS = ['ADMIN', 'TESOUREIRO'];

const container = document.getElementById('conteudo-importacao');
const alerta = document.getElementById('alerta-importacao');
const alertaTexto = document.getElementById('alerta-importacao-texto');

const etapaUpload = document.getElementById('etapa-upload');
const formUpload = document.getElementById('form-upload-importacao');
const inputArquivo = document.getElementById('input-arquivo-importacao');
const inputCompetencia = document.getElementById('input-competencia-importacao');
const btnEnviar = document.getElementById('btn-enviar-importacao');
const textoBtnEnviar = document.getElementById('texto-btn-enviar-importacao');

const etapaRevisao = document.getElementById('etapa-revisao');
const revisaoResumo = document.getElementById('revisao-resumo');
const areaErros = document.getElementById('area-erros-importacao');
const corpoTabelaPropostas = document.getElementById('corpo-tabela-propostas');
const btnCancelar = document.getElementById('btn-cancelar-importacao');
const btnConfirmar = document.getElementById('btn-confirmar-importacao');
const textoBtnConfirmar = document.getElementById('texto-btn-confirmar-importacao');

const etapaSucesso = document.getElementById('etapa-sucesso');
const sucessoResumo = document.getElementById('sucesso-resumo');
const btnNovaImportacao = document.getElementById('btn-nova-importacao');

let loteIdAtual = null;
let tokenAtual = null;

function esconderAlerta() {
  alerta.classList.remove('is-visible');
}

function mostrarAlerta(mensagem) {
  alertaTexto.textContent = mensagem;
  alerta.classList.add('alert--error', 'is-visible');
}

function renderizarBadgeConfianca(confiancaMatch) {
  if (confiancaMatch === 'ALTA') return '<span class="badge-status badge-status--sucesso">Alta</span>';
  if (confiancaMatch === 'MEDIA') return '<span class="badge-status badge-status--alerta">Média</span>';
  return '<span class="badge-status badge-status--neutro">Sem sugestão</span>';
}

function irParaEtapaUpload() {
  etapaUpload.hidden = false;
  etapaRevisao.hidden = true;
  etapaSucesso.hidden = true;
}

function irParaEtapaRevisao() {
  etapaUpload.hidden = true;
  etapaRevisao.hidden = false;
  etapaSucesso.hidden = true;
}

function irParaEtapaSucesso() {
  etapaUpload.hidden = true;
  etapaRevisao.hidden = true;
  etapaSucesso.hidden = false;
}

function renderizarErros(erros) {
  if (erros.length === 0) {
    areaErros.innerHTML = '';
    return;
  }
  areaErros.innerHTML = `
    <div class="alert alert--warning is-visible" role="status">
      <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
      <span>${erros.length} linha(s) com problema, ignoradas — não entram na confirmação:</span>
    </div>
    <ul class="lista-erros-importacao">
      ${erros.map((erro) => `<li>Linha ${erro.linha}: ${escaparHtml(erro.motivo)}</li>`).join('')}
    </ul>
  `;
}

function renderizarPropostas(propostas, token) {
  corpoTabelaPropostas.innerHTML = propostas
    .map(
      (proposta) => `
        <tr data-linha="${proposta.linha}">
          <td>${proposta.linha}</td>
          <td>${formatarData(proposta.data)}</td>
          <td>${formatarMoeda(proposta.valorCentavos)}</td>
          <td>${escaparHtml(proposta.identificador)}</td>
          <td>${escaparHtml(proposta.descricao ?? '—')}</td>
          <td><div class="empresa-select" id="proposta-empresa-select-${proposta.linha}"></div></td>
          <td>${renderizarBadgeConfianca(proposta.confiancaMatch)}</td>
          <td>
            <button type="button" class="btn-acao-linha" data-acao="remover-linha" title="Remover esta linha da importação">
              <i class="fa-solid fa-trash" aria-hidden="true"></i>
            </button>
          </td>
        </tr>
      `,
    )
    .join('');

  propostas.forEach((proposta) => {
    const elementoEmpresaSelect = document.getElementById(`proposta-empresa-select-${proposta.linha}`);
    // empresaId/empresaSugerida são só um palpite (RN-CON-08) — pré-preenche
    // o seletor, mas o operador pode trocar; o valor final enviado é sempre
    // o que estiver selecionado no clique de confirmar, nunca a sugestão
    // aplicada sozinha.
    inicializarEmpresaSelect(elementoEmpresaSelect, {
      token,
      valorInicial: proposta.empresaId ? { id: proposta.empresaId, razaoSocial: proposta.empresaSugerida } : undefined,
    });
  });

  corpoTabelaPropostas.querySelectorAll('button[data-acao="remover-linha"]').forEach((botao) => {
    botao.addEventListener('click', () => {
      botao.closest('tr').remove();
    });
  });
}

formUpload.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  esconderAlerta();

  const arquivo = inputArquivo.files[0];
  if (!arquivo) {
    mostrarAlerta('Selecione um arquivo CSV.');
    return;
  }

  btnEnviar.disabled = true;
  textoBtnEnviar.textContent = 'Enviando...';

  try {
    const resposta = await importarRecebimentos(tokenAtual, {
      arquivo,
      competencia: inputCompetencia.value,
    });

    loteIdAtual = resposta.loteId;
    revisaoResumo.textContent = `${resposta.propostas.length} linha(s) prontas para confirmar, ${resposta.erros.length} linha(s) com problema.`;
    renderizarErros(resposta.erros);
    renderizarPropostas(resposta.propostas, tokenAtual);
    irParaEtapaRevisao();
  } catch (erro) {
    mostrarAlerta(erro instanceof ApiError ? erro.message : 'Não foi possível importar o arquivo.');
  } finally {
    btnEnviar.disabled = false;
    textoBtnEnviar.textContent = 'Enviar';
  }
});

btnCancelar.addEventListener('click', () => {
  // Não existe endpoint de "descartar lote" — o lote efêmero expira sozinho
  // em 30 min (guia-front-end-fatia-c.md, seção 2.3). Cancelar aqui é só
  // sair da tela de revisão sem confirmar; nada foi gravado até agora.
  loteIdAtual = null;
  inputArquivo.value = '';
  irParaEtapaUpload();
});

btnConfirmar.addEventListener('click', async () => {
  esconderAlerta();

  const linhasRestantes = Array.from(corpoTabelaPropostas.querySelectorAll('tr[data-linha]'));
  if (linhasRestantes.length === 0) {
    mostrarAlerta('Não há nenhuma linha para confirmar — todas foram removidas.');
    return;
  }

  const linhas = [];
  for (const tr of linhasRestantes) {
    const empresaId = tr.querySelector('.empresa-select-valor').value;
    if (!empresaId) {
      mostrarAlerta(`Selecione uma empresa para a linha ${tr.dataset.linha} antes de confirmar.`);
      return;
    }
    linhas.push({ linha: Number(tr.dataset.linha), empresaId });
  }

  btnConfirmar.disabled = true;
  textoBtnConfirmar.textContent = 'Confirmando...';

  try {
    const resultado = await confirmarImportacaoRecebimentos(tokenAtual, loteIdAtual, { linhas });
    sucessoResumo.textContent = `${resultado.data.length} recebimento(s) importado(s) com sucesso.`;
    loteIdAtual = null;
    irParaEtapaSucesso();
  } catch (erro) {
    if (erro instanceof ApiError && erro.statusCode === 404) {
      // Lote inexistente, de outro tenant ou expirado — os três casos são
      // indistinguíveis na resposta (guia Fatia C, seção 4); tratamos todos
      // como "refaça o upload", sem tentar adivinhar qual foi.
      mostrarAlerta('Este lote não é mais válido (pode ter expirado). Refaça o upload.');
      loteIdAtual = null;
      irParaEtapaUpload();
      return;
    }
    mostrarAlerta(erro instanceof ApiError ? erro.message : 'Não foi possível confirmar a importação.');
  } finally {
    btnConfirmar.disabled = false;
    textoBtnConfirmar.textContent = 'Confirmar importação';
  }
});

btnNovaImportacao.addEventListener('click', () => {
  inputArquivo.value = '';
  inputCompetencia.value = '';
  irParaEtapaUpload();
});

async function inicializar() {
  const usuario = await montarShell({ itemAtivo: 'recebimentos' });
  if (!usuario) return;

  if (!PERFIS_PERMITIDOS.includes(usuario.perfil)) {
    renderizarEstadoPagina(container, {
      icone: 'fa-lock',
      titulo: 'Sem permissão',
      mensagem: 'Seu perfil não tem acesso à importação de recebimentos.',
    });
    return;
  }

  tokenAtual = obterToken();
}

void inicializar();
