// Substitui visualmente um <input type="date"> nativo por um campo com
// máscara dd/mm/aaaa + um calendário com a cara do projeto — o navegador não
// deixa restilizar o popup nativo desse input, então a única forma de ter
// esse visual é construir o calendário do zero.
//
// O <input> original continua no DOM (só escondido visualmente, sem
// display:none — mantém `required`/`min`/`max`/validação nativa
// funcionando) e é ele quem guarda o valor de verdade ("YYYY-MM-DD"); todo
// código que já faz `input.value` ou `form.elements.namedItem(...)`
// continua funcionando sem nenhuma alteração — `name` nunca é tocado, só
// `id` (movido para o campo de texto visível, que é quem o `<label for>`
// da página deve mirar).
//
// Uso: chame depois que o <input> já existe no DOM (na página, ou dentro
// de um modal recém-aberto):
//   inicializarDatePickerCustomizado(document.getElementById('campo-dataFiliacao'))
//
// Se algum código setar `input.value` programaticamente depois de
// inicializado (ex.: preencher o formulário ao editar), ele precisa
// disparar um 'change' manualmente pra o campo de texto visível se
// atualizar — o mesmo contrato que qualquer input nativo já segue.
//
// Bug #6 do relatório de QA de 2026-09-21: antes, o elemento visível era um
// <button>, então digitar não tinha efeito nenhum, e só havia setas de
// mês anterior/próximo (sem atalho de ano). Os dois foram corrigidos aqui:
// o campo visível agora é um <input type="text"> com máscara, e o cabeçalho
// do calendário ganhou <select> de mês e de ano.

const DIAS_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

let popupAbertoAtual = null;
let fecharPopupAtual = null;

function fecharQualquerPopupAberto() {
  if (fecharPopupAtual) fecharPopupAtual();
}

function paraIso(ano, mes, dia) {
  return `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

function formatarExibicao(iso) {
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

function capitalizar(texto) {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/**
 * dd/mm/aaaa digitados → "YYYY-MM-DD", ou null se a combinação não existe
 * (ex.: 31/02, 30/02). `new Date(ano, mes, dia)` faz overflow silencioso em
 * vez de rejeitar — comparar os componentes de volta é a forma confiável de
 * detectar isso.
 */
function validarDataDigitada(dia, mes, ano) {
  if (!ano || mes < 1 || mes > 12 || dia < 1) return null;
  const data = new Date(ano, mes - 1, dia);
  if (data.getFullYear() !== ano || data.getMonth() !== mes - 1 || data.getDate() !== dia) return null;
  return paraIso(ano, mes - 1, dia);
}

/** @param {HTMLInputElement} input */
export function inicializarDatePickerCustomizado(input) {
  if (!input || input.dataset.customizado === 'true') return;
  input.dataset.customizado = 'true';

  const idOriginal = input.id;
  if (idOriginal) input.id = `${idOriginal}__nativo`;

  const wrapper = document.createElement('div');
  wrapper.className = 'date-picker-customizado';
  input.parentNode.insertBefore(wrapper, input);
  wrapper.appendChild(input);
  input.classList.add('date-picker-customizado-nativo');

  const campo = document.createElement('div');
  campo.className = 'date-picker-customizado-campo';

  const campoTexto = document.createElement('input');
  campoTexto.type = 'text';
  campoTexto.className = 'date-picker-customizado-texto';
  campoTexto.inputMode = 'numeric';
  campoTexto.autocomplete = 'off';
  campoTexto.placeholder = 'dd/mm/aaaa';
  campoTexto.maxLength = 10;
  if (idOriginal) campoTexto.id = idOriginal;
  if (input.getAttribute('aria-label')) campoTexto.setAttribute('aria-label', input.getAttribute('aria-label'));
  if (input.required) campoTexto.setAttribute('aria-required', 'true');

  const gatilho = document.createElement('button');
  gatilho.type = 'button';
  gatilho.className = 'date-picker-customizado-gatilho';
  gatilho.setAttribute('aria-label', 'Abrir calendário');
  gatilho.innerHTML = `<i class="fa-solid fa-calendar-days" aria-hidden="true"></i>`;

  campo.appendChild(campoTexto);
  campo.appendChild(gatilho);

  const erroEl = document.createElement('span');
  erroEl.className = 'date-picker-customizado-erro';
  erroEl.setAttribute('aria-live', 'polite');

  const popup = document.createElement('div');
  popup.className = 'date-picker-customizado-popup';

  let visao = null;

  function limitesPermitidos() {
    return { min: input.min || null, max: input.max || null };
  }

  function diaDesabilitado(iso) {
    const { min, max } = limitesPermitidos();
    return (min && iso < min) || (max && iso > max);
  }

  function marcarErro(mensagem) {
    campoTexto.classList.add('is-invalido');
    campo.classList.add('tem-erro');
    campoTexto.setAttribute('aria-invalid', 'true');
    erroEl.textContent = mensagem;
  }

  function limparErro() {
    campoTexto.classList.remove('is-invalido');
    campo.classList.remove('tem-erro');
    campoTexto.removeAttribute('aria-invalid');
    erroEl.textContent = '';
  }

  function sincronizarCampoTexto() {
    const valor = input.value;
    campoTexto.value = valor ? formatarExibicao(valor) : '';
    limparErro();
  }

  function gerarOpcoesAno(anoSelecionado) {
    const anoAtual = new Date().getFullYear();
    const { min, max } = limitesPermitidos();
    const anoMin = min ? Number(min.slice(0, 4)) : anoAtual - 110;
    const anoMax = max ? Number(max.slice(0, 4)) : anoAtual + 10;
    const opcoes = [];
    for (let ano = anoMax; ano >= anoMin; ano -= 1) {
      opcoes.push(`<option value="${ano}" ${ano === anoSelecionado ? 'selected' : ''}>${ano}</option>`);
    }
    return opcoes.join('');
  }

  function renderizarPopup() {
    const { ano, mes } = visao;
    const primeiroDiaSemana = new Date(ano, mes, 1).getDay();
    const totalDiasMes = new Date(ano, mes + 1, 0).getDate();
    const valor = input.value;
    const hojeIso = new Date().toISOString().slice(0, 10);

    const celulas = [];
    for (let i = 0; i < primeiroDiaSemana; i += 1) {
      celulas.push('<span class="date-picker-dia date-picker-dia--vazio"></span>');
    }
    for (let dia = 1; dia <= totalDiasMes; dia += 1) {
      const iso = paraIso(ano, mes, dia);
      const classes = ['date-picker-dia'];
      if (iso === valor) classes.push('is-selecionado');
      if (iso === hojeIso) classes.push('is-hoje');
      const desabilitado = diaDesabilitado(iso);
      if (desabilitado) classes.push('is-desabilitado');
      celulas.push(
        `<button type="button" class="${classes.join(' ')}" data-iso="${iso}" ${desabilitado ? 'disabled' : ''}>${dia}</button>`,
      );
    }

    popup.innerHTML = `
      <div class="date-picker-cabecalho">
        <button type="button" class="date-picker-nav" data-nav="-1" aria-label="Mês anterior">
          <i class="fa-solid fa-chevron-left" aria-hidden="true"></i>
        </button>
        <div class="date-picker-selects">
          <select class="date-picker-select-mes" aria-label="Mês">
            ${MESES.map((m, i) => `<option value="${i}" ${i === mes ? 'selected' : ''}>${capitalizar(m)}</option>`).join('')}
          </select>
          <select class="date-picker-select-ano" aria-label="Ano">
            ${gerarOpcoesAno(ano)}
          </select>
        </div>
        <button type="button" class="date-picker-nav" data-nav="1" aria-label="Próximo mês">
          <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
        </button>
      </div>
      <div class="date-picker-semana">${DIAS_SEMANA.map((d) => `<span>${d}</span>`).join('')}</div>
      <div class="date-picker-grade">${celulas.join('')}</div>
      <div class="date-picker-rodape">
        <button type="button" class="btn-ghost" data-acao="limpar">Limpar</button>
        <button type="button" class="btn-ghost" data-acao="hoje">Hoje</button>
      </div>
    `;
  }

  function fechar() {
    popup.classList.remove('is-aberto');
    gatilho.classList.remove('is-aberto');
    document.removeEventListener('mousedown', aoClicarFora);
    document.removeEventListener('keydown', aoTeclarEscape);
    if (popupAbertoAtual === popup) {
      popupAbertoAtual = null;
      fecharPopupAtual = null;
    }
  }

  function aoClicarFora(evento) {
    if (!wrapper.contains(evento.target)) fechar();
  }

  function aoTeclarEscape(evento) {
    if (evento.key === 'Escape') {
      fechar();
      gatilho.focus();
    }
  }

  function selecionar(iso) {
    input.value = iso;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    fechar();
    gatilho.focus();
  }

  function abrir() {
    fecharQualquerPopupAberto();
    const base = input.value ? new Date(`${input.value}T00:00:00`) : new Date();
    visao = { ano: base.getFullYear(), mes: base.getMonth() };
    renderizarPopup();
    popup.classList.add('is-aberto');
    gatilho.classList.add('is-aberto');
    popupAbertoAtual = popup;
    fecharPopupAtual = fechar;
    document.addEventListener('mousedown', aoClicarFora);
    document.addEventListener('keydown', aoTeclarEscape);
  }

  popup.addEventListener('click', (evento) => {
    const botaoDia = evento.target.closest('button[data-iso]');
    if (botaoDia && !botaoDia.disabled) {
      selecionar(botaoDia.dataset.iso);
      return;
    }
    const nav = evento.target.closest('button[data-nav]');
    if (nav) {
      let { ano, mes } = visao;
      mes += Number(nav.dataset.nav);
      if (mes < 0) {
        mes = 11;
        ano -= 1;
      } else if (mes > 11) {
        mes = 0;
        ano += 1;
      }
      visao = { ano, mes };
      renderizarPopup();
      return;
    }
    const acao = evento.target.closest('button[data-acao]');
    if (acao?.dataset.acao === 'limpar') {
      input.value = '';
      input.dispatchEvent(new Event('change', { bubbles: true }));
      fechar();
    } else if (acao?.dataset.acao === 'hoje') {
      const hoje = new Date().toISOString().slice(0, 10);
      if (!diaDesabilitado(hoje)) selecionar(hoje);
    }
  });

  popup.addEventListener('change', (evento) => {
    if (evento.target.classList.contains('date-picker-select-mes')) {
      visao = { ano: visao.ano, mes: Number(evento.target.value) };
      renderizarPopup();
    } else if (evento.target.classList.contains('date-picker-select-ano')) {
      visao = { ano: Number(evento.target.value), mes: visao.mes };
      renderizarPopup();
    }
  });

  gatilho.addEventListener('click', () => {
    if (popup.classList.contains('is-aberto')) fechar();
    else abrir();
  });

  // Máscara dd/mm/aaaa: só dígitos são mantidos, as barras são inseridas
  // automaticamente a cada 2/4 dígitos. Só tenta interpretar como data (e
  // gravar no input nativo) quando os 8 dígitos estiverem completos — evita
  // marcar erro a cada tecla, só quando a data já deveria estar pronta.
  campoTexto.addEventListener('input', () => {
    const digitos = campoTexto.value.replace(/\D/g, '').slice(0, 8);
    const dia = digitos.slice(0, 2);
    const mes = digitos.slice(2, 4);
    const ano = digitos.slice(4, 8);
    campoTexto.value = [dia, mes, ano].filter(Boolean).join('/');
    limparErro();

    if (digitos.length === 0) {
      input.value = '';
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (digitos.length === 8) {
      const iso = validarDataDigitada(Number(dia), Number(mes), Number(ano));
      if (!iso) {
        marcarErro('Data inválida.');
      } else if (diaDesabilitado(iso)) {
        marcarErro('Data fora do intervalo permitido.');
      } else {
        input.value = iso;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  });

  campoTexto.addEventListener('blur', () => {
    const digitos = campoTexto.value.replace(/\D/g, '');
    if (digitos.length > 0 && digitos.length < 8) marcarErro('Data incompleta.');
  });

  input.addEventListener('change', sincronizarCampoTexto);

  wrapper.appendChild(campo);
  wrapper.appendChild(erroEl);
  wrapper.appendChild(popup);
  sincronizarCampoTexto();
}
