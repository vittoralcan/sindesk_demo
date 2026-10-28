// Substitui visualmente um <select> nativo por um dropdown com a cara do
// projeto (glassmorphism) — o navegador não deixa restilizar o menu aberto
// de um <select> de verdade, então a única forma de ter esse visual é
// construir o dropdown do zero.
//
// O <select> original continua no DOM (só escondido visualmente, sem
// display:none — mantém `required`/validação nativa funcionando) e é ele
// quem guarda o valor de verdade; todo código que já faz `select.value` ou
// `getElementById(id)` continua funcionando sem nenhuma alteração. Este
// componente é só uma casca visual sincronizada por cima.
//
// Uso: chame depois que o <select> já existe no DOM (na página, ou dentro
// de um modal recém-aberto):
//   inicializarSelectCustomizado(document.getElementById('filtro-status'))

let listaAbertaAtual = null;
let fecharListaAtual = null;

function fecharQualquerListaAberta() {
  if (fecharListaAtual) fecharListaAtual();
}

/** @param {HTMLSelectElement} select */
export function inicializarSelectCustomizado(select) {
  if (!select || select.dataset.customizado === 'true') return;
  select.dataset.customizado = 'true';

  // Libera o id original pro botão visual — é nele que um <label for="...">
  // associado precisa focar/clicar, não no <select> escondido.
  const idOriginal = select.id;
  if (idOriginal) select.id = `${idOriginal}__nativo`;

  const wrapper = document.createElement('div');
  wrapper.className = 'select-customizado';
  select.parentNode.insertBefore(wrapper, select);
  wrapper.appendChild(select);
  select.classList.add('select-customizado-nativo');

  const gatilho = document.createElement('button');
  gatilho.type = 'button';
  if (idOriginal) gatilho.id = idOriginal;
  gatilho.className = 'select-customizado-gatilho';
  gatilho.setAttribute('aria-haspopup', 'listbox');
  gatilho.setAttribute('aria-expanded', 'false');
  // O <select> nativo escondido continua obedecendo `disabled` sozinho
  // (é ele quem trava o valor de verdade), mas a casca visual por cima —
  // um <button> — não herda esse estado: sem isto, ela abre normalmente
  // mesmo com o campo travado (achado real: combobox de plano padrão
  // "editável" pra TESOUREIRO, apesar do <select> já vir `disabled`).
  // Assume-se fixo no momento da inicialização — nenhum caller de hoje
  // alterna `disabled` depois de já ter chamado esta função.
  if (select.disabled) gatilho.disabled = true;
  if (select.getAttribute('aria-label')) gatilho.setAttribute('aria-label', select.getAttribute('aria-label'));
  gatilho.innerHTML = `<span class="select-customizado-label"></span><i class="fa-solid fa-chevron-down" aria-hidden="true"></i>`;

  const lista = document.createElement('ul');
  lista.className = 'select-customizado-lista';
  lista.setAttribute('role', 'listbox');

  const rotulo = gatilho.querySelector('.select-customizado-label');
  let indiceAtivo = -1;

  function opcoes() {
    return Array.from(select.options);
  }

  function atualizarRotulo() {
    const selecionada = opcoes().find((o) => o.value === select.value) ?? opcoes()[0];
    rotulo.textContent = selecionada ? selecionada.textContent : '';
  }

  function renderizarLista() {
    lista.innerHTML = opcoes()
      .map(
        (opcao, indice) => `
          <li role="option" data-indice="${indice}" class="${opcao.value === select.value ? 'is-selecionada' : ''}" aria-selected="${opcao.value === select.value}">
            ${opcao.textContent}
          </li>
        `,
      )
      .join('');
  }

  function realcarIndice(indice) {
    indiceAtivo = indice;
    lista.querySelectorAll('li').forEach((li, i) => li.classList.toggle('is-ativa', i === indice));
  }

  function fechar() {
    lista.classList.remove('is-aberta');
    gatilho.classList.remove('is-aberto');
    gatilho.setAttribute('aria-expanded', 'false');
    document.removeEventListener('mousedown', aoClicarFora);
    document.removeEventListener('keydown', aoTeclar);
    if (listaAbertaAtual === lista) {
      listaAbertaAtual = null;
      fecharListaAtual = null;
    }
  }

  function aoClicarFora(evento) {
    if (!wrapper.contains(evento.target)) fechar();
  }

  function selecionar(valor) {
    select.value = valor;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    atualizarRotulo();
    fechar();
    gatilho.focus();
  }

  function aoTeclar(evento) {
    const itens = opcoes();
    if (evento.key === 'Escape') {
      fechar();
      gatilho.focus();
    } else if (evento.key === 'ArrowDown') {
      evento.preventDefault();
      realcarIndice(Math.min(itens.length - 1, indiceAtivo + 1));
    } else if (evento.key === 'ArrowUp') {
      evento.preventDefault();
      realcarIndice(Math.max(0, indiceAtivo - 1));
    } else if (evento.key === 'Enter' || evento.key === ' ') {
      evento.preventDefault();
      if (indiceAtivo >= 0) selecionar(itens[indiceAtivo].value);
    }
  }

  function abrir() {
    fecharQualquerListaAberta();
    renderizarLista();
    const indiceSelecionado = opcoes().findIndex((o) => o.value === select.value);
    realcarIndice(indiceSelecionado >= 0 ? indiceSelecionado : 0);
    lista.classList.add('is-aberta');
    gatilho.classList.add('is-aberto');
    gatilho.setAttribute('aria-expanded', 'true');
    listaAbertaAtual = lista;
    fecharListaAtual = fechar;
    document.addEventListener('mousedown', aoClicarFora);
    document.addEventListener('keydown', aoTeclar);
  }

  gatilho.addEventListener('click', () => {
    if (lista.classList.contains('is-aberta')) fechar();
    else abrir();
  });

  lista.addEventListener('click', (evento) => {
    const li = evento.target.closest('li[role="option"]');
    if (!li) return;
    selecionar(opcoes()[Number(li.dataset.indice)].value);
  });

  // Se o valor do <select> mudar por fora (outro código disparando
  // 'change' manualmente), mantém o rótulo visível em dia.
  select.addEventListener('change', atualizarRotulo);

  wrapper.appendChild(gatilho);
  wrapper.appendChild(lista);
  atualizarRotulo();
}
