// Página inicial do Broquel: copiar o SHA-256 e animar a entrada das seções. Nada sai da página.
(function () {
  'use strict';
  var raiz = document.documentElement;

  document.addEventListener('click', function (evento) {
    var botao = evento.target.closest('[data-copiar]');
    if (!botao) return;
    var alvo = document.getElementById(botao.getAttribute('data-copiar'));
    if (!alvo || !navigator.clipboard) return;
    navigator.clipboard.writeText(alvo.textContent.trim()).then(function () {
      var texto = botao.textContent;
      botao.textContent = 'Copiado';
      botao.classList.add('ok');
      setTimeout(function () {
        botao.textContent = texto;
        botao.classList.remove('ok');
      }, 1800);
    });
  });

  if (!('IntersectionObserver' in window)) return;
  raiz.classList.add('js');
  var observador = new IntersectionObserver(function (entradas) {
    entradas.forEach(function (entrada) {
      if (entrada.isIntersecting) {
        entrada.target.classList.add('visivel');
        observador.unobserve(entrada.target);
      }
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  document.querySelectorAll('.revelar').forEach(function (el) { observador.observe(el); });
})();
