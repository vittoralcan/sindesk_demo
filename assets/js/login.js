import { login, ApiError } from './api.js';
import { salvarSessao, obterToken } from './auth-storage.js';
import { inicializarTema, ligarBotaoDeTema, configurarLogoPorTema } from './theme.js';
import { iniciarParticulas } from './particles.js';

inicializarTema();
iniciarParticulas('particles-canvas');
ligarBotaoDeTema(document.getElementById('theme-toggle'));
configurarLogoPorTema(document.getElementById('logo-marca'), {
  claro: 'assets/images/sindesk_base.svg',
  escuro: 'assets/images/sindesk_white.svg',
});

// Já existe uma sessão guardada? Não custa nada tentar ir direto — a
// validação real (o token ainda ser válido) acontece em shell.js via
// GET /auth/me; se tiver expirado, shell.js manda de volta pra cá.
if (obterToken()) {
  window.location.href = 'dashboard.html';
}

const formLogin = document.getElementById('form-login');
const inputEmail = document.getElementById('input-email');
const inputSenha = document.getElementById('input-senha');
const btnEntrar = document.getElementById('btn-entrar');
const textoBtnEntrar = document.getElementById('texto-btn-entrar');
const alertaLogin = document.getElementById('alerta-login');
const alertaTexto = document.getElementById('alerta-texto');
const painelLogin = document.getElementById('login-panel');
const painelSindicatos = document.getElementById('sindicatos-panel');
const listaSindicatos = document.getElementById('lista-sindicatos');
const btnConfirmarSindicato = document.getElementById('btn-confirmar-sindicato');
const btnVoltarLogin = document.getElementById('btn-voltar-login');
const togglePassword = document.getElementById('toggle-senha');
const iconeSenha = document.getElementById('icone-senha');

// Estado só desta tela, nunca persistido: guarda e-mail/senha em memória
// pelo tempo estritamente necessário para reenviar o login com o
// sindicatoId escolhido, no fluxo de 2 etapas do 300 (RN-AUTH-02).
let credenciaisPendentes = null;

function mostrarAlerta(mensagem, tipo = 'error') {
  alertaTexto.textContent = mensagem;
  alertaLogin.classList.remove('alert--error', 'alert--warning');
  alertaLogin.classList.add(tipo === 'warning' ? 'alert--warning' : 'alert--error');
  alertaLogin.classList.add('is-visible');
}

function esconderAlerta() {
  alertaLogin.classList.remove('is-visible');
}

function definirCarregando(carregando) {
  btnEntrar.disabled = carregando;
  textoBtnEntrar.textContent = carregando ? 'Entrando...' : 'Entrar na Conta';
}

function escaparHtml(texto) {
  const div = document.createElement('div');
  div.textContent = texto;
  return div.innerHTML;
}

function mostrarEscolhaDeSindicato(sindicatos) {
  listaSindicatos.innerHTML = '';
  sindicatos.forEach((sindicato, indice) => {
    const item = document.createElement('li');
    item.className = 'opcao-sindicato';
    item.innerHTML = `
      <input type="radio" name="sindicatoId" value="${escaparHtml(sindicato.id)}" id="sindicato-${escaparHtml(sindicato.id)}" ${indice === 0 ? 'checked' : ''}>
      <label for="sindicato-${escaparHtml(sindicato.id)}" style="flex: 1; cursor: pointer;">
        <span>${escaparHtml(sindicato.nome)}</span>
      </label>
    `;
    listaSindicatos.appendChild(item);
  });
  painelLogin.classList.add('is-hidden');
  painelSindicatos.classList.add('is-visible');
}

function voltarParaLogin() {
  credenciaisPendentes = null;
  painelSindicatos.classList.remove('is-visible');
  painelLogin.classList.remove('is-hidden');
  esconderAlerta();
}

async function tentarLogin({ email, senha, sindicatoId }) {
  esconderAlerta();
  definirCarregando(true);
  try {
    const resposta = await login({ email, senha, sindicatoId });
    salvarSessao(resposta.token, resposta.usuario);
    window.location.href = 'dashboard.html';
  } catch (erro) {
    if (erro instanceof ApiError && erro.tipo === 'multiplos_sindicatos') {
      credenciaisPendentes = { email, senha };
      mostrarEscolhaDeSindicato(erro.sindicatos ?? []);
      return;
    }
    if (erro instanceof ApiError && erro.tipo === 'rate_limit') {
      mostrarAlerta(erro.message, 'warning');
      return;
    }
    mostrarAlerta(erro.message || 'Não foi possível entrar. Tente novamente.', 'error');
  } finally {
    definirCarregando(false);
  }
}

togglePassword.addEventListener('click', () => {
  const mostrandoSenha = inputSenha.type === 'text';
  inputSenha.type = mostrandoSenha ? 'password' : 'text';
  iconeSenha.classList.toggle('fa-eye', mostrandoSenha);
  iconeSenha.classList.toggle('fa-eye-slash', !mostrandoSenha);
});

formLogin.addEventListener('submit', (evento) => {
  evento.preventDefault();
  const email = inputEmail.value.trim();
  const senha = inputSenha.value;
  if (!email || !senha) return;
  void tentarLogin({ email, senha });
});

btnConfirmarSindicato.addEventListener('click', () => {
  const selecionado = listaSindicatos.querySelector('input[name="sindicatoId"]:checked');
  if (!selecionado || !credenciaisPendentes) return;
  void tentarLogin({ ...credenciaisPendentes, sindicatoId: selecionado.value });
});

btnVoltarLogin.addEventListener('click', () => {
  voltarParaLogin();
});
