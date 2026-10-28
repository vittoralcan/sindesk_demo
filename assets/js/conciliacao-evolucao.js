// Evolução da Conciliação (Fase 4/Fatia C) — guia-front-end-fatia-c.md,
// seção 2.2. Responde "estamos perdendo filiados nessa empresa e ninguém
// percebeu", diferente do painel principal ("essa empresa pagou a menos").
// Sem lib de gráfico no projeto — tabela por competência, com ícone de
// alerta quando `quedaFiliados` é true.
import { obterEvolucaoConciliacao, obterEmpresa, ApiError } from './api.js';
import { obterToken } from './auth-storage.js';
import { montarShell } from './shell.js';
import {
  escaparHtml,
  formatarMoeda,
  formatarCompetencia,
  formatarDataHora,
  renderizarEstadoPagina,
} from './ui.js';
import { inicializarEmpresaSelect } from './empresa-select.js';

const PERFIS_PERMITIDOS = ['ADMIN', 'TESOUREIRO'];

const container = document.getElementById('conteudo-evolucao');
const form = document.getElementById('form-filtros-evolucao');
const elementoEmpresaSelect = document.getElementById('evolucao-empresa-select');
const inputCompetencias = document.getElementById('input-competencias-evolucao');
const alerta = document.getElementById('alerta-evolucao');
const alertaTexto = document.getElementById('alerta-evolucao-texto');
const metadados = document.getElementById('evolucao-metadados');
const areaEvolucao = document.getElementById('area-evolucao');

function renderizarSerieEmpresa(empresa) {
  const linhas = empresa.serie
    .map(
      (ponto) => `
        <tr>
          <td>${formatarCompetencia(ponto.competencia)}</td>
          <td>
            ${ponto.quantidadeFiliados}
            ${ponto.quedaFiliados ? '<i class="fa-solid fa-triangle-exclamation icone-queda-filiados" title="Queda de filiados em relação à competência anterior" aria-hidden="true"></i>' : ''}
          </td>
          <td>${formatarMoeda(ponto.valorEsperadoCentavos)}</td>
          <td>${formatarMoeda(ponto.valorRecebidoCentavos)}</td>
        </tr>
      `,
    )
    .join('');

  return `
    <fieldset class="secao-detalhe">
      <legend>${escaparHtml(empresa.razaoSocial)}</legend>
      <div class="tabela-wrapper">
        <table class="tabela">
          <thead>
            <tr>
              <th>Competência</th>
              <th>Filiados</th>
              <th>Valor esperado</th>
              <th>Valor recebido</th>
            </tr>
          </thead>
          <tbody>${linhas}</tbody>
        </table>
      </div>
    </fieldset>
  `;
}

async function carregarEvolucao(token, filtros) {
  alerta.classList.remove('is-visible');
  metadados.textContent = '';
  areaEvolucao.innerHTML = `
    <div class="estado-generico">
      <i class="fa-solid fa-spinner fa-spin-pulse" aria-hidden="true"></i>
      <span>Carregando...</span>
    </div>
  `;

  try {
    const resposta = await obterEvolucaoConciliacao(token, filtros);

    metadados.textContent = `Últimas ${resposta.competencias} competências · Queda considerada a partir de ${resposta.quedaPercentual}% · Gerado em ${formatarDataHora(resposta.geradoEm)}`;

    if (resposta.data.length === 0) {
      renderizarEstadoPagina(areaEvolucao, {
        icone: 'fa-inbox',
        titulo: 'Nenhuma empresa encontrada',
        mensagem: 'Ajuste os filtros e tente novamente.',
      });
      return;
    }

    areaEvolucao.innerHTML = resposta.data.map(renderizarSerieEmpresa).join('');
  } catch (erro) {
    metadados.textContent = '';
    alertaTexto.textContent = erro instanceof ApiError ? erro.message : 'Não foi possível carregar a evolução agora.';
    alerta.classList.add('alert--error', 'is-visible');
    areaEvolucao.innerHTML = '';
  }
}

async function inicializar() {
  const usuario = await montarShell({ itemAtivo: 'conciliacao' });
  if (!usuario) return;

  if (!PERFIS_PERMITIDOS.includes(usuario.perfil)) {
    renderizarEstadoPagina(container, {
      icone: 'fa-lock',
      titulo: 'Sem permissão',
      mensagem: 'Seu perfil não tem acesso à conciliação.',
    });
    return;
  }

  const token = obterToken();

  // Chegando de conciliacao.html (link "Ver evolução" de uma empresa), a
  // empresa já vem pré-selecionada pela query string.
  const parametros = new URLSearchParams(window.location.search);
  const empresaIdPreSelecionado = parametros.get('empresaId');

  let empresaPreSelecionada;
  if (empresaIdPreSelecionado) {
    try {
      const empresa = await obterEmpresa(token, empresaIdPreSelecionado);
      empresaPreSelecionada = { id: empresa.id, razaoSocial: empresa.razaoSocial };
    } catch {
      // Empresa inexistente/de outro tenant na URL — segue sem
      // pré-seleção, mostrando a evolução de todas as empresas.
    }
  }

  inicializarEmpresaSelect(elementoEmpresaSelect, { token, valorInicial: empresaPreSelecionada });

  function filtrosAtuais() {
    const empresaId = elementoEmpresaSelect.querySelector('.empresa-select-valor').value;
    return {
      competencias: Number(inputCompetencias.value) || 6,
      ...(empresaId ? { empresaId } : {}),
    };
  }

  form.addEventListener('submit', (evento) => {
    evento.preventDefault();
    void carregarEvolucao(token, filtrosAtuais());
  });

  await carregarEvolucao(token, filtrosAtuais());
}

void inicializar();
