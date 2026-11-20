# Envio de e-mail

O Broquel manda e-mail para uma coisa só: o link de acesso à conta (página `/conta` e botão "Ligar à conta" nos apps). O cofre não depende de e-mail. Sem SMTP, o servidor funciona e o link vai para `storage/logs/laravel.log`.

O envio é SMTP comum, então serve qualquer provedor: Amazon SES, Brevo, Mailgun, Resend, Zoho, Google Workspace ou o e-mail da hospedagem. Nada no código muda de um para outro, só o `.env`.

## O que pôr no `.env`

No servidor, em `servidor/.env`:

```
MAIL_MAILER=smtp
MAIL_HOST=smtp.seu-provedor.com
MAIL_PORT=587
MAIL_SCHEME=smtp
MAIL_USERNAME=usuario-do-smtp
MAIL_PASSWORD="senha-ou-chave-do-smtp"
MAIL_FROM_ADDRESS="nao-responda@jracing.dev.br"
MAIL_FROM_NAME="Broquel"
MAIL_TIMEOUT=15
```

- Porta 587 com `MAIL_SCHEME=smtp`: começa sem criptografia e sobe para TLS (STARTTLS). É o caso mais comum.
- Porta 465: troque para `MAIL_SCHEME=smtps` (TLS desde o início).
- `MAIL_FROM_ADDRESS` precisa ser de um domínio que o provedor autorizou. Senão o e-mail cai no spam ou é recusado.
- `APP_URL` tem de ser `https://broquel.jracing.dev.br`: é dele que sai o endereço do link.
- A senha com símbolos vai entre aspas.

Depois de mudar o `.env`, limpe e refaça o cache da configuração:

```sh
php artisan config:clear && php artisan config:cache
```

## Testar

```sh
php artisan broquel:testar-email voce@exemplo.com
```

O comando mostra o host e o remetente que está usando, manda um e-mail curto e diz se o provedor aceitou. Se falhar, a mensagem do provedor aparece ali (senha errada, porta bloqueada, remetente não autorizado).

## Para não cair no spam

No DNS do domínio do remetente (`jracing.dev.br`), cadastre o que o provedor pedir:

- **SPF**: um registro TXT que autoriza o provedor a mandar pelo domínio. Se já existe um SPF, junte os dois num registro só.
- **DKIM**: um ou dois registros que o provedor gera.
- **DMARC**: um TXT em `_dmarc.jracing.dev.br`, por exemplo `v=DMARC1; p=none; rua=mailto:voce@jracing.dev.br`. Comece com `p=none` e endureça depois.

## Como o servidor se protege

- O e-mail sai depois da resposta. O tempo da resposta não revela se a conta existe, e um SMTP lento não trava a página.
- Se o SMTP falhar, o erro vai para o log sem o link. A pessoa pede outro link.
- No cadastro por convite (`BROQUEL_CADASTRO=convite` ou `fechado`), a página `/conta` só manda link para e-mail que já tem conta. Assim ninguém usa o servidor para mandar e-mail a endereços de terceiros. A resposta é a mesma nos dois casos. A conta nova nasce pelo "Ligar à conta", de dentro de um cofre aberto.
- No máximo 5 links por e-mail por hora, além do limite por endereço IP.
- O link vale 30 minutos e uma vez só. Ele fica depois do `#` no endereço, então não aparece em log de servidor nem em `Referer`.
