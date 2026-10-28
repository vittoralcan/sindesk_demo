// Substitui visualmente um <input type="month"> nativo por um campo com
// máscara mm/aaaa + uma grade de meses do ano corrente, no mesmo padrão de
// custom-date-picker.js — o <input type="month"> nativo é quem, no Chrome e
// no Firefox, tem o comportamento "os dígitos digitados avançam de segmento
// sozinhos" citado no Bug #11 do relatório de QA de 2026-09-21 ("dígitos
// digitados rápido pulam meses em vez de formar o ano"). Também é o
// agravante mais provável do Bug #12 (valor divergente entre Espelho e
// Gerar Pix pra mesma empresa): mais fácil de selecionar sem querer um mês
// diferente do pretendido com um input confuso do que com um explícito.
//
// O <input> original continua no DOM (só escondido visualmente) e guarda o
// valor de verdade ("YYYY-MM"); `name`/`min`/`max`/`required` continuam
// funcionando sem alteração — `id` é movido pro campo de texto visível.
//
// Uso: chame depois que o <input> já existe no DOM:
//   inicializarMesAnoCustomizado(document.getElementById('input-competencia-pix'))
// Se algum código setar `input.value` programaticamente depois de
// inicializado, precisa disparar 'change' manualmente pro campo visível se
// atualizar — mesmo contrato de custom-date-picker.js.

const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

let popupAbertoAtual = null;
let fecharPopupAtual = null;

function fecharQualquerPopupAberto() {
  if (fecharPopupAtual) fecharPopupAtual();
}

function paraIso(ano, mes) {
  return `${ano}-${String(mes + 1).padStart(2, '0')}`;
}

function formatarExibicao(iso) {
  const [ano, mes] = iso.split('-');
  return `${mes}/${ano}`;
}

/** "mm/aaaa" digitado → "YYYY-MM", ou null se o mês não existe (13 a 99). */
function validarMesDigitado(mes, ano) {
  if (!ano || mes < 1 || mes > 12) return null;
  return paraIso(ano, mes - 1);
}

/** @param {HTMLInputElement} input */
export function inicializarMesAnoCustomizado(input) {
  if (!input || input.dataset.customizado === 'true') return;
  input.dataset.customizado = 'true';

  const idOriginal = input.id;
  if (idOriginal) input.id = `${idOriginal}__nativo`;

  const wrapper = document.createElement('div');
  wrapper.className = 'date-picker-customizado month-picker-customizado';
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
  campoTexto.placeholder = 'mm/aaaa';
  campoTexto.maxLength = 7;
  if (idOriginal) campoTexto.id = idOriginal;
  if (input.getAttribute('aria-label')) campoTexto.setAttribute('aria-label', input.getAttribute('aria-label'));
  if (input.required) campoTexto.setAttribute('aria-required', 'true');

  const gatilho = document.createElement('button');
  gatilho.type = 'button';
  gatilho.className = 'date-picker-customizado-gatilho';
  gatilho.setAttribute('aria-label', 'Abrir seleção de mês');
  gatilho.innerHTML = `<i class="fa-solid fa-calendar-days" aria-hidden="true"></i>`;

  campo.appendChild(campoTexto);
  campo.appendChild(gatilho);

  const erroEl = document.createElement('span');
  erroEl.className = 'date-picker-customizado-erro';
  erroEl.setAttribute('aria-live', 'polite');

  const popup = document.createElement('div');
  popup.className = 'date-picker-customizado-popup month-picker-customizado-popup';

  let anoVisao = null;

  function limitesPermitidos() {
    return { min: input.min || null, max: input.max || null };
  }

  function mesDesabilitado(iso) {
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

  function renderizarPopup() {
    const valor = input.value;
    const celulas = MESES_ABREV.map((rotulo, mes) => {
      const iso = paraIso(anoVisao, mes);
      const classes = ['month-picker-mes'];
      if (iso === valor) classes.push('is-selecionado');
      const desabilitado = mesDesabilitado(iso);
      if (desabilitado) classes.push('is-desabilitado');
      return `<button type="button" class="${classes.join(' ')}" data-iso="${iso}" ${desabilitado ? 'disabled' : ''}>${rotulo}</button>`;
    }).join('');

    popup.innerHTML = `
      <div class="date-picker-cabecalho">
        <button type="button" class="date-picker-nav" data-nav="-1" aria-label="Ano anterior">
          <i class="fa-solid fa-chevron-left" aria-hidden="true"></i>
        </button>
        <span class="month-picker-ano">${anoVisao}</span>
        <button type="button" class="date-picker-nav" data-nav="1" aria-label="Próximo ano">
          <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
        </button>
      </div>
      <div class="month-picker-grade">${celulas}</div>
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
    const base = input.value ? new Date(`${input.value}-01T00:00:00`) : new Date();
    anoVisao = base.getFullYear();
    renderizarPopup();
    popup.classList.add('is-aberto');
    gatilho.classList.add('is-aberto');
    popupAbertoAtual = popup;
    fecharPopupAtual = fechar;
    document.addEventListener('mousedown', aoClicarFora);
    document.addEventListener('keydown', aoTeclarEscape);
  }

  popup.addEventListener('click', (evento) => {
    const botaoMes = evento.target.closest('button[data-iso]');
    if (botaoMes && !botaoMes.disabled) {
      selecionar(botaoMes.dataset.iso);
      return;
    }
    const nav = evento.target.closest('button[data-nav]');
    if (nav) {
      anoVisao += Number(nav.dataset.nav);
      renderizarPopup();
    }
  });

  gatilho.addEventListener('click', () => {
    if (popup.classList.contains('is-aberto')) fechar();
    else abrir();
  });

  // Máscara mm/aaaa: só dígitos são mantidos, a barra é inserida
  // automaticamente após o mês. Só tenta interpretar como competência (e
  // gravar no input nativo) quando os 6 dígitos estiverem completos.
  campoTexto.addEventListener('input', () => {
    const digitos = campoTexto.value.replace(/\D/g, '').slice(0, 6);
    const mes = digitos.slice(0, 2);
    const ano = digitos.slice(2, 6);
    campoTexto.value = [mes, ano].filter(Boolean).join('/');
    limparErro();

    if (digitos.length === 0) {
      input.value = '';
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (digitos.length === 6) {
      const iso = validarMesDigitado(Number(mes), Number(ano));
      if (!iso) {
        marcarErro('Mês inválido.');
      } else if (mesDesabilitado(iso)) {
        marcarErro('Competência fora do intervalo permitido.');
      } else {
        input.value = iso;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  });

  campoTexto.addEventListener('blur', () => {
    const digitos = campoTexto.value.replace(/\D/g, '');
    if (digitos.length > 0 && digitos.length < 6) marcarErro('Competência incompleta.');
  });

  input.addEventListener('change', sincronizarCampoTexto);

  wrapper.appendChild(campo);
  wrapper.appendChild(erroEl);
  wrapper.appendChild(popup);
  sincronizarCampoTexto();
}
