# Sincronização entre o Android e o cofre web

O aplicativo e o site mudam o mesmo cofre. O que for criado, editado ou apagado num aparece no outro. O servidor é o ponto de encontro. Ele não vê o conteúdo e não junta duas versões. Quem decide o conflito é o aparelho, depois de decifrar.

Esta página define o contrato. O servidor Laravel é a etapa 2. Aqui não há rota implementada.

## O que o servidor armazena

Do cofre: o cabeçalho de 357 bytes, inteiro. Dali ele pode ler, pelos offsets de [CRIPTOGRAFIA.md](CRIPTOGRAFIA.md), o identificador, os parâmetros e a chave pública. O cabeçalho gravado é a fonte da verdade. Uma coluna copiada que discorde do blob é adulteração.

De cada item: o blob do tipo `0x02`, inteiro. A cabeça atual de cada identificador, inclusive os apagados. O servidor pode indexar os campos em claro do prefixo, e esses campos têm de ser iguais aos bytes do blob:

- identificador do cofre (16 bytes)
- identificador do item (16 bytes)
- revisão (uint32, começa em 1)
- `criado_em` e `atualizado_em` (milissegundos UTC)
- `apagado` (0 ou 1)

As datas existem porque as duas pontas precisam delas. Elas não decidem conflito. Quem decide é a revisão. Relógio adiantado não ganha de revisão menor.

Não há identificador de aparelho em claro. Não há título, usuário, senha nem tamanho exato do texto.

## Marca de exclusão

Apagar não remove a linha. O cliente grava uma revisão nova com `apagado = 1` e conteúdo vazio (o quadro cifrado continua lá, preenchido, para o tamanho não denunciar o que havia antes). A linha fica até os outros aparelhos aprenderem a exclusão. Não há, nesta versão, coleta de marcas antigas: apagar a linha no servidor faria outro aparelho recriar o item.

## Escrita: compare-e-troque

O servidor só aceita a revisão nova se o cliente partiu da revisão que está guardada.

- Criar: não existe item com aquele identificador, `revisao_base` é 0 e a revisão do blob é 1.
- Alterar ou apagar: `revisao_base` é a revisão atual e a revisão do blob é a atual mais 1.
- Qualquer outro caso: o servidor recusa, devolve a cabeça atual e não muda nada.

Dois aparelhos que editam a mesma revisão: um entra, o outro recebe o conflito. O servidor não escolhe o texto, não mescla campo e não guarda histórico. Um servidor malicioso pode guardar a versão antiga por fora; o cliente se defende com a regra abaixo.

O blob é opaco. O servidor confere o tamanho, o magic, a versão, o tipo, os identificadores e a conta da revisão. Não decifra.

## Anti-retrocesso

Cada aparelho lembra a maior revisão que já viu de cada item. Se o servidor oferecer uma revisão menor, o aparelho não substitui a cópia local. Avisa que o servidor andou para trás. Isso impede que um servidor mentiroso reponha uma senha antiga ou desfaça uma exclusão sem o cliente perceber.

## Quando o compare-e-troque recusa

O cliente baixa a cabeça do servidor, decifra as duas (a local pendente e a do servidor) e aplica, nesta ordem:

1. Se o texto cifrado e a marca `apagado` forem iguais ao que o cliente ia enviar, não há conflito. Fica a revisão do servidor.
2. Se as duas mudanças partiram da mesma revisão de base:
   - Edição contra exclusão: a edição fica. O cliente grava a edição como revisão nova em cima da cabeça atual e tira a marca de exclusão. Uma exclusão simultânea não pode sumir com um segredo.
   - Edição contra edição: não junta campos. A cabeça do servidor continua no identificador original. A versão local vira um item novo, com outro identificador. Dentro do conteúdo cifrado, invisível ao servidor, grava-se `conflito_de` com o identificador original. A tela, numa etapa futura, pede ao dono para escolher.
   - Exclusão contra exclusão: fica a marca do servidor.
3. Se o cliente estava atrasado (a base local já não é a cabeça), não sobrescreve. A cabeça do servidor fica. Se ainda houver mudança local não enviada, trata como o caso 2, para não perder o que foi digitado.

`atualizado_em` é informativo. Não desempata.

## Conteúdo do item

A cifra não interpreta o conteúdo. Para o Android e o site guardarem o mesmo tipo de registro, o conteúdo em claro (antes do preenchimento) é JSON UTF-8:

```json
{
  "v": 1,
  "tipo": "login",
  "titulo": "",
  "campos": {},
  "conflito_de": null
}
```

`conflito_de` é nulo ou o identificador, em hexadecimal, do item de origem. `v` sobe se o JSON mudar de forma. O servidor não vê este JSON.

O nome amigável do cofre é outro item, com o mesmo preenchimento. O identificador dele é fixo, o BLAKE2b-128 descrito em [CRIPTOGRAFIA.md](CRIPTOGRAFIA.md). O JSON, também sem espaços, é `{"v":1,"tipo":"nome","nome":""}`. A tela não lista esse item como login. Ele também não vira cópia de conflito: se os dois lados editarem o nome antes de sincronizar, vale a edição com `atualizado_em` maior, e a outra é descartada. Um apelido local, para achar o cofre antes de digitar a senha, não entra na sincronização.

## Troca com o servidor

O token de sessão é aleatório, de 32 bytes. O servidor guarda só o BLAKE2b dele, não o token em claro, e nunca a senha nem a chave do cofre. O desafio e a leitura do cabeçalho não pedem token. O resto pede.

1. `POST /v1/cofre` — envia o cabeçalho. O servidor grava o blob e lê a chave pública no offset 53.
2. `POST /v1/auth/desafio` — o servidor sorteia 32 bytes, amarra ao cofre e expira em 2 minutos.
3. `POST /v1/auth/responder` — o cliente assina a mensagem de 55 bytes. O servidor confere a assinatura, queima o desafio e devolve o token, ou um pré-token se o segundo fator já estiver ligado.
4. `GET /v1/cofre/{id}` — devolve o cabeçalho. Não exige sessão: o segundo aparelho precisa do sal e dos embrulhos para conseguir assinar. O identificador tem 128 bits.
5. `GET /v1/itens?cursor=0&limite=100` — cabeças com cursor maior que o informado, inclusive as apagadas. A resposta traz `proximo_cursor` e `tem_mais`. O cursor é um número do servidor que sobe a cada gravação aceita. Não faz parte do conteúdo e não decide conflito.
6. `PUT /v1/itens/{id}` — blob em base64 mais `revisao_base`. O identificador da URL tem de ser o do blob, e o cofre tem de ser o do token. Sucesso grava a cabeça nova. Conflito responde 409 com a cabeça atual.

Não há rota de exclusão física. Apagar é um `PUT` com `apagado = 1`.

## Sessão e segundo fator

O token de sessão dura no máximo 60 minutos (20 por padrão). O servidor guarda só o BLAKE2b de 32 bytes. Cada aparelho tem a sua sessão, e `DELETE /v1/sessoes/{id}` revoga uma delas.

Se o cofre já tem TOTP ou uma chave FIDO2, a assinatura do desafio não entrega o token de sincronização. Entrega um pré-token de 5 minutos, que só serve para concluir o segundo fator:

- `POST /v1/auth/totp` com o código de 6 dígitos
- `POST /v1/auth/recuperacao` com um código de recuperação de uso único, mostrado uma vez ao confirmar o TOTP
- `POST /v1/webauthn/login/opcoes` e `POST /v1/webauthn/login` para a chave FIDO2

O cadastro do TOTP e da chave FIDO2 pede uma sessão já aberta. Enquanto nada estiver cadastrado, a assinatura sozinha abre a sessão, para o primeiro acesso poder ligar o segundo fator.

`PUT /v1/cofre/rede` liga a lista de IPs daquele cofre. Se a variável `BROQUEL_IPS` estiver preenchida, ela vale para o servidor inteiro.

Os blobs viajam em base64 comum. O cabeçalho novo, depois de trocar a senha no aparelho, entra por `PUT /v1/cofre`. A chave pública tem de continuar a mesma.

## Ida e volta

O cliente puxa a partir do cursor 0 e segue enquanto `tem_mais` for verdadeiro. Um cofre pessoal cabe em poucas páginas.

- Revisão do servidor maior, e não há mudança local pendente: fica a do servidor, se ela não for menor que a maior já vista.
- Revisão local é a do servidor mais 1, e a base local é a do servidor: envia.
- Iguais: não faz nada.
- O servidor recusou: aplica as regras de conflito e, se precisar, envia de novo em cima da cabeça nova.

Criar, editar ou apagar num lado produz uma revisão nova. O outro lado a recebe no próximo puxão. O conteúdo continua cifrado o tempo todo.
