<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Broquel · cofre de senhas de conhecimento zero</title>
  <meta name="description" content="Broquel guarda suas senhas cifradas no seu aparelho. O servidor só vê bytes embaralhados. Android, navegador e extensão, com código aberto.">
  <meta name="theme-color" content="#071018">
  <meta name="color-scheme" content="dark">
  <meta property="og:title" content="Broquel · suas senhas, só suas">
  <meta property="og:description" content="Cofre de senhas de conhecimento zero para Android e navegador.">
  <meta property="og:image" content="/site/icone-512.png">
  <link rel="icon" href="/app/favicon.ico" sizes="any">
  <link rel="icon" href="/site/escudo.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/app/apple-touch-icon.png">
  <link rel="stylesheet" href="{{ $css['url'] }}" integrity="{{ $css['integridade'] }}">
  <script src="{{ $js['url'] }}" integrity="{{ $js['integridade'] }}" defer></script>
</head>
<body>
  <a class="pular" href="#conteudo">Pular para o conteúdo</a>

  <header class="topo">
    <nav class="nav largura" aria-label="Principal">
      <a class="marca" href="/" aria-label="Broquel, início">
        <img src="/site/escudo-liso.svg" alt="" width="28" height="28">
        <span>Broquel</span>
      </a>
      <ul class="nav-links">
        <li><a href="#seguranca">Segurança</a></li>
        <li><a href="#recursos">Recursos</a></li>
        <li><a href="#downloads">Downloads</a></li>
        <li><a href="#perguntas">Perguntas</a></li>
      </ul>
      <a class="botao botao-pequeno" href="/app/">Abrir cofre web</a>
    </nav>
  </header>

  <main id="conteudo">
    <section class="heroi">
      <div class="heroi-fundo" aria-hidden="true">
        <span class="orbe orbe-1"></span>
        <span class="orbe orbe-2"></span>
        <span class="grade"></span>
      </div>
      <div class="largura heroi-grade">
        <div class="heroi-texto">
          <p class="selo"><span class="ponto" aria-hidden="true"></span> Conhecimento zero · código aberto</p>
          <h1>Suas senhas.<br><span class="destaque">Só suas.</span></h1>
          <p class="lead">
            O Broquel cifra tudo no seu aparelho antes de qualquer byte sair dele.
            Quem administra o servidor, ou quem roubar o banco, só encontra ruído.
          </p>
          <div class="acoes">
            <a class="botao botao-principal" href="#downloads">
              <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20"><path d="M12 3v12m0 0-5-5m5 5 5-5M4 19h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
              Baixar o Broquel
            </a>
            <a class="botao botao-vidro" href="/app/">Usar no navegador</a>
          </div>
          <ul class="chips" aria-label="Tecnologia">
            <li>Argon2id 256 MiB</li>
            <li>XChaCha20-Poly1305</li>
            <li>Ed25519</li>
            <li>libsodium</li>
          </ul>
        </div>

        <div class="heroi-visual" aria-hidden="true">
          <div class="anel anel-1"></div>
          <div class="anel anel-2"></div>
          <div class="anel anel-3"></div>
          <img class="escudo" src="/site/escudo-liso.svg" alt="" width="260" height="260">
          <div class="cartao-flutuante cf-1">
            <span class="cf-rotulo">No seu aparelho</span>
            <span class="cf-valor">banco.com.br · ••••••••</span>
          </div>
          <div class="cartao-flutuante cf-2">
            <span class="cf-rotulo">No servidor</span>
            <span class="cf-valor mono">9f3a·e71c·04bd·…</span>
          </div>
        </div>
      </div>
    </section>

    <section class="faixa">
      <div class="largura faixa-grade">
        <div><strong>0</strong><span>senhas legíveis no servidor</span></div>
        <div><strong>256 MiB</strong><span>de memória por tentativa de adivinhar</span></div>
        <div><strong>3</strong><span>jeitos de usar: Android, web e extensão</span></div>
        <div><strong>100%</strong><span>do código no GitHub</span></div>
      </div>
    </section>

    <section id="seguranca" class="secao">
      <div class="largura">
        <header class="cabeca-secao revelar">
          <p class="sobretitulo">Como a cifra protege você</p>
          <h2>O servidor guarda. Não lê.</h2>
          <p>A senha mestra vira chave dentro do seu aparelho. O que viaja pela rede já está trancado.</p>
        </header>

        <ol class="fluxo revelar">
          <li>
            <span class="passo">1</span>
            <h3>Senha mestra</h3>
            <p>Você digita. Ela nunca é enviada nem gravada.</p>
          </li>
          <li>
            <span class="passo">2</span>
            <h3>Argon2id</h3>
            <p>4 voltas e 256 MiB de memória transformam a senha numa chave. Adivinhar fica caro.</p>
          </li>
          <li>
            <span class="passo">3</span>
            <h3>XChaCha20-Poly1305</h3>
            <p>Cada item é cifrado com nonce novo. Mudou um byte, a abertura falha.</p>
          </li>
          <li>
            <span class="passo">4</span>
            <h3>Sincronização</h3>
            <p>O servidor recebe só o texto cifrado e uma assinatura Ed25519 para o login.</p>
          </li>
        </ol>

        <div class="comparacao revelar">
          <div class="coluna coluna-sai">
            <h3>O que sai do aparelho</h3>
            <ul>
              <li>Cabeçalho do cofre com sal e chaves embrulhadas</li>
              <li>Itens cifrados, preenchidos em blocos de 1 KiB</li>
              <li>A assinatura de um desafio de uso único</li>
            </ul>
          </div>
          <div class="coluna coluna-fica">
            <h3>O que nunca sai</h3>
            <ul>
              <li>Senha mestra e chave do cofre</li>
              <li>Kit de recuperação</li>
              <li>Títulos, usuários, senhas e notas</li>
              <li>A senha nova do gerador, até virar item cifrado</li>
            </ul>
          </div>
        </div>
      </div>
    </section>

    <section id="recursos" class="secao secao-alt">
      <div class="largura">
        <header class="cabeca-secao revelar">
          <p class="sobretitulo">Feito para o dia a dia</p>
          <h2>Seguro sem dar trabalho</h2>
        </header>
        <div class="recursos">
          <article class="recurso revelar">
            <span class="icone" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h10M4 17h7"/><circle cx="18" cy="16" r="3"/></svg></span>
            <h3>Gerador nível Militar</h3>
            <p>Quatro níveis, de Básico a Militar, e de 12 a 128 caracteres. Sorteio sem viés, igual no Android e na web.</p>
          </article>
          <article class="recurso revelar">
            <span class="icone" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10 18h4"/></svg></span>
            <h3>Preenchimento automático</h3>
            <p>No Android, oferece a senha só no site ou app certo. Entrou com uma senha nova? Ele pergunta se quer guardar.</p>
          </article>
          <article class="recurso revelar">
            <span class="icone" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3a7 7 0 0 0-7 7v3M19 10a7 7 0 0 0-3-5.7M8 21a11 11 0 0 1-1-5v-5a5 5 0 0 1 10 0v1M12 11v5a7 7 0 0 0 2 5M17 16a12 12 0 0 1-.5 3"/></svg></span>
            <h3>Biometria opcional</h3>
            <p>Chave guardada no Keystore do Android, com StrongBox quando houver. A senha mestra volta a cada 7 dias.</p>
          </article>
          <article class="recurso revelar">
            <span class="icone" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-8 8M10 20H4v-6M4 20l8-8"/></svg></span>
            <h3>Android e navegador juntos</h3>
            <p>O que você cria no celular aparece no site depois de sincronizar, e o contrário também.</p>
          </article>
          <article class="recurso revelar">
            <span class="icone" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M9 3h6v4h4v6h-4v4H9v-4H5V7h4z"/></svg></span>
            <h3>Extensão de navegador</h3>
            <p>Preenche logins no Chrome, Edge, Brave e Firefox com a mesma biblioteca de cifra do cofre web.</p>
          </article>
          <article class="recurso revelar">
            <span class="icone" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M7 7V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2M12 12v3"/></svg></span>
            <h3>Kit de recuperação</h3>
            <p>Esqueceu a senha mestra? O kit, anotado fora do aparelho, abre o cofre. Ele nunca vai ao servidor.</p>
          </article>
          <article class="recurso revelar">
            <span class="icone" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></span>
            <h3>Trava sozinho</h3>
            <p>Em segundo plano ou parado por um tempo, o cofre fecha. A chave some da memória.</p>
          </article>
          <article class="recurso revelar">
            <span class="icone" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/></svg></span>
            <h3>Segundo fator e FIDO2</h3>
            <p>Login no servidor por desafio assinado, com TOTP e chave de segurança física como reforço.</p>
          </article>
        </div>
      </div>
    </section>

    <section id="downloads" class="secao">
      <div class="largura">
        <header class="cabeca-secao revelar">
          <p class="sobretitulo">Downloads</p>
          <h2>Leve o Broquel com você</h2>
          <p>Baixe direto daqui. Confira o SHA-256 antes de instalar: se não bater, não instale.</p>
        </header>

        <div class="downloads">
          <article class="download download-web revelar">
            <div class="download-topo">
              <span class="plataforma plataforma-web" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18"/></svg></span>
              <div>
                <h3>Cofre web</h3>
                <p class="meta">Sem instalar nada</p>
              </div>
            </div>
            <p>Abra no navegador do computador. A cifra roda na própria página, com política de conteúdo fechada e integridade dos scripts.</p>
            <a class="botao botao-principal botao-bloco" href="/app/">Abrir o cofre web</a>
          </article>

          @foreach ($downloads as $d)
            <article class="download revelar" id="baixar-{{ $d['plataforma'] }}">
              <div class="download-topo">
                <span class="plataforma plataforma-{{ $d['plataforma'] }}" aria-hidden="true">
                  @if ($d['plataforma'] === 'android')
                    <svg viewBox="0 0 24 24"><path d="M7 10h10v8a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1zM4 11v5M20 11v5M9 19v2M15 19v2M7 9a5 5 0 0 1 10 0zM9 4 8 2.5M15 4l1-1.5"/></svg>
                  @elseif ($d['plataforma'] === 'chrome')
                    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/><path d="M12 8.5h8.2M9 13.7 4.9 6.6M15 13.7l-4 7.2"/></svg>
                  @else
                    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M8 7c1-1.5 3-2 4.5-1.5C11 6 10 7.5 10.5 9c2-.8 5 .2 5.5 3 .4 2.6-1.7 5-4.5 5-3 0-5-2.3-5-5"/></svg>
                  @endif
                </span>
                <div>
                  <h3>{{ $d['titulo'] }}</h3>
                  <p class="meta">
                    @if ($d['disponivel'])
                      {{ $d['versao'] ? 'Versão '.$d['versao'].' · ' : '' }}{{ $d['tamanho'] }}
                    @else
                      Em breve
                    @endif
                  </p>
                </div>
              </div>
              <p>{{ $d['descricao'] }}</p>
              @if ($d['disponivel'])
                <a class="botao botao-principal botao-bloco" href="{{ $d['url'] }}" download>
                  <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18"><path d="M12 3v12m0 0-5-5m5 5 5-5M4 19h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  Baixar {{ $d['arquivo'] }}
                </a>
                <div class="hash">
                  <span class="hash-rotulo">SHA-256</span>
                  <code class="hash-valor" id="hash-{{ $loop->index }}">{{ $d['sha256'] }}</code>
                  <button class="copiar" type="button" data-copiar="hash-{{ $loop->index }}" aria-label="Copiar SHA-256 de {{ $d['arquivo'] }}">Copiar</button>
                </div>
              @else
                <span class="botao botao-desligado botao-bloco" aria-disabled="true">Ainda não publicado</span>
              @endif
            </article>
          @endforeach
        </div>

        <div class="instrucoes">
          <details class="revelar">
            <summary>Como conferir o SHA-256</summary>
            <p>No Windows (PowerShell):</p>
            <pre><code>Get-FileHash .\broquel.apk -Algorithm SHA256</code></pre>
            <p>No Linux ou macOS:</p>
            <pre><code>sha256sum broquel.apk</code></pre>
            <p>O resultado precisa ser igual ao código mostrado no cartão. O mesmo valor aparece no resumo do CI no GitHub, então dá para comparar com uma fonte que não é este servidor.</p>
          </details>
          <details class="revelar">
            <summary>Instalar no Android</summary>
            <ol>
              <li>Baixe o <code>broquel.apk</code> pelo celular.</li>
              <li>Abra o arquivo e permita a instalação por esta fonte quando o Android pedir.</li>
              <li>As próximas versões instalam por cima, sem perder o cofre, porque a assinatura é sempre a mesma.</li>
            </ol>
          </details>
          <details class="revelar">
            <summary>Instalar a extensão</summary>
            <p><strong>Chrome, Edge e Brave:</strong> descompacte o zip, abra <code>chrome://extensions</code>, ligue o modo do desenvolvedor e use “Carregar sem compactação” apontando para a pasta.</p>
            <p><strong>Firefox:</strong> abra <code>about:debugging#/runtime/this-firefox</code> e use “Carregar extensão temporária” com o zip.</p>
          </details>
        </div>
      </div>
    </section>

    <section class="secao secao-alt">
      <div class="largura aberto revelar">
        <div>
          <p class="sobretitulo">Código aberto</p>
          <h2>Não confie. Confira.</h2>
          <p>Todo o Broquel está no GitHub: a criptografia, o app, o site e o servidor. O hash de cada arquivo do cofre web fica publicado no repositório, e um script compara com o que este servidor entrega.</p>
          <pre><code>scripts/conferir-web.sh https://broquel.jracing.dev.br</code></pre>
        </div>
        <a class="botao botao-vidro" href="https://github.com/jracingdev/cofre" rel="noopener">Ver o código no GitHub</a>
      </div>
    </section>

    <section id="perguntas" class="secao">
      <div class="largura estreita">
        <header class="cabeca-secao revelar">
          <p class="sobretitulo">Perguntas</p>
          <h2>Antes de começar</h2>
        </header>
        <div class="perguntas">
          <details class="revelar">
            <summary>E se eu esquecer a senha mestra?</summary>
            <p>Use o kit de recuperação que o Broquel mostra na criação do cofre. Sem a senha e sem o kit, ninguém abre o cofre, nem nós. É o preço de o servidor não conseguir ler nada.</p>
          </details>
          <details class="revelar">
            <summary>O que acontece se o servidor for invadido?</summary>
            <p>O invasor leva só cabeçalhos e itens cifrados. Para cada palpite de senha ele paga um Argon2id com 256 MiB. Uma senha mestra forte torna isso inviável.</p>
          </details>
          <details class="revelar">
            <summary>Funciona sem internet?</summary>
            <p>Sim. O app Android guarda uma cópia cifrada local e sincroniza quando a rede volta.</p>
          </details>
          <details class="revelar">
            <summary>Por que o APK não está na Play Store?</summary>
            <p>Por enquanto a distribuição é direta, por esta página. O APK é assinado sempre com a mesma chave, então as atualizações instalam por cima.</p>
          </details>
          <details class="revelar">
            <summary>Posso usar no computador e no celular?</summary>
            <p>Pode. Cole no site o identificador de 32 caracteres que aparece nos ajustes do app e use a mesma senha mestra.</p>
          </details>
        </div>
      </div>
    </section>

    <section class="chamada">
      <div class="largura chamada-caixa revelar">
        <img src="/site/escudo-liso.svg" alt="" width="64" height="64">
        <h2>Tranque o que é seu.</h2>
        <div class="acoes">
          <a class="botao botao-principal" href="#downloads">Baixar agora</a>
          <a class="botao botao-vidro" href="/app/">Abrir cofre web</a>
        </div>
      </div>
    </section>
  </main>

  <footer class="rodape">
    <div class="largura rodape-grade">
      <a class="marca" href="/">
        <img src="/site/escudo-liso.svg" alt="" width="24" height="24">
        <span>Broquel</span>
      </a>
      <p>Desenvolvido por <a href="https://jracing.dev.br" rel="noopener">jracing.dev.br</a></p>
      <p class="mudo"><a href="https://github.com/jracingdev/cofre" rel="noopener">GitHub</a> · <a href="/app/">Cofre web</a></p>
    </div>
  </footer>
</body>
</html>
