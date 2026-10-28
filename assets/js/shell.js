// Casca da aplicação autenticada — cabeçalho, menu lateral e a garantia de
// sessão válida (GET /auth/me), reaproveitada por toda tela autenticada.
//
// Uso: `const usuario = await montarShell({ itemAtivo: 'filiados' });` no
// início do script de cada página — se vier `null`, a página já foi
// redirecionada pro login e não deve renderizar mais nada.
import { obterUsuarioAutenticado, ApiError } from './api.js';
import { obterToken, obterUsuarioSalvo, limparSessao } from './auth-storage.js';
import { inicializarTema, ligarBotaoDeTema, configurarLogoPorTema } from './theme.js';
import { iniciarParticulas } from './particles.js';

// Cada item vira link de verdade (`disponivel: true` + `href`) assim que a
// tela correspondente for construída.
//
// `perfis`, quando presente, restringe o item a esses perfis (Fase 4 —
// telas como Planos de Contribuição e Conciliação têm leitura já restrita
// no próprio backend, então não faz sentido oferecer o link a quem só vai
// receber 403 ao entrar). Ausente = visível a todos, como sempre foi.
const ITENS_MENU = [
  { id: 'dashboard', label: 'Dashboard', icone: 'fa-gauge', href: 'dashboard.html', disponivel: true },
  { id: 'filiados', label: 'Filiados', icone: 'fa-users', href: 'filiados.html', disponivel: true },
  { id: 'empresas', label: 'Empresas', icone: 'fa-building', href: 'empresas.html', disponivel: true },
  {
    id: 'planos',
    label: 'Planos de Contribuição',
    icone: 'fa-sack-dollar',
    href: 'planos-contribuicao.html',
    disponivel: true,
    perfis: ['ADMIN', 'TESOUREIRO'],
  },
  {
    id: 'vencimentos',
    label: 'Vencimentos Próximos',
    icone: 'fa-hourglass-half',
    href: 'vencimentos-proximos.html',
    disponivel: true,
  },
  { id: 'relatorios', label: 'Relatórios', icone: 'fa-file-lines', href: 'relatorios.html', disponivel: true },
  {
    id: 'espelho',
    label: 'Espelho de Cobrança',
    icone: 'fa-file-invoice-dollar',
    href: 'cobrancas-espelho.html',
    disponivel: true,
    perfis: ['ADMIN', 'TESOUREIRO'],
  },
  {
    id: 'recebimentos',
    label: 'Recebimentos',
    icone: 'fa-hand-holding-dollar',
    href: 'recebimentos.html',
    disponivel: true,
    perfis: ['ADMIN', 'TESOUREIRO'],
  },
  {
    id: 'conciliacao',
    label: 'Conciliação',
    icone: 'fa-scale-balanced',
    href: 'conciliacao.html',
    disponivel: true,
    perfis: ['ADMIN', 'TESOUREIRO'],
  },
  {
    id: 'pix',
    label: 'Gerar Pix',
    icone: 'fa-qrcode',
    href: 'gerar-pix.html',
    disponivel: true,
    perfis: ['ADMIN', 'TESOUREIRO'],
  },
  {
    id: 'config-sindicato',
    label: 'Configurações',
    icone: 'fa-gear',
    href: 'sindicato-configuracoes.html',
    disponivel: true,
    perfis: ['ADMIN', 'TESOUREIRO'],
  },
];

function escaparHtml(texto) {
  const div = document.createElement('div');
  div.textContent = texto ?? '';
  return div.innerHTML;
}

function irParaLogin() {
  limparSessao();
  window.location.href = 'index.html';
}

// Bug #7 do relatório de QA de 2026-09-21: em viewport mobile o menu lateral
// não colapsava — ficava fixo, empurrando todo o conteúdo pra baixo. A partir
// daqui o menu vira uma gaveta (off-canvas) abaixo do breakpoint de 780px
// (shell.css), controlada por uma classe em <body> — não em .app-menu, que é
// recriado a cada renderizarMenu() e perderia qualquer estado próprio.
function fecharMenuMobile() {
  document.body.classList.remove('menu-aberto');
  document.getElementById('menu-toggle')?.setAttribute('aria-expanded', 'false');
}

function alternarMenuMobile() {
  const aberto = document.body.classList.toggle('menu-aberto');
  document.getElementById('menu-toggle')?.setAttribute('aria-expanded', String(aberto));
}

function garantirBackdropMenu() {
  if (document.getElementById('app-menu-backdrop')) return;
  const backdrop = document.createElement('div');
  backdrop.id = 'app-menu-backdrop';
  backdrop.className = 'app-menu-backdrop';
  backdrop.addEventListener('click', fecharMenuMobile);
  document.body.appendChild(backdrop);
  document.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape') fecharMenuMobile();
  });
}

function renderizarCabecalho(usuario) {
  const container = document.getElementById('app-shell-header');
  if (!container) return;

  const nome = usuario?.nome ?? 'Carregando...';
  const inicial = usuario?.nome ? usuario.nome.trim().charAt(0).toUpperCase() : '?';
  const perfil = usuario?.perfil ?? '';

  container.innerHTML = `
    <div class="app-header glass-card">
      <div class="header-left">
        <button type="button" id="menu-toggle" class="menu-toggle" aria-label="Abrir menu" aria-expanded="false">
          <i class="fa-solid fa-bars" aria-hidden="true"></i>
        </button>
        <div class="brand">
          <img src="assets/images/sindesk_base.svg" alt="Sindesk" class="logo-header" id="logo-marca">
        </div>
      </div>
      <div class="user-chip">
        <button type="button" id="theme-toggle" class="theme-toggle" style="position: static;" aria-label="Alternar tema claro/escuro">
          <i class="fa-solid fa-moon" aria-hidden="true"></i>
          <i class="fa-solid fa-sun" aria-hidden="true"></i>
        </button>
        <div class="avatar" aria-hidden="true">${escaparHtml(inicial)}</div>
        <div class="user-info">
          <strong>${escaparHtml(nome)}</strong>
          <span>${escaparHtml(perfil)}</span>
        </div>
        <button type="button" class="btn-sair" id="btn-sair">
          <i class="fa-solid fa-right-from-bracket" aria-hidden="true"></i>
          Sair
        </button>
      </div>
    </div>
  `;

  document.getElementById('btn-sair').addEventListener('click', irParaLogin);
  document.getElementById('menu-toggle').addEventListener('click', alternarMenuMobile);
  ligarBotaoDeTema(document.getElementById('theme-toggle'));
  configurarLogoPorTema(document.getElementById('logo-marca'), {
    claro: 'assets/images/sindesk_base.svg',
    escuro: 'assets/images/sindesk_white.svg',
  });
}

function renderizarMenu(itemAtivo, perfilUsuario) {
  const container = document.getElementById('app-shell-nav');
  if (!container) return;

  const itens = ITENS_MENU.filter((item) => !item.perfis || item.perfis.includes(perfilUsuario)).map((item) => {
    const classeAtiva = item.id === itemAtivo ? ' is-active' : '';
    const conteudo = `<i class="fa-solid ${item.icone}" aria-hidden="true"></i> ${escaparHtml(item.label)}`;

    if (!item.disponivel) {
      return `<li><a href="#" aria-disabled="true" class="${classeAtiva}">${conteudo} <span class="badge-em-breve">Em breve</span></a></li>`;
    }
    return `<li><a href="${item.href}" class="${classeAtiva}">${conteudo}</a></li>`;
  }).join('');

  container.innerHTML = `<nav class="app-menu glass-card" aria-label="Menu principal"><ul>${itens}</ul></nav>`;
}

/**
 * Monta o shell autenticado (tema, partículas, logo, cabeçalho, menu) numa
 * página que já declarou `<div id="app-shell-header"></div>` e
 * `<div id="app-shell-nav"></div>` no HTML, e confirma a sessão com o
 * backend via GET /auth/me. Chame uma vez, antes de renderizar qualquer
 * dado específico da tela.
 *
 * @param {{ itemAtivo: string | null }} opcoes
 * @returns {Promise<object | null>} o usuário autenticado, ou `null` se a
 *   página já foi redirecionada pro login (sem sessão, ou sessão inválida).
 */
export async function montarShell({ itemAtivo }) {
  inicializarTema();
  iniciarParticulas('particles-canvas');
  garantirBackdropMenu();

  const token = obterToken();
  if (!token) {
    irParaLogin();
    return null;
  }

  const usuarioEmCache = obterUsuarioSalvo();
  renderizarCabecalho(usuarioEmCache);
  // Filtra já com o perfil em cache (se houver) — evita o "flash" de um
  // item restrito por perfil aparecendo e sumindo assim que a confirmação
  // abaixo chega; na primeira sessão (sem cache ainda), some com
  // `perfilUsuario` undefined mesmo, igual a antes.
  renderizarMenu(itemAtivo, usuarioEmCache?.perfil);

  try {
    const usuario = await obterUsuarioAutenticado(token);
    renderizarCabecalho(usuario);
    // O perfil só é conhecido depois desta confirmação — a primeira
    // renderizarMenu(itemAtivo), acima, roda sem `perfilUsuario` e por isso
    // só mostra os itens sem restrição de perfil; esta segunda chamada é
    // quem aplica o filtro de fato.
    renderizarMenu(itemAtivo, usuario.perfil);
    return usuario;
  } catch (erro) {
    if (erro instanceof ApiError && (erro.statusCode === 401 || erro.statusCode === 403)) {
      irParaLogin();
      return null;
    }
    // Falha de rede ou erro inesperado: mantém os dados salvos do login,
    // não força logout por causa de instabilidade momentânea de conexão.
    console.warn('Não foi possível confirmar a sessão com o servidor agora.', erro);
    const usuarioSalvo = obterUsuarioSalvo();
    renderizarMenu(itemAtivo, usuarioSalvo?.perfil);
    return usuarioSalvo;
  }
}
