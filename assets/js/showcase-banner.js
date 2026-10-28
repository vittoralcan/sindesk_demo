// Só existe no showcase — selo flutuante que deixa óbvio que os dados são
// fictícios e oferece "Restaurar dados", que descarta tudo o que o visitante
// criou/alterou e volta à base original. A sessão (token) é mantida, então
// quem está logado continua logado.
import { restaurarBanco } from './showcase/banco-ficticio.js';

const selo = document.createElement('div');
selo.className = 'showcase-selo';
selo.setAttribute('role', 'note');
selo.innerHTML = `
  <span class="showcase-selo-rotulo">
    Showcase
    <span class="showcase-selo-detalhe">— dados fictícios, sem servidor</span>
  </span>
  <button type="button">Restaurar dados</button>
`;

selo.querySelector('button').addEventListener('click', () => {
  restaurarBanco();
  window.location.reload();
});

document.body.appendChild(selo);
