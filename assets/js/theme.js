// Alternância de tema claro/escuro. Claro é o padrão fixo do produto — todo
// primeiro acesso abre claro, independente da preferência do sistema
// operacional; o escuro só entra quando o usuário escolhe manualmente pelo
// botão, e essa escolha é lembrada (localStorage, dado não sensível,
// diferente do token) nas visitas seguintes.
const CHAVE_TEMA = 'sindesk.tema';

function aplicarTema(tema) {
  document.documentElement.setAttribute('data-theme', tema);
}

export function obterTemaAtual() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

// Cada .html também tem uma cópia inline desta mesma leitura, num <script>
// síncrono (não-module) bem no <head>, antes do CSS — sem isso, o
// navegador pinta a página com a paleta clara padrão e só troca pra escura
// quando este módulo termina de carregar (alguns milissegundos depois),
// causando um flash visível de tema claro a cada navegação. Esta função
// aqui continua rodando normalmente depois (é barata/idempotente), mas
// quem elimina o flash de verdade é a cópia no <head>. Mudou a chave ou a
// regra de fallback? Atualize as duas.
export function inicializarTema() {
  const salvo = localStorage.getItem(CHAVE_TEMA);
  aplicarTema(salvo === 'dark' ? 'dark' : 'light');
}

export function alternarTema() {
  const novo = obterTemaAtual() === 'dark' ? 'light' : 'dark';
  localStorage.setItem(CHAVE_TEMA, novo);
  aplicarTema(novo);
  document.dispatchEvent(new CustomEvent('sindesk:tema-alterado', { detail: { tema: novo } }));
}

/**
 * Liga o clique de um botão (ex.: <button id="theme-toggle">) à alternância
 * de tema. Uso: `ligarBotaoDeTema(document.getElementById('theme-toggle'))`.
 * @param {HTMLElement | null} botao
 */
export function ligarBotaoDeTema(botao) {
  if (!botao) return;
  botao.addEventListener('click', () => alternarTema());
}

/**
 * Mantém a logo (um <img>) sincronizada com o tema atual — claro usa a
 * versão colorida, escuro usa a versão branca. Chame uma vez por página,
 * logo depois de `inicializarTema()`.
 * @param {HTMLImageElement | null} imgElement
 * @param {{ claro: string, escuro: string }} caminhos
 */
export function configurarLogoPorTema(imgElement, { claro, escuro }) {
  if (!imgElement) return;

  function atualizar(tema) {
    imgElement.src = tema === 'dark' ? escuro : claro;
  }

  atualizar(obterTemaAtual());
  document.addEventListener('sindesk:tema-alterado', (evento) => atualizar(evento.detail.tema));
}
