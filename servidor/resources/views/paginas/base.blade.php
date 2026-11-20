<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>@yield('titulo') · Broquel</title>
  <meta name="theme-color" content="#071018">
  <meta name="color-scheme" content="dark">
  <link rel="icon" href="/site/escudo.svg" type="image/svg+xml">
  <link rel="stylesheet" href="{{ $css['url'] }}" integrity="{{ $css['integridade'] }}">
  <link rel="stylesheet" href="{{ $cssConta['url'] }}" integrity="{{ $cssConta['integridade'] }}">
  @if ($js)
    <script src="{{ $js['url'] }}" integrity="{{ $js['integridade'] }}" defer></script>
  @endif
</head>
<body>
  <header class="topo">
    <nav class="nav largura" aria-label="Principal">
      <a class="marca" href="/" aria-label="Broquel, início">
        <img src="/site/escudo-liso.svg" alt="" width="28" height="28">
        <span>Broquel</span>
      </a>
      <a class="botao botao-pequeno" href="/app/">Abrir cofre web</a>
    </nav>
  </header>
  <main id="conteudo" class="pagina largura">
    @yield('conteudo')
  </main>
  <footer class="rodape">
    <div class="largura rodape-grade">
      <p>Desenvolvido por <a href="https://jracing.dev.br" rel="noopener">jracing.dev.br</a></p>
      <p class="mudo"><a href="/termos">Termos de uso</a> · <a href="/privacidade">Privacidade</a> · <a href="/conta">Minha conta</a></p>
    </div>
  </footer>
</body>
</html>
