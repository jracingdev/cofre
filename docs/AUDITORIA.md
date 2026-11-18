# Auditoria da etapa 5

Esta leitura cobre a biblioteca de criptografia (TypeScript, PHP e Kotlin), o servidor Laravel, o aplicativo Android e o cofre web. O critério foi o de quem já tem o banco, a rede ou um aparelho desbloqueado, e procura vazar, trocar um byte, entrar no cofre de outra pessoa ou travar o serviço.

Não substitui uma auditoria paga, com pessoas que não escreveram este código.

## Modelo de ameaças

Quem ataca pode:

- Roubar o banco do servidor ou administrar o servidor.
- Ler e alterar o que passa na rede, se não houver HTTPS de verdade.
- Roubar um arquivo de backup do celular ou do navegador.
- Mandar muitos pedidos para encher disco, CPU ou a tabela de desafios.
- Tentar usar o token de um cofre para ler outro.
- Olhar a tela, ou usar o aparelho depois que o cofre foi aberto.
- Pedir preenchimento automático numa tela que imita um login.

O servidor continua sem a senha mestra, sem a chave do cofre e sem o conteúdo. Ele guarda o segredo do TOTP cifrado com a `APP_KEY`, porque é ele quem confere o código. Quem tem a `APP_KEY` e o banco gera código TOTP, mas ainda não decifra os itens: falta a chave secreta de login, que não sai do aparelho.

## O que foi conferido e está de acordo

- O formato segue [CRIPTOGRAFIA.md](CRIPTOGRAFIA.md): magic `COFRE`, cabeçalho de 357 bytes, item com prefixo de 84 bytes, Argon2id, embrulho de 136 bytes, XChaCha20-Poly1305.
- Cada item e cada embrulho nascem com nonce aleatório de 24 bytes. O nonce não é reaproveitado.
- O AAD do item amarra cofre, item, revisão, datas e marca de exclusão. Mudou um campo, a abertura falha. Os vetores em `vetores/vetores.json` continuam passando nos três idiomas.
- A chave do cofre e a chave secreta de login são zeradas ao travar, com `sodium.memzero` no TypeScript e no PHP e com `Arrays.fill` no Kotlin. O PHP e o TypeScript comparam o kit com `sodium_memcmp`. O PHP compara identificadores com `hash_equals`.
- O token de sessão guarda só o BLAKE2b. A rota de item usa o cofre do token, não um identificador solto. Um teste recusa leitura, gravação e revogação entre dois cofres.
- Desafio de login é de uso único e expira. O segundo fator, quando existe, segura o token de sincronização.
- Cabeçalhos da API: `nosniff`, `DENY`, `no-referrer`, `no-store`, política `default-src 'none'`. O site em `/app/` tem a política estrita e a integridade dos arquivos. Não há `localStorage` no cofre web.
- Android: `allowBackup=false`, atividade do lançador exportada de propósito, serviço de preenchimento exportado só com `BIND_AUTOFILL_SERVICE`, `FLAG_SECURE`, sem `Log` de segredo. Com o cofre travado, o preenchimento não manda senha: pede para desbloquear.
- O proxy confiável do Laravel é só `127.0.0.1`.

## Achados corrigidos

| Gravidade | Achado | Correção |
| --- | --- | --- |
| Média | As rotas de sincronização não tinham limite. Um token roubado, ou um cliente barulhento, podia gravar sem freio. | O grupo da API passou a usar `throttle:api`. O teste força o limite em 1 pedido por minuto e espera 429. |
| Média | No Android, o checksum do kit era comparado com `contentEquals`, que pode parar no primeiro byte diferente. O hash de 16 bytes também ficava na memória. | A comparação passou a ser `sodium_memcmp`. O hash e o checksum informado são zerados. A chave pública derivada da secreta usa a mesma comparação. |
| Média | Todo build do Android aceitava HTTP. Uma rede local podia se passar pelo servidor. | Só o build de debug aceita HTTP, para teste. O release recusa texto claro. |
| Média | Se o prompt biométrico com `CryptoObject` falhasse na hora de abrir, o código tentava de novo sem amarrar a chave. O sucesso podia usar a cifra que não passou pela biometria. | A biometria só conclui com a cifra devolvida pelo `CryptoObject`. |
| Baixa | A folga do TOTP era 29 segundos. Perto da virada do passo, o código anterior e o seguinte valiam ao mesmo tempo. | A folga ficou em 15 segundos, ainda abaixo do passo de 30. O código atual continua válido. |
| Baixa | Desafios vencidos ficavam na tabela. Alguém podia enchê-la aos poucos. | Antes de gravar um desafio novo, os vencidos daquele cofre são apagados. O mesmo vale para a cerimônia FIDO2. O limite de tentativas continua. |
| Baixa | `allowBackup="false"` sozinho não declara as regras de extração do Android 12. | Há regras que excluem arquivo, banco, preferências e raiz, na nuvem e na passagem de aparelho. |
| Baixa | O release não ofuscava e não tinha caminho de assinatura. | O R8 está ligado no release, com regras para não quebrar o libsodium. A assinatura lê `BROQUEL_KEYSTORE` e as senhas do ambiente. O passo está em [IMPLANTACAO.md](IMPLANTACAO.md). A loja não entra no Git. |
| Baixa | A chave biométrica continuava válida se a pessoa cadastrasse outra digital, e podia ser usada com a tela do aparelho bloqueada. | A chave exige aparelho desbloqueado e é invalidada quando o conjunto de digitais muda. |
| Baixa | `org.json` 20240303 tem um esgotamento ao ler um número enorme (`GHSA-ghc9-756g-vrcv`). Um servidor mentiroso podia travar o aplicativo com um JSON gigante. | A dependência foi para 20260719. O CI consulta o OSV. |
| Alta | No Android, a cópia local era cifrada com IV escolhido pelo app numa chave do Keystore, que recusa isso. Nenhuma gravação funcionava: o app fechava ao digitar o servidor e o cofre criado não ficava salvo. | O IV vem do Keystore. A gravação usa arquivo temporário e não roda mais a cada tecla na thread da tela. |
| Média | O servidor aceitava o mesmo código TOTP mais de uma vez dentro da janela. | O último passo aceito fica gravado. Código repetido, ou de passo anterior, é recusado (RFC 6238, 5.2). |
| Média | Nome do cofre editado nos dois lados: o site tratava o item como login e toda sincronização seguinte falhava; o Android criava um login vazio. | Vale a edição mais recente. Teste no site cobre os dois sentidos. |
| Baixa | O Sair fazia login de novo, pedindo o código TOTP outra vez, e não funcionava sem rede. Ao sair, a chave biométrica ficava no Keystore. | O Sair reaproveita o token da sincronização. Sem servidor, oferece apagar só deste aparelho. A chave biométrica é apagada. |
| Baixa | A senha do item aparecia em claro no editor. A cópia não era marcada como sensível. | Senha escondida por padrão, com Mostrar. No Android 13+, a cópia é marcada como sensível. |
