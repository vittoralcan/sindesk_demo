import { obterMetricasDashboard, ApiError } from './api.js';
import { obterToken } from './auth-storage.js';
import { montarShell } from './shell.js';
import { renderizarEstadoPagina } from './ui.js';

// RN-* (07-regras-de-negocio-e-seguranca.md, seção 7): dashboard é métrica
// agregada de todo o tenant, régua mais restrita que a listagem — só
// ADMIN/TESOUREIRO, nem SECRETARIO nem ASSISTENTE.
const PERFIS_PERMITIDOS = ['ADMIN', 'TESOUREIRO'];

const container = document.getElementById('conteudo-dashboard');

const formatoNumero = new Intl.NumberFormat('pt-BR');

function preencherMetrica(id, valor) {
  const elemento = document.getElementById(id);
  if (elemento) elemento.textContent = formatoNumero.format(valor);
}

function renderizarMetricas(metricas) {
  preencherMetrica('metrica-total', metricas.totalFiliados);
  preencherMetrica('metrica-ativos', metricas.filiadosAtivos);
  preencherMetrica('metrica-inativos', metricas.filiadosInativos);
  preencherMetrica('metrica-afastados', metricas.filiadosAfastados);
  preencherMetrica('metrica-aposentados', metricas.filiadosAposentados);
  preencherMetrica('metrica-novas-filiacoes', metricas.novasFiliacoesMesAtual);
  preencherMetrica('metrica-vencimentos-30', metricas.vencimentosProximos30Dias);
  preencherMetrica('metrica-vencimentos-60', metricas.vencimentosProximos60Dias);
}

async function inicializar() {
  const usuario = await montarShell({ itemAtivo: 'dashboard' });
  if (!usuario) return;

  if (!PERFIS_PERMITIDOS.includes(usuario.perfil)) {
    renderizarEstadoPagina(container, {
      icone: 'fa-lock',
      titulo: 'Sem permissão',
      mensagem: 'Seu perfil não tem acesso ao dashboard gerencial.',
    });
    return;
  }

  try {
    const metricas = await obterMetricasDashboard(obterToken());
    renderizarMetricas(metricas);
  } catch (erro) {
    renderizarEstadoPagina(container, {
      icone: 'fa-triangle-exclamation',
      titulo: 'Não foi possível carregar',
      mensagem: erro instanceof ApiError ? erro.message : 'Tente novamente em instantes.',
    });
  }
}

void inicializar();
