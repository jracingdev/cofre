# Gerador de senhas

O gerador faz parte da biblioteca da etapa 1. A senha nasce no aparelho. Ela só sai dali dentro de um item cifrado. O servidor não tem rota de geração.

A tela do Android e a do site, nas etapas 3 e 4, desenham dois controles deslizantes e chamam as funções abaixo. Os dois lados usam os mesmos números, para o mesmo nível produzir o mesmo tipo de senha.

## Controles

O estado inicial é o nível 4, comprimento 40.

| Controle | Id | Mínimo | Máximo | Passo | O que acontece ao soltar |
| --- | --- | --- | --- | --- | --- |
| Nível | `nivel` | 1 | 4 | 1 | Aplica a parada mais próxima e põe o comprimento padrão dessa parada |
| Comprimento | `comprimento` | o mínimo do nível | 128 | 1 | Arredonda e não deixa sair da faixa |

Paradas do nível, da esquerda para a direita: Básico, Forte, Alto, Militar.

| Nível | Nome | Comprimento padrão | Comprimento mínimo | Símbolos | Piso estimado |
| ---: | --- | ---: | ---: | --- | ---: |
| 1 | Básico | 16 | 12 | não | 87 bits |
| 2 | Forte | 20 | 16 | sim | 115 bits |
| 3 | Alto | 28 | 24 | sim | 165 bits |
| 4 | Militar | 40 | 32 | sim | 239 bits |

Todos usam minúsculas, maiúsculas e dígitos, e tiram os caracteres ambíguos. O piso é a conta da escolha dos caracteres, arredondada para baixo. Não soma a permutação final e não é certificação. Serve para o número ao lado do controle e para comparar as paradas.

Deslizar o comprimento para baixo do mínimo do nível não enfraquece a parada: o valor gruda no mínimo. Para uma senha mais curta, o nível desce primeiro. Pedir nível 4 com 20 caracteres é recusado (`gerador_invalido`).

Funções da biblioteca TypeScript: `estadoInicial`, `aoDeslizarNivel`, `aoDeslizarComprimento`, `controles`, `gerarSenha`, `entropiaMinimaBits`. No PHP: `Gerador::estadoInicial`, `aoDeslizarNivel`, `aoDeslizarComprimento`, `gerar`.

## Alfabetos

Nesta ordem, e só as classes da parada:

- minúsculas: `abcdefghijklmnopqrstuvwxyz`
- maiúsculas: `ABCDEFGHIJKLMNOPQRSTUVWXYZ`
- dígitos: `0123456789`
- símbolos: `!#$%*+,-./:;=?@^_~`

Caracteres ambíguos, retirados: `0`, `O`, `o`, `l`, `1`, `I`, `|`.

O alfabeto de trabalho é a concatenação das classes que sobraram, nessa ordem.

## Como a senha é montada

1. Sai um caractere de cada classe, na ordem acima.
2. O resto sai do alfabeto inteiro, até completar o comprimento.
3. Embaralha com Fisher-Yates: do último índice até o segundo, troca com um índice sorteado em `0 .. i` inclusive.

O sorteio `uniform(teto)` devolve um inteiro em `0 .. teto-1`, sem viés.

- No navegador e no Android: `randombytes_uniform` do libsodium.
- No PHP de referência: a extensão sodium não expõe essa função. O código usa `random_bytes` (gerador do sistema) e descarta as amostras que cairiam no resto enviesado do módulo.

Passar outra fonte para `gerarSenha` é só para o vetor de teste. Cofre real não faz isso.

## Fonte de teste

Não usar para senha de verdade. Os dois lados conferem o vetor com este gerador, semente `0xC0FFEE01`:

```
estado = (estado * 1664525 + 1013904223) mod 2^32
devolve estado mod teto
```

O resultado do nível 1 com o comprimento padrão está em `vetores/vetores.json`, campo `gerador`.
