# Broquel como serviço (SaaS)

A camada SaaS fica ao lado do cofre. Nenhuma tabela antiga mudou, o formato do cofre e o cabeçalho de 357 bytes ficaram iguais, e a conta nunca abre o cofre.

## O que existe

| Parte | Onde | O que faz |
| --- | --- | --- |
| Cadastro controlado | `POST /v1/cofre` + `BROQUEL_CADASTRO` | `convite` (padrão): só cria cofre com código de convite. `aberto`: qualquer um, no plano `BROQUEL_PLANO_ABERTO`. `fechado`: ninguém. `BROQUEL_MAX_COFRES` limita o total (0 = sem limite). |
| Convites | `php artisan broquel:convite` | Gera um código de uso único (ou `--usos=N`), com plano e validade. O código vai no corpo (`"convite"`) ou no cabeçalho `X-Broquel-Convite`. |
| Planos e limites | tabelas `planos` e `cofre_planos` | Itens, espaço (bytes cifrados) e aparelhos. Cofre sem linha em `cofre_planos` (os que já existiam) fica no plano `ilimitado`. |
| Uso | `GET /v1/plano` (token do cofre) | Plano, validade, somente leitura e uso atual, para o app mostrar "x de y". |
| Contas | `/v1/conta/*` e página `/conta` | Login por link mágico no e-mail. Guarda e-mail, aceite dos termos e cofres ligados. |
| Ligar cofre à conta | `POST /v1/cofre/conta` (token do cofre) | Manda o link para o e-mail; ao abrir o link, o cofre fica ligado à conta. |
| Exclusão | `DELETE /v1/conta` + `broquel:excluir-contas` | Agenda para 7 dias; o agendador apaga conta, cofres, itens, sessões e fatores. Dá para desistir antes. |
| Cobrança | `POST /v1/cobranca/webhook` | Eventos assinados com HMAC. Pagamento confirmado define plano e validade. Vencido além da carência (`BROQUEL_CARENCIA_DIAS`, padrão 7) vira somente leitura. Nada é apagado por falta de pagamento. |
| Textos legais | `/termos` e `/privacidade` | Rascunho com base na LGPD. Revise com um advogado antes de cobrar. |

## Respostas novas que os apps precisam tratar

- `403 convite_necessario` / `convite_invalido` / `cadastro_fechado` ao criar cofre.
- `403 limite_excedido` ao gravar item novo acima do plano. Editar e apagar continua liberado.
- `403 somente_leitura` ao gravar com o plano vencido ou o cofre bloqueado. Ler e exportar continua liberado.
- `403 limite_aparelhos` ao entrar de um aparelho novo acima do plano. Aparelho já usado nos últimos 30 dias sempre entra.

## Painel /admin

No servidor, dentro de `servidor/`, rode `php artisan broquel:admin`. Ele mostra um link `https://.../admin#t=...` que vale 10 minutos e uma vez só; a sessão do painel dura 30 minutos e fica só na aba. Não existe senha de admin na internet: entrar exige acesso ao VPS. No painel dá para ver cofres, contas, uso e planos, gerar e encerrar convites, mudar plano e validade e pôr um cofre em somente leitura.

## Administração (no servidor)

```sh
php artisan broquel:convite --plano=completo --usos=1 --dias=30 --obs="amigo"
php artisan broquel:planos
php artisan broquel:cofres
php artisan broquel:plano <cofre_id> completo --ate=2027-12-31
php artisan broquel:bloquear <cofre_id>            # somente leitura
php artisan broquel:bloquear <cofre_id> --desbloquear
php artisan broquel:excluir-contas
php artisan broquel:limpar                         # apaga desafios, links e sessões vencidos
php artisan broquel:testar-email voce@exemplo.com  # confere o SMTP
```

`broquel:excluir-contas` (de hora em hora) e `broquel:limpar` (uma vez por dia) rodam sozinhos pelo agendador do Laravel. Para isso o servidor precisa de um Cron que chame `php artisan schedule:run` a cada minuto (veja [IMPLANTACAO.md](IMPLANTACAO.md)).

Os planos são linhas da tabela `planos` (`ilimitado`, `gratis` e `completo` já vêm criados). Para mudar limites, edite a linha.

## Webhook de cobrança

O corpo é JSON neutro, assinado com `hex(HMAC-SHA256(corpo, BROQUEL_COBRANCA_SEGREDO))` no cabeçalho `X-Broquel-Assinatura`:

```json
{"evento_id": "pg_123", "tipo": "pagamento_confirmado", "conta_id": "<uuid>", "plano_id": "completo", "valido_ate": "2027-01-20T00:00:00Z"}
```

Tipos: `pagamento_confirmado`, `pagamento_atrasado`, `assinatura_cancelada`. O mesmo `evento_id` só vale uma vez. Com o segredo vazio a rota responde 404. O gateway escolhido (Asaas, Mercado Pago ou Stripe) entra com um adaptador pequeno que traduz o evento dele para este formato. Se `BROQUEL_IPS` estiver preenchido, inclua os IPs do gateway.

## Variáveis novas do `.env`

```
BROQUEL_CADASTRO=convite
BROQUEL_MAX_COFRES=0
BROQUEL_PLANO_SEM_REGISTRO=ilimitado
BROQUEL_PLANO_ABERTO=gratis
BROQUEL_CARENCIA_DIAS=7
BROQUEL_TERMOS_VERSAO=2026-11-20
BROQUEL_RESPONSAVEL=jracing.dev.br
BROQUEL_CONTATO=privacidade@jracing.dev.br
BROQUEL_COBRANCA_SEGREDO=
```

O link mágico usa `APP_URL` e o e-mail configurado em `MAIL_*`. Sem SMTP configurado (`MAIL_MAILER=log`), o link vai para o log. Como ligar o SMTP: [EMAIL.md](EMAIL.md).

## Ainda falta

- Escolher o gateway e escrever o adaptador do webhook.
- Revisão jurídica dos termos e da política, e CNPJ do responsável.
