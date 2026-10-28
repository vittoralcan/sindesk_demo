// Combobox buscável de empresas. `GET /empresas` é uma lista paginada — não
// cabe inteira como <option>s no DOM, então `custom-select.js` (que
// pressupõe as opções já resolvidas) não serve aqui. Mesma casca visual do
// dropdown de custom-select.js, mas por baixo é uma busca ao vivo na API.
//
// Uso: declare um <div> vazio no template (na página, ou dentro de um modal
// recém-aberto) e chame, depois que ele já existe no DOM:
//   inicializarEmpresaSelect(document.getElementById('modal-empresa-select'), { token });
// O valor de verdade fica num <input type="hidden"> criado dentro do
// próprio elemento raiz — leia com:
//   elementoRaiz.querySelector('.empresa-select-valor').value
import { listarEmpresas } from './api.js';
import { escaparHtml } from './ui.js';

const ATRASO_BUSCA_MS = 300;

// Só uma lista aberta por vez, entre todas as instâncias deste componente
// na mesma página (mesmo padrão de custom-select.js/custom-date-picker.js).
let fecharListaAbertaAtual = null;

function fecharQualquerListaAberta() {
  if (fecharListaAbertaAtual) fecharListaAbertaAtual();
}

function formatarCnpjExibicao(cnpj) {
  const digitos = String(cnpj ?? '').replace(/\D/g, '');
  if (digitos.length !== 14) return cnpj ?? '';
  return `${digitos.slice(0, 2)}.${digitos.slice(2, 5)}.${digitos.slice(5, 8)}/${digitos.slice(8, 12)}-${digitos.slice(12)}`;
}

/**
 * @param {HTMLElement} elementoRaiz <div> vazio já no DOM.
 * @param {{
 *   token: string,
 *   valorInicial?: { id: string, razaoSocial: string },
 *   filtrosExtra?: object,
 *   aoSelecionar?: (empresa: { id: string, razaoSocial: string } | null) => void,
 *   aoCriarNova?: () => void,
 * }} opcoes `filtrosExtra` é mesclado a cada busca (ex.: `{ status: 'ATIVA' }`
 *   pra quem só pode escolher empresa ativa). `aoCriarNova`, se passado,
 *   acrescenta um item fixo "Cadastrar nova empresa" ao fim da lista — ficar
 *   de fora dela (num link separado, fora do dropdown) foi tentado antes e
 *   ficava inacessível ao clique: o dropdown é `position: absolute` e pinta
 *   por cima de qualquer elemento estático logo abaixo, não importa margem
 *   ou z-index do outro lado.
 */
export function inicializarEmpresaSelect(
  elementoRaiz,
  { token, valorInicial, filtrosExtra = {}, aoSelecionar, aoCriarNova } = {},
) {
  if (!elementoRaiz || elementoRaiz.dataset.customizado === 'true') return;
  elementoRaiz.dataset.customizado = 'true';
  elementoRaiz.classList.add('empresa-select');

  elementoRaiz.innerHTML = `
    <input type="hidden" class="empresa-select-valor">
    <input type="text" class="empresa-select-busca" autocomplete="off" placeholder="Buscar empresa por nome...">
    <ul class="empresa-select-lista" role="listbox"></ul>
  `;

  const inputValor = elementoRaiz.querySelector('.empresa-select-valor');
  const inputBusca = elementoRaiz.querySelector('.empresa-select-busca');
  const lista = elementoRaiz.querySelector('.empresa-select-lista');

  let timeoutBusca = null;
  let requisicaoAtualId = 0;
  let resultados = [];
  let indiceAtivo = -1;

  // Com aoCriarNova, o item "Cadastrar nova empresa" conta como mais uma
  // posição navegável por teclado, logo depois do último resultado.
  function totalPosicoes() {
    return (resultados?.length ?? 0) + (aoCriarNova ? 1 : 0);
  }

  function limparSelecao() {
    if (!inputValor.value) return;
    inputValor.value = '';
    inputValor.dispatchEvent(new Event('change', { bubbles: true }));
    aoSelecionar?.(null);
  }

  function fechar() {
    lista.classList.remove('is-aberta');
    document.removeEventListener('mousedown', aoClicarFora);
    if (fecharListaAbertaAtual === fechar) fecharListaAbertaAtual = null;
  }

  function aoClicarFora(evento) {
    if (!elementoRaiz.contains(evento.target)) fechar();
  }

  function abrir() {
    fecharQualquerListaAberta();
    lista.classList.add('is-aberta');
    fecharListaAbertaAtual = fechar;
    document.addEventListener('mousedown', aoClicarFora);
  }

  function selecionar(empresa) {
    inputValor.value = empresa.id;
    inputBusca.value = empresa.razaoSocial;
    inputValor.dispatchEvent(new Event('change', { bubbles: true }));
    aoSelecionar?.(empresa);
    fechar();
    // Bug #10 do relatório de QA de 2026-09-21: o mousedown na lista usa
    // preventDefault() de propósito (comentário acima, em `lista.addEventListener`)
    // pra selecionar antes do blur fechar a lista — mas isso também significa
    // que o foco nunca sai do campo de busca sozinho depois da seleção, e
    // .campo-formulario input:focus usa a cor primária (vermelha) da marca
    // pra borda/glow. Sem isto, essa borda "de erro" ficava até o usuário
    // clicar em outro lugar, mesmo com uma empresa já selecionada.
    inputBusca.blur();
  }

  function itemCriarNovaHtml() {
    if (!aoCriarNova) return '';
    const posicao = resultados?.length ?? 0;
    return `
      <li role="option" data-acao="criar-nova" class="empresa-select-criar-nova ${posicao === indiceAtivo ? 'is-ativa' : ''}">
        <i class="fa-solid fa-plus" aria-hidden="true"></i> Cadastrar nova empresa
      </li>
    `;
  }

  function renderizarLista() {
    if (resultados === null) {
      lista.innerHTML = '<li class="empresa-select-mensagem">Buscando...</li>' + itemCriarNovaHtml();
      return;
    }
    if (resultados.length === 0) {
      lista.innerHTML = '<li class="empresa-select-mensagem">Nenhuma empresa encontrada.</li>' + itemCriarNovaHtml();
      return;
    }
    lista.innerHTML =
      resultados
        .map(
          (empresa, indice) => `
          <li role="option" data-indice="${indice}" class="${indice === indiceAtivo ? 'is-ativa' : ''}" aria-selected="${empresa.id === inputValor.value}">
            <span class="empresa-select-nome">${escaparHtml(empresa.razaoSocial)}</span>
            <span class="empresa-select-cnpj">${escaparHtml(formatarCnpjExibicao(empresa.cnpj))}${empresa.status === 'INATIVA' ? ' · Inativa' : ''}</span>
          </li>
        `,
        )
        .join('') + itemCriarNovaHtml();
  }

  async function buscar(termo) {
    const idRequisicao = ++requisicaoAtualId;
    resultados = null;
    indiceAtivo = -1;
    renderizarLista();
    abrir();
    try {
      const resposta = await listarEmpresas(token, { razaoSocial: termo, limit: 10, ...filtrosExtra });
      if (idRequisicao !== requisicaoAtualId) return; // resposta obsoleta — uma busca mais nova já está em curso
      resultados = resposta.data;
      renderizarLista();
    } catch {
      if (idRequisicao !== requisicaoAtualId) return;
      resultados = [];
      renderizarLista();
    }
  }

  inputBusca.addEventListener('input', () => {
    limparSelecao();
    clearTimeout(timeoutBusca);
    timeoutBusca = setTimeout(() => buscar(inputBusca.value.trim()), ATRASO_BUSCA_MS);
  });

  inputBusca.addEventListener('focus', () => {
    if (!lista.classList.contains('is-aberta')) buscar(inputBusca.value.trim());
  });

  inputBusca.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape') {
      fechar();
    } else if (evento.key === 'ArrowDown' && totalPosicoes() > 0) {
      evento.preventDefault();
      indiceAtivo = Math.min(totalPosicoes() - 1, indiceAtivo + 1);
      renderizarLista();
    } else if (evento.key === 'ArrowUp' && totalPosicoes() > 0) {
      evento.preventDefault();
      indiceAtivo = Math.max(0, indiceAtivo - 1);
      renderizarLista();
    } else if (evento.key === 'Enter' && indiceAtivo >= 0 && indiceAtivo < (resultados?.length ?? 0)) {
      evento.preventDefault();
      selecionar(resultados[indiceAtivo]);
    } else if (evento.key === 'Enter' && indiceAtivo === (resultados?.length ?? 0) && aoCriarNova) {
      evento.preventDefault();
      fechar();
      aoCriarNova();
    }
  });

  // mousedown (não click) pra selecionar antes do blur do input de busca
  // fechar a lista.
  lista.addEventListener('mousedown', (evento) => {
    evento.preventDefault();
    if (evento.target.closest('li[data-acao="criar-nova"]')) {
      fechar();
      aoCriarNova?.();
      return;
    }
    const li = evento.target.closest('li[data-indice]');
    if (!li) return;
    selecionar(resultados[Number(li.dataset.indice)]);
  });

  if (valorInicial) {
    inputValor.value = valorInicial.id;
    inputBusca.value = valorInicial.razaoSocial;
  }
}

/** Define programaticamente a empresa selecionada — ex.: depois de cadastrar
 * uma empresa nova por dentro do próprio formulário. Dispara `change` no
 * input oculto, igual ao que os demais componentes customizados já fazem
 * quando o valor muda por fora de uma interação direta do usuário. */
export function definirEmpresaSelecionada(elementoRaiz, empresa) {
  const inputValor = elementoRaiz.querySelector('.empresa-select-valor');
  const inputBusca = elementoRaiz.querySelector('.empresa-select-busca');
  if (!inputValor || !inputBusca) return;
  inputValor.value = empresa?.id ?? '';
  inputBusca.value = empresa?.razaoSocial ?? '';
  inputValor.dispatchEvent(new Event('change', { bubbles: true }));
}
