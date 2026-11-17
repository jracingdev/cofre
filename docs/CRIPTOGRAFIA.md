# Criptografia do Broquel — formato versão 1

Este documento é o contrato. O aplicativo Android, o cofre web e o PHP têm de produzir e aceitar exatamente estes bytes. A versão do formato é o byte `0x01`. Um leitor que não conhece a versão recusa o arquivo. Não tenta adivinhar.

Tudo que é inteiro está em **little-endian**. Comparação de segredo usa a função de tempo constante do libsodium (`memcmp` / `sodium_memcmp`). Chave temporária é apagada com `memzero` / `sodium_memzero`. Em JavaScript o runtime pode ter ficado com alguma cópia; por isso a sessão tem de ser curta e a chave do cofre não vai para disco.

O nome na tela é Broquel. O arquivo começa com os cinco bytes ASCII `COFRE` (`43 4F 46 52 45`).

## Primitivas

Só funções do libsodium. Não há construção caseira no lugar de uma primitiva.

| Uso | Função |
| --- | --- |
| Senha → chave mestra | `crypto_pwhash`, algoritmo `crypto_pwhash_ALG_ARGON2ID13` (byte `0x02`) |
| Chave mestra → chave de embrulho | `crypto_kdf_derive_from_key` |
| Embrulho e itens | `crypto_aead_xchacha20poly1305_ietf_*` |
| Login | `crypto_sign_*` (Ed25519) |
| Checksum do kit | `crypto_generichash` (BLAKE2b), 16 bytes, sem chave; usam-se os 4 primeiros |
| Texto do kit | `sodium_bin2base64` / `sodium_base642bin`, variante URL-safe, sem padding |
| Sorteio | `randombytes_buf` e `randombytes_uniform` |

Parâmetros fixos do KDF, que não vão no arquivo porque a versão 1 já os define:

- contexto do `crypto_kdf`: os 8 bytes ASCII `COFRE_K1`, sem nulo no final
- subchave: `1` (a subchave `2` fica reservada e não é usada)
- tamanho da subchave: 32 bytes

## Chaves

```
senha mestra (UTF-8, NFC)
  └─ Argon2id → chave mestra (32)
       └─ BLAKE2b, subchave 1 → chave de embrulho da senha (32)
            └─ XChaCha20-Poly1305 → embrulha o segredo do cofre

kit de recuperação (32 bytes aleatórios)
  └─ BLAKE2b, subchave 1 → chave de embrulho do kit (32)
       └─ XChaCha20-Poly1305 → embrulha o mesmo segredo

segredo do cofre (96 bytes)
  ├─ chave do cofre (32) → cifra cada item
  └─ chave secreta Ed25519 (64) → assina desafios
       └─ chave pública (32) vai no cabeçalho, em claro
```

A chave secreta Ed25519 é o bloco de 64 bytes do libsodium (semente e chave pública juntas). Ao abrir, a chave pública calculada a partir dela tem de ser igual à que está no cabeçalho. Se não for, a abertura falha como falha de autenticação.

O nonce do XChaCha20 é aleatório, 24 bytes, novo a cada cifragem. A tag Poly1305 tem 16 bytes e fica no final do texto cifrado, como o libsodium grava.

### Argon2id

| | Criação e troca de senha | Teto ao abrir |
| --- | --- | --- |
| voltas (`opslimit`) | 4 | 10 |
| memória (`memlimit`) | 268435456 (256 MiB) | 1073741824 (1 GiB) |

A memória tem de ser múltiplo de 1024. Abaixo de 8192 ou de 1 volta, o libsodium recusa. Criar com menos de 4 voltas ou menos de 256 MiB é recusado (`parametros_fracos`). Abrir usa os números gravados no cabeçalho, desde que caibam no teto. Passou do teto, o arquivo é recusado antes de alocar (`formato_invalido`). Assim um cabeçalho adulterado não pede memória infinita, e um cofre antigo continua abrindo se um dia o piso subir.

O sal tem 16 bytes aleatórios. A saída tem 32 bytes. A senha entra como UTF-8 na forma NFC, sem cortar espaços, com 12 a 256 pontos de código. Senha vazia ou curta é recusada (`senha_recusada`). Duas grafias da mesma letra, uma composta e outra com acento separado, viram a mesma chave.

## Cabeçalho do cofre

Tipo `0x01`. Tamanho fixo: **357 bytes**.

| Offset | Tamanho | Campo |
| ---: | ---: | --- |
| 0 | 5 | magic `COFRE` |
| 5 | 1 | versão `0x01` |
| 6 | 1 | tipo `0x01` |
| 7 | 1 | flags `0x01` |
| 8 | 16 | identificador do cofre, 16 bytes aleatórios |
| 24 | 1 | algoritmo `0x02` (Argon2id) |
| 25 | 4 | `opslimit`, uint32 |
| 29 | 8 | `memlimit`, uint64 |
| 37 | 16 | sal |
| 53 | 32 | chave pública Ed25519 |
| 85 | 136 | segredo embrulhado com a senha |
| 221 | 136 | segredo embrulhado com o kit |

Flags da versão 1: exatamente `0x01`. O bit 0 significa que o kit está presente. Os outros bits têm de ser zero. Qualquer outro valor é `formato_invalido`. Algoritmo diferente de `0x02` também.

Cada embrulho tem 136 bytes:

| Offset no embrulho | Tamanho | Campo |
| ---: | ---: | --- |
| 0 | 24 | nonce |
| 24 | 112 | texto cifrado do segredo (96 bytes + tag de 16) |

O segredo em claro, dentro do embrulho, é a chave do cofre (32) seguida da chave secreta Ed25519 (64).

### Dados associados do embrulho da senha (85 bytes)

| Offset | Tamanho | Campo |
| ---: | ---: | --- |
| 0 | 5 | magic |
| 5 | 1 | versão |
| 6 | 1 | tipo do cabeçalho `0x01` |
| 7 | 1 | propósito `0x01` |
| 8 | 16 | identificador do cofre |
| 24 | 1 | algoritmo `0x02` |
| 25 | 4 | `opslimit` |
| 29 | 8 | `memlimit` |
| 37 | 16 | sal |
| 53 | 32 | chave pública |

Trocar o sal, os parâmetros ou a chave pública sem refazer o embrulho faz a abertura falhar.

### Dados associados do embrulho do kit (56 bytes)

| Offset | Tamanho | Campo |
| ---: | ---: | --- |
| 0 | 5 | magic |
| 5 | 1 | versão |
| 6 | 1 | tipo `0x01` |
| 7 | 1 | propósito `0x02` |
| 8 | 16 | identificador do cofre |
| 24 | 32 | chave pública |

O kit não depende do sal nem da senha. Trocar a senha copia estes 136 bytes do kit como estão. Girar o kit copia o embrulho da senha como está e grava um kit novo. O kit antigo deixa de abrir.

## Kit de recuperação

32 bytes aleatórios. Não passam pelo Argon2id: já são aleatórios.

O texto para anotar é:

```
cofre1.<base64url dos 32 bytes>.<base64url dos 4 bytes de checksum>
```

O checksum é os 4 primeiros bytes de BLAKE2b-16 sobre a concatenação dos 12 bytes ASCII `cofre.kit.v1` com os 32 bytes do segredo. A comparação do checksum é em tempo constante. Checksum errado ou texto malformado: `kit_invalido`. Checksum certo e cofre errado: `autenticacao_falhou`.

Exemplo de forma, tirado do vetor de teste (não é um kit de uso real): `cofre1.` + 43 caracteres + `.` + 6 caracteres.

O kit não entra no cabeçalho em claro e não vai para o servidor.

## Item

Tipo `0x02`. O prefixo fixo tem 84 bytes. O resto é o texto cifrado.

| Offset | Tamanho | Campo |
| ---: | ---: | --- |
| 0 | 5 | magic |
| 5 | 1 | versão `0x01` |
| 6 | 1 | tipo `0x02` |
| 7 | 16 | identificador do cofre |
| 23 | 16 | identificador do item |
| 39 | 4 | revisão, uint32, começa em 1 |
| 43 | 8 | `criado_em`, uint64, milissegundos UTC |
| 51 | 8 | `atualizado_em`, uint64, milissegundos UTC |
| 59 | 1 | `apagado`: `0x00` ou `0x01` |
| 60 | 24 | nonce |
| 84 | variável | texto cifrado, tag no final |

Os instantes cabem em inteiro com sinal de 64 bits (`0` até `2^63 - 1`), para PHP e JavaScript lerem o mesmo número. Revisão `0` é inválida. `apagado` só pode ser 0 ou 1.

O identificador do aparelho não aparece aqui. Se um app quiser guardá-lo, guarda dentro do conteúdo cifrado.

### Preenchimento

O que entra na cifra não é o conteúdo cru. É um quadro:

| Offset | Campo |
| ---: | --- |
| 0 | uint32, tamanho real do conteúdo (N) |
| 4 | N bytes de conteúdo |
| 4+N | zeros até o fim do bloco |

O quadro tem o menor múltiplo de 1024 que comporte `4 + N`, no mínimo 1024. Conteúdo vazio vira um quadro de 1024 bytes. O máximo de conteúdo é 1 048 576 bytes (1 MiB). Bytes de preenchimento que não sejam zero, depois da autenticação, são `formato_invalido`. Assim não existem duas codificações do mesmo item.

O texto cifrado tem tamanho `tamanho do quadro + 16`. Item pequeno e item vazio ocupam o mesmo espaço no fio: 84 + 1024 + 16 = 1124 bytes.

### Dados associados do item (61 bytes)

| Offset | Tamanho | Campo |
| ---: | ---: | --- |
| 0 | 5 | magic |
| 5 | 1 | versão |
| 6 | 1 | tipo `0x02` |
| 7 | 1 | propósito `0x10` |
| 8 | 16 | identificador do cofre |
| 24 | 16 | identificador do item |
| 40 | 4 | revisão |
| 44 | 8 | `criado_em` |
| 52 | 8 | `atualizado_em` |
| 60 | 1 | `apagado` |

O nonce não entra nos dados associados. O modo AEAD já o autentica à parte.

Senha errada, kit errado, byte alterado no texto cifrado e byte alterado nestes campos produzem a mesma falha: `autenticacao_falhou`. Não dá para distinguir senha errada de arquivo adulterado, e o servidor não vê essa tentativa: a abertura é local.

## Desafio de autenticação

A mensagem assinada tem 55 bytes. Não é um registro gravado. É o que o Ed25519 assina.

| Offset | Tamanho | Campo |
| ---: | ---: | --- |
| 0 | 5 | magic |
| 5 | 1 | versão |
| 6 | 1 | propósito `0x20` |
| 7 | 16 | identificador do cofre |
| 23 | 32 | desafio aleatório, de uso único |

A assinatura tem 64 bytes (`crypto_sign_detached`). O servidor confere com a chave pública do cabeçalho. A regra de uso único e o prazo do desafio estão em [SINCRONIZACAO.md](SINCRONIZACAO.md).

## Backup

Tipo `0x03`. É um arquivo só, aberto com a senha ou com o kit. Não contém o kit em claro.

| Offset | Tamanho | Campo |
| ---: | ---: | --- |
| 0 | 5 | magic |
| 5 | 1 | versão |
| 6 | 1 | tipo `0x03` |
| 7 | 1 | flags `0x01` |
| 8 | 16 | identificador do cofre |
| 24 | 4 | tamanho do cabeçalho, tem de ser 357 |
| 28 | 357 | cabeçalho completo, tipo `0x01` |
| 385 | 4 | quantidade de itens, uint32 |
| 389 | repetido | uint32 tamanho do item, depois os bytes do item |

O identificador de fora tem de ser o do cabeçalho. Cada item tem de ser desse cofre. Não pode sobrar byte no final. No máximo 10 000 itens e 32 MiB. Item de outro cofre, arquivo cortado ou lixo no final: `formato_invalido`. Item com cifra adulterada: `autenticacao_falhou`.

## Troca de senha e giro do kit

Trocar a senha:

1. A sessão já está aberta, então o segredo está na memória.
2. Nasce um sal novo.
3. A senha nova passa pelo Argon2id com os parâmetros atuais de criação (o piso vigente, que pode ser maior que o do cabeçalho antigo).
4. O segredo é embrulhado de novo, com nonce novo e dados associados novos.
5. O embrulho do kit é copiado.
6. A chave do cofre não muda. Os itens não são recifrados.

Girar o kit faz o inverso: embrulho da senha copiado, kit novo, nonce novo. O kit anterior deixa de funcionar.

## Erros

O código vai no erro. A mensagem não inclui senha, chave nem conteúdo.

| Código | Quando |
| --- | --- |
| `senha_recusada` | Senha fora de 12 a 256 pontos, ou texto inválido |
| `parametros_fracos` | Criação abaixo do piso, ou número inválido na criação |
| `formato_invalido` | Estrutura, tamanho, flags, algoritmo, teto estourado na abertura |
| `versao_desconhecida` | Magic certo e versão diferente de `0x01` |
| `autenticacao_falhou` | Senha, kit ou cifra não conferem |
| `kit_invalido` | Texto do kit quebrado ou checksum errado |
| `estado_invalido` | Sessão travada, ou cabeçalho de outro cofre |
| `limite_excedido` | Item ou backup grande demais |
| `gerador_invalido` | Controle do gerador fora da faixa |

## Vetores

`vetores/vetores.json` traz entradas fixas (sal, nonces, chaves, senha fictícia) e as saídas em hexadecimal. O Argon2id desse arquivo é de propósito fraco (`opslimit` 2, `memlimit` 8192) para o teste ser rápido. A biblioteca recusa esses números na criação de um cofre real; o vetor existe para o Android conferir cada campo.

O cabeçalho do vetor começa com `434f465245010101`. No offset 25 está `opslimit` 2 (`02 00 00 00`). No offset 29 está `memlimit` 8192 (`00 20 00 00 00 00 00 00`). O sal do vetor começa no offset 37.
