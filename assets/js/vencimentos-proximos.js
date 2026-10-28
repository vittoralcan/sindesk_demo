import { listarVencimentosProximos, ApiError } from './api.js';
import { obterToken } from './auth-storage.js';
import { montarShell } from './shell.js';
import {
  escaparHtml,
  formatarCpf,
  formatarData,
  renderizarPaginacao,
  renderizarLinhasEsqueleto,
  renderizarTabelaVazia,
} from './ui.js';

const COLUNAS_TABELA = 4;
const ATALHOS_DIAS = [30, 60, 90];

const corpoTabela = document.getElementById('corpo-tabela');
const areaPaginacao = document.getElementById('area-paginacao');
const atalhosContainer = document.getElementById('atalhos-dias');
const inputPersonalizado = document.getElementById('input-dias-personalizado');
const btnAplicarDias = document.getElementById('btn-aplicar-dias');

let estado = { page: 1, limit: 20, dias: 30 };

function atualizarAtalhoAtivo() {
  atalhosContainer.querySelectorAll('.chip').forEach((chip) => {
    chip.classList.toggle('is-active', Number(chip.dataset.dias) === estado.dias);
  });
  // Só reflete no campo personalizado quando a janela atual não é nenhum
  // dos atalhos — evita o campo "brigar" visualmente com o chip ativo.
  inputPersonalizado.value = ATALHOS_DIAS.includes(estado.dias) ? '' : String(estado.dias);
}

function renderizarLinhas(itens) {
  corpoTabela.innerHTML = itens
    .map(
      (item) => `
        <tr class="linha-clicavel" data-id="${escaparHtml(item.id)}">
          <td>${escaparHtml(item.nomeCompleto)}</td>
          <td>${formatarCpf(item.cpf)}</td>
          <td>${formatarData(item.dataVigenciaFim)}</td>
          <td class="${item.diasParaVencer <= 7 ? 'dias-para-vencer--urgente' : ''}">${item.diasParaVencer} dia(s)</td>
        </tr>
      `,
    )
    .join('');

  corpoTabela.querySelectorAll('tr.linha-clicavel').forEach((linha) => {
    linha.addEventListener('click', () => {
      window.location.href = `filiado-detalhe.html?id=${encodeURIComponent(linha.dataset.id)}`;
    });
  });
}

async function carregarDados() {
  const token = obterToken();
  renderizarLinhasEsqueleto(corpoTabela, COLUNAS_TABELA);
  areaPaginacao.innerHTML = '';
  atualizarAtalhoAtivo();

  try {
    const resposta = await listarVencimentosProximos(token, estado);

    if (resposta.data.length === 0) {
      renderizarTabelaVazia(corpoTabela, COLUNAS_TABELA, {
        icone: 'fa-calendar-check',
        titulo: 'Nenhum vencimento nessa janela',
        mensagem: 'Tente aumentar o número de dias.',
      });
      return;
    }

    renderizarLinhas(resposta.data);
    renderizarPaginacao(areaPaginacao, resposta.pagination, (novaPagina) => {
      estado.page = novaPagina;
      void carregarDados();
    });
  } catch (erro) {
    const mensagem = erro instanceof ApiError ? erro.message : 'Não foi possível carregar os vencimentos agora.';
    renderizarTabelaVazia(corpoTabela, COLUNAS_TABELA, {
      icone: 'fa-triangle-exclamation',
      titulo: 'Erro ao carregar',
      mensagem,
    });
  }
}

atalhosContainer.querySelectorAll('.chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    estado = { ...estado, page: 1, dias: Number(chip.dataset.dias) };
    void carregarDados();
  });
});

btnAplicarDias.addEventListener('click', () => {
  const digitado = Math.trunc(Number(inputPersonalizado.value));
  if (!digitado) return; // campo vazio ou não numérico — não faz nada, não é erro
  const valor = Math.min(180, Math.max(1, digitado));
  estado = { ...estado, page: 1, dias: valor };
  void carregarDados();
});

async function inicializar() {
  const usuario = await montarShell({ itemAtivo: 'vencimentos' });
  if (!usuario) return;

  await carregarDados();
}

void inicializar();
