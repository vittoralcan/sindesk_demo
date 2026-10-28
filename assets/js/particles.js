// Canvas de partículas conectadas, extraído de um modelo de design, para reuso em
// qualquer página que tenha <canvas id="particles-canvas">. A cor acompanha
// o tema atual via a variável CSS --particle-color, relida a cada troca de
// tema (evento 'sindesk:tema-alterado', disparado por theme.js).

/**
 * @param {string} canvasId
 * @param {{ quantidade?: number, distanciaConexao?: number }} [opcoes]
 */
export function iniciarParticulas(canvasId, opcoes = {}) {
  const canvas = document.getElementById(canvasId);
  if (!(canvas instanceof HTMLCanvasElement)) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const quantidade = opcoes.quantidade ?? 70;
  const distanciaConexao = opcoes.distanciaConexao ?? 120;

  let largura = 0;
  let altura = 0;
  /** @type {{x: number, y: number, vx: number, vy: number, raio: number}[]} */
  let particulas = [];
  let corParticula = corAtual();

  function corAtual() {
    return getComputedStyle(document.documentElement).getPropertyValue('--particle-color').trim() || 'rgba(239, 68, 68, 0.4)';
  }

  function redimensionar() {
    largura = canvas.width = window.innerWidth;
    altura = canvas.height = window.innerHeight;
  }

  function criarParticulas() {
    particulas = Array.from({ length: quantidade }, () => ({
      x: Math.random() * largura,
      y: Math.random() * altura,
      vx: (Math.random() - 0.5) * 0.6,
      vy: (Math.random() - 0.5) * 0.6,
      raio: Math.random() * 1.5 + 1,
    }));
  }

  function animar() {
    ctx.clearRect(0, 0, largura, altura);

    for (let i = 0; i < particulas.length; i += 1) {
      const p = particulas[i];
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0 || p.x > largura) p.vx *= -1;
      if (p.y < 0 || p.y > altura) p.vy *= -1;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.raio, 0, Math.PI * 2);
      ctx.fillStyle = corParticula;
      ctx.fill();

      for (let j = i + 1; j < particulas.length; j += 1) {
        const outro = particulas[j];
        const dx = p.x - outro.x;
        const dy = p.y - outro.y;
        const distancia = Math.sqrt(dx * dx + dy * dy);
        if (distancia < distanciaConexao) {
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(outro.x, outro.y);
          ctx.strokeStyle = corParticula;
          ctx.globalAlpha = 1 - distancia / distanciaConexao;
          ctx.lineWidth = 0.5;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
    }

    requestAnimationFrame(animar);
  }

  window.addEventListener('resize', redimensionar);
  document.addEventListener('sindesk:tema-alterado', () => {
    corParticula = corAtual();
  });

  redimensionar();
  criarParticulas();
  animar();
}
