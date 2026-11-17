# Broquel

Broquel é um cofre de senhas pessoal. O nome que aparece na tela do celular é **Broquel**. O ícone é um escudo longo, azul, com bordas pretas (`design/broquel.svg`): sem letra e sem desenho de chave, para a tela inicial não anunciar o que o aplicativo guarda.

O programa tem três partes, construídas em etapas:

- o aplicativo Android
- o cofre no navegador
- o servidor de sincronização

O servidor guarda só dados cifrados. A senha mestra, as chaves e o conteúdo dos itens não saem do aparelho em claro. Isso se chama cofre de conhecimento zero: quem administra o servidor, ou quem rouba o banco, não consegue ler as senhas.

Esta entrega é a etapa 1: a especificação, a biblioteca compartilhada e os testes. Ainda não há aplicativo, servidor nem tela.

## Etapas

1. **Criptografia e base.** Formato versionado, biblioteca TypeScript (a mesma que o cofre web vai importar), a mesma lógica em PHP para conferir os bytes, gerador de senhas e vetores de teste. É esta etapa.
2. **Servidor Laravel (PHP 8.2).** Sincronização. O servidor só armazena o cabeçalho e os itens cifrados, e confere a assinatura de autenticação. Não decifra nada.
3. **Aplicativo Android (Kotlin).** Nome exibido Broquel, ícone do escudo longo azul com bordas pretas, gerador com os mesmos controles deslizantes. Quando o aplicativo existir, a instalação no celular ligado por ADB entra nesta etapa. O app confere `vetores/vetores.json` antes de ser dado como compatível.
4. **Cofre web.** Reutiliza `packages/cripto`. Os mesmos controles do gerador.
5. **Revisão de segurança.** Leitura independente do formato, da biblioteca e do servidor, atrás de vazamento, troca de versão e erro de implementação.

## O que a gente assume que o atacante pode fazer

- Roubar o banco do servidor ou comandar o servidor.
- Ler e alterar o que passa na rede.
- Roubar um arquivo de backup.
- Mudar um byte de um item ou do cabeçalho.
- Tentar adivinhar a senha mestra fora de linha, com calma.

Contra isso, o conteúdo fica cifrado no aparelho, cada alteração de byte é detectada, e a senha passa por um Argon2id pesado antes de virar chave.

Isto aqui não protege se o próprio celular já estiver comprometido depois que o cofre foi aberto, se alguém estiver olhando a tela, ou se a senha mestra for óbvia. O servidor também pode apagar dados ou ficar fora do ar. Ele não consegue ler nem trocar um item em silêncio.

## O que pode sair do aparelho

- O cabeçalho do cofre: sal, parâmetros do Argon2id, chaves embrulhadas e a chave pública de autenticação.
- Os itens: identificador, revisão, datas, marca de exclusão e o texto cifrado.
- A assinatura de um desafio aleatório, para provar que o aparelho tem a chave secreta sem enviá-la.

## O que não sai

- A senha mestra.
- A chave mestra e a chave de embrulho.
- A chave do cofre, que cifra os itens.
- A chave secreta de autenticação.
- O kit de recuperação.
- Títulos, usuários, senhas, notas e qualquer outro conteúdo.
- A senha nova criada pelo gerador, até ela ir para dentro de um item cifrado.

O tamanho exato do item também não aparece. O conteúdo é preenchido de 1 em 1 KiB antes de cifrar. O servidor vê a faixa, não o tamanho certo. Itens pequenos ficam todos do mesmo tamanho.

## Decisões de segurança

A senha não é a chave. Ela passa pelo Argon2id, lento e gastador de memória, para atrasar quem tenta adivinhar. Na criação de um cofre novo usamos **4 voltas e 256 MiB**. É mais pesado que o nível moderado do libsodium (3 voltas na mesma memória) e ainda cabe num celular. O nível mais alto do libsodium usa 1 GiB e pode fazer o Android matar o aplicativo. Os números ficam gravados no cabeçalho: no futuro dá para subir sem mudar o formato. Criar um cofre com número menor é recusado. Abrir um cabeçalho que peça mais de 1 GiB ou mais de 10 voltas também é recusado, para um servidor mentiroso não travar o aparelho.

O libsodium só oferece essa função com um fio de execução. Não escrevemos outro Argon2 para forçar mais paralelismo.

Dessa chave mestra sai, por BLAKE2b (`crypto_kdf`), uma chave de embrulho. Ela protege um segredo aleatório do cofre: a chave que cifra os itens e a chave secreta de login. Trocar a senha mestra só refaz esse embrulho. Os itens continuam como estão.

O login no servidor é uma assinatura Ed25519 de um desafio de uso único. O servidor guarda a chave pública. Ele nunca recebe um segredo que sirva para decifrar.

Há um kit de recuperação aleatório, anotado fora do aparelho. Ele embrulha o mesmo segredo. Perdeu a senha, o kit abre o cofre e a senha nova é gravada por cima. O kit não é enviado ao servidor.

Cada item usa XChaCha20-Poly1305, com nonce aleatório de 24 bytes. Os dados associados amarram o item ao cofre, à revisão, às datas e à marca de exclusão. Mudou qualquer um desses campos, a abertura falha.

O backup é o cabeçalho mais os itens, no mesmo formato. Sem a senha ou o kit, o arquivo não revela o conteúdo.

As primitivas são as do libsodium. Não há cifra, hash ou derivação escrita à mão. A biblioteca web é `libsodium-wrappers-sumo` porque o build sumo traz o Argon2id e o KDF no navegador. O PHP usa a extensão sodium, que é o mesmo libsodium. O gerador, no PHP, usa `random_bytes` com rejeição para não enviesar o sorteio, porque essa extensão não expõe `randombytes_uniform`. O algoritmo da senha gerada é o mesmo dos dois lados.

## Gerador de senhas

O gerador faz parte desta biblioteca, para o Android e o site não divergirem. A tela (etapas 3 e 4) mostra dois controles deslizantes:

- **Nível**, com quatro paradas: Básico, Forte, Alto e Militar. O controle começa em Militar.
- **Comprimento**, de 12 a 128. O mínimo sobe junto com o nível, então o controle militar não desce de 32 caracteres.

O detalhe dos alfabetos, do piso de bits e do sorteio está em [docs/GERADOR.md](docs/GERADOR.md).

## Como rodar os testes

É preciso Node.js 22 e PHP 8.2 ou mais novo, com as extensões sodium, intl e mbstring.

```sh
./scripts/testar.sh
```

Os vetores públicos ficam em [vetores/vetores.json](vetores/vetores.json). Eles usam Argon2id fraco de propósito, para o teste ser rápido. Um cofre de verdade recusa esses parâmetros. A senha dos vetores é fictícia.

O formato byte a byte está em [docs/CRIPTOGRAFIA.md](docs/CRIPTOGRAFIA.md). A sincronização entre o Android e o site está em [docs/SINCRONIZACAO.md](docs/SINCRONIZACAO.md). O servidor dessa sincronização é a etapa 2.

## Layout

- `packages/cripto` — biblioteca TypeScript de referência
- `php` — a mesma lógica, para o servidor conferir o formato
- `vetores/vetores.json` — vetores fixos para o Android
- `design/broquel.svg` — ícone
- `docs` — especificações
