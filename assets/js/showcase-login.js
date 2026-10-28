// Só existe no showcase — acesso rápido por perfil na tela de login.
//
// Como o RBAC do Sindesk muda o que cada tela mostra (o dashboard, por
// exemplo, nem abre para SECRETARIO), entrar com perfis diferentes é a melhor
// forma de ver o produto. Os botões só preenchem o formulário real e o enviam:
// o login passa pelo mesmo `login.js` de sempre.
import { SENHA_DEMO, USUARIOS_DEMO } from './showcase/banco-ficticio.js';

const DESCRICAO_DO_PERFIL = {
  ADMIN: 'Acesso total, inclusive anonimizar e estornar',
  TESOUREIRO: 'Dashboard, espelho, recebimentos e conciliação',
  SECRETARIO: 'Cadastro de filiados e empresas; sem financeiro',
  ASSISTENTE: 'Somente consulta de cadastro',
};

const painel = document.getElementById('login-panel');
const form = document.getElementById('form-login');
if (painel && form) {
  const bloco = document.createElement('section');
  bloco.className = 'acesso-rapido';
  bloco.innerHTML = `
    <h3>Acesso rápido</h3>
    <p>Dados fictícios. Entre com um perfil e compare o que cada um enxerga (senha de todos: <code>${SENHA_DEMO}</code>).</p>
    <div class="acesso-rapido-lista">
      ${USUARIOS_DEMO.map(
        (usuario) => `
          <button type="button" data-email="${usuario.email}">
            <strong>${usuario.perfil}</strong>
            <span>${DESCRICAO_DO_PERFIL[usuario.perfil]}</span>
          </button>`,
      ).join('')}
    </div>
  `;
  painel.appendChild(bloco);

  bloco.addEventListener('click', (evento) => {
    const botao = evento.target.closest('button[data-email]');
    if (!botao) return;
    document.getElementById('input-email').value = botao.dataset.email;
    document.getElementById('input-senha').value = SENHA_DEMO;
    form.requestSubmit();
  });
}
