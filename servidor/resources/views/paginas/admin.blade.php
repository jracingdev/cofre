@extends('paginas.base')
@section('titulo', 'Admin')
@section('conteudo')
  <h1>Admin do Broquel</h1>
  <p class="mudo">Planos, convites e uso. O painel não vê conteúdo de cofre: só contagens e bytes cifrados.</p>

  <div id="mensagem" role="status" aria-live="polite"></div>

  <section id="fora" class="painel" hidden>
    <h2>Entrar</h2>
    <p>No servidor, dentro de <code>servidor/</code>, rode <code>php artisan broquel:admin</code> e abra o link que aparecer. Ele vale 10 minutos e uma vez só.</p>
  </section>

  <section id="painel" hidden>
    <div class="painel">
      <h2>Resumo</h2>
      <p id="resumo"></p>
      <button id="atualizar" class="botao botao-vidro" type="button">Atualizar</button>
      <button id="sair" class="botao botao-vidro" type="button">Sair</button>
    </div>

    <div class="painel">
      <h2>Novo convite</h2>
      <label class="campo"><span>Plano</span><select id="convPlano"></select></label>
      <label class="campo"><span>Usos</span><input id="convUsos" type="number" min="1" max="1000" value="1"></label>
      <label class="campo"><span>Validade em dias (0 = sem validade)</span><input id="convDias" type="number" min="0" max="365" value="30"></label>
      <label class="campo"><span>Observação (para quem é)</span><input id="convObs" type="text" maxlength="80"></label>
      <button id="criarConvite" class="botao botao-principal" type="button">Gerar convite</button>
      <p id="codigoNovo" class="aviso" hidden></p>
    </div>

    <div class="painel">
      <h2>Convites</h2>
      <div class="rolar"><table class="tabela"><thead><tr><th>Plano</th><th>Usos</th><th>Vence</th><th>Observação</th><th></th></tr></thead><tbody id="convites"></tbody></table></div>
    </div>

    <div class="painel">
      <h2>Cofres</h2>
      <div class="rolar"><table class="tabela"><thead><tr><th>Cofre</th><th>Conta</th><th>Plano</th><th>Uso</th><th>Validade</th><th>Ações</th></tr></thead><tbody id="cofres"></tbody></table></div>
    </div>
  </section>
@endsection
