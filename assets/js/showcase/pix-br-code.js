// Pix estático (BR Code / EMV MPM) gerado no navegador — RN-PIX-02.
//
// O back-end usa a biblioteca `pix-utils` para montar o payload e o PNG do
// QR. Aqui o payload é montado à mão, campo a campo, seguindo o padrão do
// Bacen (cada campo é ID + tamanho com 2 dígitos + valor, e o final é um
// CRC16-CCITT), e a imagem é desenhada pela biblioteca `qrcode-generator`,
// carregada do CDN só na primeira vez que alguém gera um Pix.

const URL_BIBLIOTECA_QR = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';

function campo(id, valor) {
  return `${id}${String(valor.length).padStart(2, '0')}${valor}`;
}

/** CRC16-CCITT (polinômio 0x1021, valor inicial 0xFFFF) — exigido no campo 63. */
function crc16(texto) {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(texto)) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Valor em centavos (RN-CTR-02) convertido para reais decimais só aqui, na
 * borda — o campo 54 do BR Code é `12.34`, não `1234`.
 */
export function montarBrCode({ chavePix, nomeRecebedor, cidadeRecebedor, valorCentavos }) {
  const contaDoRecebedor = campo('00', 'br.gov.bcb.pix') + campo('01', chavePix);
  const semCrc =
    campo('00', '01') +
    campo('26', contaDoRecebedor) +
    campo('52', '0000') +
    campo('53', '986') +
    campo('54', (valorCentavos / 100).toFixed(2)) +
    campo('58', 'BR') +
    campo('59', nomeRecebedor) +
    campo('60', cidadeRecebedor) +
    campo('62', campo('05', '***')) +
    '6304';
  return `${semCrc}${crc16(semCrc)}`;
}

let carregamentoBiblioteca = null;

function carregarBibliotecaQr() {
  if (window.qrcode) return Promise.resolve(window.qrcode);
  carregamentoBiblioteca ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = URL_BIBLIOTECA_QR;
    script.onload = () => resolve(window.qrcode);
    script.onerror = () => {
      carregamentoBiblioteca = null;
      reject(new Error('Biblioteca de QR indisponível.'));
    };
    document.head.appendChild(script);
  });
  return carregamentoBiblioteca;
}

/** Imagem de reserva: sem internet para o CDN, o copia-e-cola continua valendo. */
function imagemIndisponivel() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">
    <rect width="240" height="240" rx="16" fill="#f1f5f9"/>
    <text x="120" y="112" font-family="sans-serif" font-size="14" text-anchor="middle" fill="#475569">QR indisponível offline</text>
    <text x="120" y="134" font-family="sans-serif" font-size="12" text-anchor="middle" fill="#64748b">use o Pix copia e cola</text>
  </svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

/** Data URI pronto para `<img src>`, mesmo contrato do `imagemBase64` da API. */
export async function desenharQrCode(texto) {
  try {
    const qrcode = await carregarBibliotecaQr();
    const qr = qrcode(0, 'M');
    qr.addData(texto);
    qr.make();
    return qr.createDataURL(6, 4);
  } catch {
    return imagemIndisponivel();
  }
}
