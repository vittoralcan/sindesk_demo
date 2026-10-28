// Tela "Gerar Pix" — RN-PIX-02 (07-regras-de-negocio-e-seguranca.md, seção
// 15) e guia-front-end-pix-manual.md. Gera um QR Code Pix estático, ao vivo,
// pra uma empresa numa competência; nada é persistido — gerar de novo para a
// mesma empresa/competência é normal e sempre volta o mesmo `copiaECola`.
import { gerarPixEmpresa, obterEmpresa, ApiError } from './api.js';
import { obterToken } from './auth-storage.js';
import { montarShell } from './shell.js';
import { renderizarEstadoPagina, formatarMoeda, formatarDataHora, formatarCompetencia, competenciaAtual } from './ui.js';
import { inicializarEmpresaSelect } from './empresa-select.js';
import { inicializarMesAnoCustomizado } from './custom-month-picker.js';

// RN-PIX-04: mesma régua de perfis do espelho de cobrança — ADMIN/TESOUREIRO.
const PERFIS_PERMITIDOS = ['ADMIN', 'TESOUREIRO'];

const container = document.getElementById('conteudo-pix');
const form = document.getElementById('form-gerar-pix');
const elementoEmpresaSelect = document.getElementById('pix-empresa-select');
const inputCompetencia = document.getElementById('input-competencia-pix');
const alerta = document.getElementById('alerta-gerar-pix');
const alertaTexto = document.getElementById('alerta-gerar-pix-texto');
const btnGerar = document.getElementById('btn-gerar-pix');
const textoBtnGerar = document.getElementById('texto-btn-gerar-pix');

const secaoResultado = document.getElementById('secao-resultado-pix');
const resultadoEmpresa = document.getElementById('pix-resultado-empresa');
const resultadoCompetencia = document.getElementById('pix-resultado-competencia');
const resultadoValor = document.getElementById('pix-resultado-valor');
const resultadoGeradoEm = document.getElementById('pix-resultado-gerado-em');
const resultadoImagem = document.getElementById('pix-resultado-imagem');
const resultadoCodigo = document.getElementById('pix-resultado-codigo');
const btnCopiarCodigo = document.getElementById('btn-copiar-codigo-pix');
const textoBtnCopiarCodigo = document.getElementById('texto-btn-copiar-codigo-pix');

function renderizarResultado(pix) {
  resultadoEmpresa.textContent = pix.razaoSocial;
  resultadoCompetencia.textContent = formatarCompetencia(pix.competencia);
  resultadoValor.textContent = formatarMoeda(pix.valorCentavos);
  resultadoGeradoEm.textContent = formatarDataHora(pix.geradoEm);
  resultadoImagem.src = pix.imagemBase64;
  resultadoCodigo.value = pix.copiaECola;
  secaoResultado.hidden = false;
}

async function inicializar() {
  const usuario = await montarShell({ itemAtivo: 'pix' });
  if (!usuario) return;

  if (!PERFIS_PERMITIDOS.includes(usuario.perfil)) {
    renderizarEstadoPagina(container, {
      icone: 'fa-lock',
      titulo: 'Sem permissão',
      mensagem: 'Seu perfil não tem acesso à geração de cobrança via Pix.',
    });
    return;
  }

  const token = obterToken();

  // Competência futura é 400 (RN-PIX-02) — trava com `max` pra não deixar
  // escolher algo que a API vai recusar de todo jeito.
  inputCompetencia.max = competenciaAtual();

  // Chegando de empresa-detalhe.html (link "Gerar Pix" da seção Espelho de
  // Cobrança), a empresa e a competência já consultadas ali vêm por query
  // string — evita reescolher o que o operador já tinha selecionado.
  const parametros = new URLSearchParams(window.location.search);
  const empresaIdPreSelecionada = parametros.get('empresaId');
  const competenciaPreSelecionada = parametros.get('competencia');
  if (competenciaPreSelecionada) inputCompetencia.value = competenciaPreSelecionada;
  inicializarMesAnoCustomizado(inputCompetencia);

  let empresaPreSelecionada;
  if (empresaIdPreSelecionada) {
    try {
      const empresa = await obterEmpresa(token, empresaIdPreSelecionada);
      empresaPreSelecionada = { id: empresa.id, razaoSocial: empresa.razaoSocial };
    } catch {
      // Empresa inexistente/de outro tenant na URL — segue sem
      // pré-seleção, o operador escolhe manualmente no combobox.
    }
  }

  inicializarEmpresaSelect(elementoEmpresaSelect, { token, valorInicial: empresaPreSelecionada });

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    alerta.classList.remove('is-visible');
    secaoResultado.hidden = true;

    const empresaId = elementoEmpresaSelect.querySelector('.empresa-select-valor').value;
    if (!empresaId) {
      alertaTexto.textContent = 'Selecione uma empresa da lista.';
      alerta.classList.add('alert--error', 'is-visible');
      return;
    }
    if (!inputCompetencia.value) {
      alertaTexto.textContent = 'Selecione a competência.';
      alerta.classList.add('alert--error', 'is-visible');
      return;
    }

    btnGerar.disabled = true;
    textoBtnGerar.textContent = 'Gerando...';

    try {
      const pix = await gerarPixEmpresa(token, empresaId, { competencia: inputCompetencia.value });
      renderizarResultado(pix);
    } catch (erro) {
      alertaTexto.textContent = erro instanceof ApiError ? erro.message : 'Não foi possível gerar o Pix.';
      alerta.classList.add('alert--error', 'is-visible');
    } finally {
      btnGerar.disabled = false;
      textoBtnGerar.textContent = 'Gerar Pix';
    }
  });

  btnCopiarCodigo.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(resultadoCodigo.value);
      textoBtnCopiarCodigo.textContent = 'Copiado!';
    } catch {
      textoBtnCopiarCodigo.textContent = 'Não foi possível copiar';
    } finally {
      setTimeout(() => {
        textoBtnCopiarCodigo.textContent = 'Copiar código';
      }, 2000);
    }
  });
}

void inicializar();
