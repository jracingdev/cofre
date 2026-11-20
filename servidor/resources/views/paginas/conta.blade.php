@extends('paginas.base')
@section('titulo', 'Minha conta')
@section('conteudo')
  <h1>Minha conta</h1>
  <p class="mudo">A conta cuida do plano, da cobrança e da exclusão. Ela não abre o cofre: suas senhas continuam protegidas pela senha mestra, que o Broquel não conhece.</p>

  <div id="mensagem" role="status" aria-live="polite"></div>

  <section id="pedir" class="painel" hidden>
    <h2>Entrar ou criar conta</h2>
    <p>Informe seu e-mail. Mandamos um link de acesso que vale por 30 minutos.</p>
    <label class="campo"><span>E-mail</span><input id="email" type="email" autocomplete="email" required></label>
    <button id="enviar" class="botao botao-principal" type="button">Enviar link</button>
  </section>

  <section id="confirmar" class="painel" hidden>
    <h2>Confirmar acesso</h2>
    <label class="marcar"><input id="aceito" type="checkbox"> <span>Li e aceito os <a href="/termos" target="_blank">Termos de uso</a> e a <a href="/privacidade" target="_blank">Política de privacidade</a> (versão {{ $versao }}).</span></label>
    <button id="continuar" class="botao botao-principal" type="button">Continuar</button>
  </section>

  <section id="painel" hidden>
    <div class="painel">
      <h2>Conta</h2>
      <p>E-mail: <strong id="contaEmail"></strong></p>
      <button id="sair" class="botao botao-vidro" type="button">Sair da conta</button>
    </div>
    <div class="painel">
      <h2>Cofres</h2>
      <p id="semCofres" class="mudo" hidden>Nenhum cofre ligado ainda. O cofre é ligado à conta de dentro do app ou da web, com o cofre aberto.</p>
      <ul id="cofres" class="cofres"></ul>
    </div>
    <div class="painel perigo">
      <h2>Excluir conta</h2>
      <p id="exclusaoTexto">Apaga a conta e todos os cofres ligados a ela, com todos os itens. Você tem 7 dias para desistir. Depois disso não há como recuperar.</p>
      <div id="excluirForm">
        <label class="campo"><span>Digite EXCLUIR para confirmar</span><input id="confirmacao" type="text" autocomplete="off"></label>
        <button id="excluir" class="botao botao-perigo" type="button">Excluir conta</button>
      </div>
      <button id="manter" class="botao botao-principal" type="button" hidden>Desistir da exclusão</button>
    </div>
  </section>
@endsection
