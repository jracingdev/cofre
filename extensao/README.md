# Extensão de navegador do Broquel

Sugere guardar senhas novas e preenche as senhas salvas no computador, como o Android já faz.
Funciona no Chrome, Edge, Brave e outros navegadores Chromium (versão 116 ou mais nova) e no Firefox 128 ou mais novo.

## Instalar

Os pacotes ficam no site do Broquel:

- Chrome, Edge, Brave: https://broquel.jracing.dev.br/downloads/broquel-extensao-chrome.zip
- Firefox: https://broquel.jracing.dev.br/downloads/broquel-extensao-firefox.zip
- Conferência: https://broquel.jracing.dev.br/downloads/SHA256SUMS-extensao.txt

**Chrome, Edge ou Brave**

1. Baixe e descompacte `broquel-extensao-chrome.zip` numa pasta que vai ficar no computador (por exemplo `Documentos\Broquel`).
2. Abra `chrome://extensions` (no Edge, `edge://extensions`).
3. Ligue o **Modo do desenvolvedor**.
4. Clique em **Carregar sem compactação** e escolha a pasta.
5. Fixe o ícone do Broquel na barra (ícone de quebra-cabeça).

Para atualizar, troque os arquivos da pasta pela versão nova e clique em **Atualizar** em `chrome://extensions`.

**Firefox**

1. Abra `about:debugging#/runtime/this-firefox`.
2. Clique em **Carregar extensão temporária** e escolha o `broquel-extensao-firefox.zip`.

No Firefox, extensão carregada assim some ao fechar o navegador. Para ficar instalada de vez ela precisa ser assinada pela Mozilla (envio ao addons.mozilla.org, mesmo sem aparecer na loja).

## Usar

1. Clique no ícone do Broquel e conecte o cofre com o **identificador** (Ajustes, no app ou no site) e a **senha mestra**.
2. Se o cofre tiver TOTP, a extensão pede o código do autenticador (ou um código de recuperação) para sincronizar.
3. Ao clicar num campo de login, aparece a lista das contas **daquele site**. Clique numa para preencher.
4. Depois de entrar com uma senha nova, o Broquel pergunta se quer guardar. Se o mesmo usuário já existe naquele site, propõe trocar só a senha.
5. Atalho: `Ctrl+Shift+L` preenche a primeira conta do site aberto.

## Segurança

- A chave do cofre só existe na extensão. O servidor guarda blobs cifrados, igual ao app e ao site. Nada muda no formato do cofre.
- Destravado, o segredo do cofre fica em `chrome.storage.session`: só na memória, apaga ao fechar o navegador e o script das páginas não lê.
- Trava depois de 15 minutos sem uso (5, 15 ou 60, em Ajustes), ao bloquear o computador e ao fechar o navegador. Focar um campo numa página não conta como uso.
- A cópia local (`chrome.storage.local`) guarda só blobs cifrados. A mesma checagem do site recusa campo de senha, token ou chave.
- Só oferece e entrega a senha para o mesmo domínio ou subdomínio do item, com a regra do Android: `banco.com.br.golpe.com` e sufixos públicos como `com.br` nunca combinam. O domínio vem do navegador, não do que a página diz.
- Só age no quadro de topo da aba, em `https` (ou `http` em localhost e rede local). Iframes de anúncio não recebem nada.
- Preencher exige um clique de verdade (`isTrusted`) na lista do Broquel, no popup ou o atalho de teclado. Um script da página não consegue disparar.
- A interface na página fica num shadow DOM fechado e não expõe arquivo da extensão para a página (um site não detecta o Broquel por ele).
- Sem código remoto nem `eval`. A política de conteúdo das páginas da extensão só deixa falar com `https://broquel.jracing.dev.br`.
- Permissões: `storage`, `alarms`, `idle` (travar ao bloquear o PC), `clipboardWrite` (copiar), `activeTab` (ver o site da aba ao abrir o popup), acesso a `broquel.jracing.dev.br` e o script nas páginas `http(s)` para sugerir e preencher.
- Chave FIDO2 como segundo fator não funciona dentro da extensão (o navegador só deixa usar no próprio site). Use TOTP ou código de recuperação.

## Desenvolver

```
cd extensao
npm ci
npm test          # regra de domínio e lógica de guardar
npm run typecheck
npm run build     # gera dist/ e servidor/public/downloads/*.zip
```

O build é reprodutível: o CI gera de novo e confere com `git diff` que os zips publicados batem com o código.
Para testar com um servidor local: `BROQUEL_SERVIDOR=http://127.0.0.1:8000 npm run build` gera `dist-teste/` sem tocar nos downloads.
