// Guarda a sessão em sessionStorage (não localStorage): sem refresh token no
// backend, o JWT expira em 8h fixas de qualquer forma — sessionStorage
// reduz a janela de exposição a roubo de token via XSS, limpando sozinho ao
// fechar a aba.
const CHAVE_TOKEN = 'sindesk.token';
const CHAVE_USUARIO = 'sindesk.usuario';

/**
 * @param {string} token
 * @param {object} usuario
 */
export function salvarSessao(token, usuario) {
  sessionStorage.setItem(CHAVE_TOKEN, token);
  sessionStorage.setItem(CHAVE_USUARIO, JSON.stringify(usuario));
}

export function obterToken() {
  return sessionStorage.getItem(CHAVE_TOKEN);
}

export function obterUsuarioSalvo() {
  const bruto = sessionStorage.getItem(CHAVE_USUARIO);
  return bruto ? JSON.parse(bruto) : null;
}

export function limparSessao() {
  sessionStorage.removeItem(CHAVE_TOKEN);
  sessionStorage.removeItem(CHAVE_USUARIO);
}
