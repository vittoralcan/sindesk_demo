// Ação "Cadastrar empresa" — versão mínima usada para destravar a abertura
// de vínculo profissional quando a empresa ainda não existe no cadastro
// (Fase 4/Fatia A). O formulário completo (endereço, contato, observações)
// vive na tela de Empresas; aqui só o suficiente pra criar o registro.
import { criarEmpresa, ApiError } from './api.js';
import { abrirModal, fecharModal } from './ui.js';

/**
 * @param {{ token: string, aoConcluir: (empresaCriada: object) => void }} opcoes
 */
export function abrirModalCriarEmpresa({ token, aoConcluir }) {
  const conteudo = abrirModal(`
    <h2>Cadastrar empresa</h2>

    <div id="alerta-modal-criar-empresa" class="alert" role="alert" aria-live="polite">
      <i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i>
      <span id="alerta-modal-criar-empresa-texto"></span>
    </div>

    <form id="form-criar-empresa">
      <div class="campo-formulario obrigatorio">
        <label for="modal-empresa-razao-social">Razão social</label>
        <input type="text" id="modal-empresa-razao-social" required>
      </div>
      <div class="campo-formulario obrigatorio">
        <label for="modal-empresa-cnpj-novo">CNPJ</label>
        <input type="text" id="modal-empresa-cnpj-novo" inputmode="numeric" placeholder="Com ou sem máscara" required>
      </div>
      <div class="campo-formulario">
        <label for="modal-empresa-nome-fantasia">Nome fantasia (opcional)</label>
        <input type="text" id="modal-empresa-nome-fantasia">
      </div>
      <div class="acoes-formulario">
        <button type="submit" class="btn-submit" id="btn-confirmar-criar-empresa">
          <span id="texto-btn-confirmar-criar-empresa">Cadastrar</span>
        </button>
      </div>
    </form>
  `);

  const form = conteudo.querySelector('#form-criar-empresa');
  const alerta = conteudo.querySelector('#alerta-modal-criar-empresa');
  const alertaTexto = conteudo.querySelector('#alerta-modal-criar-empresa-texto');
  const btnConfirmar = conteudo.querySelector('#btn-confirmar-criar-empresa');
  const textoBtnConfirmar = conteudo.querySelector('#texto-btn-confirmar-criar-empresa');

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    alerta.classList.remove('is-visible');
    btnConfirmar.disabled = true;
    textoBtnConfirmar.textContent = 'Cadastrando...';

    // Nome fantasia é opcional de verdade — omitido do corpo quando vazio,
    // mesmo padrão já usado pro CNPJ opcional em acao-adicionar-vinculo.js.
    const nomeFantasia = conteudo.querySelector('#modal-empresa-nome-fantasia').value.trim();

    try {
      const resultado = await criarEmpresa(token, {
        razaoSocial: conteudo.querySelector('#modal-empresa-razao-social').value.trim(),
        cnpj: conteudo.querySelector('#modal-empresa-cnpj-novo').value.trim(),
        ...(nomeFantasia ? { nomeFantasia } : {}),
      });
      fecharModal();
      aoConcluir(resultado);
    } catch (erro) {
      alertaTexto.textContent = erro instanceof ApiError ? erro.message : 'Não foi possível cadastrar a empresa.';
      alerta.classList.add('alert--error', 'is-visible');
      btnConfirmar.disabled = false;
      textoBtnConfirmar.textContent = 'Cadastrar';
    }
  });
}
