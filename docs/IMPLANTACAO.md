# Colocar o servidor no ar

O servidor fica num VPS só dele. Não o instale no computador do dia a dia. Ele guarda blobs cifrados, não as senhas, mas ainda assim é a porta de entrada da sincronização.

O código está em `servidor/`. É Laravel 12, e roda em PHP 8.2. O banco pode ser MySQL ou Postgres. Os testes usam SQLite na memória. Em produção, use MySQL ou Postgres.

## O que você precisa antes

- Um VPS com Ubuntu 24.04, ou o aaPanel em cima de um Linux parecido.
- Um nome de domínio apontando para o IP do VPS, por exemplo `cofre.seudominio`.
- Acesso SSH.
- Portas 22, 80 e 443. Nada mais aberto para a internet. O PHP escuta só em `127.0.0.1`.

## Linux puro

```sh
sudo apt update
sudo apt install -y nginx mysql-server
sudo apt install -y php8.2-fpm php8.2-cli php8.2-mbstring php8.2-xml php8.2-curl \
  php8.2-mysql php8.2-intl php8.2-gmp php8.2-sodium php8.2-sqlite3 unzip
curl -sS https://getcomposer.org/installer | php
sudo mv composer.phar /usr/local/bin/composer
```

Se a imagem só tiver PHP 8.3, use os pacotes `php8.3-*` equivalentes. O projeto aceita 8.2 e 8.3. Não use uma versão mais antiga.

Crie o banco e um usuário que só enxerga esse banco:

```sql
CREATE DATABASE broquel CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'broquel'@'127.0.0.1' IDENTIFIED BY 'uma-senha-longa-so-do-banco';
GRANT ALL ON broquel.* TO 'broquel'@'127.0.0.1';
```

No Postgres o equivalente é um banco `broquel`, um usuário `broquel` e `DB_CONNECTION=pgsql`.

Copie o código para `/var/www/broquel`, entre em `servidor/` e rode:

```sh
composer install --no-dev --optimize-autoloader
cp .env.example .env
php artisan key:generate
```

Edite o `.env`:

```
APP_ENV=production
APP_DEBUG=false
APP_URL=https://cofre.seudominio
LOG_LEVEL=warning

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=broquel
DB_USERNAME=broquel
DB_PASSWORD=uma-senha-longa-so-do-banco

BROQUEL_SESSAO_MINUTOS=20
BROQUEL_LIMITE_AUTH=8
BROQUEL_LIMITE_API=120
BROQUEL_RP_ID=cofre.seudominio
BROQUEL_ORIGEM=https://cofre.seudominio
BROQUEL_IPS=
```

`BROQUEL_RP_ID` é o domínio, sem `https://`. `BROQUEL_ORIGEM` é a origem completa do cofre web. Os dois têm de bater com o endereço que o navegador usa, senão a chave FIDO2 recusa. `BROQUEL_IPS` vazio não filtra. Se preencher, só esses IPs falam com o servidor, separados por vírgula.

```sh
php artisan migrate --force
php artisan config:cache
php artisan route:cache
sudo chown -R www-data:www-data storage bootstrap/cache
```

Nginx, em `/etc/nginx/sites-available/broquel`:

```nginx
server {
    listen 80;
    server_name cofre.seudominio;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name cofre.seudominio;
    root /var/www/broquel/servidor/public;
    index index.php;

    ssl_certificate     /etc/letsencrypt/live/cofre.seudominio/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/cofre.seudominio/privkey.pem;

    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options DENY always;
    add_header Referrer-Policy no-referrer always;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location ~ \.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/run/php/php8.2-fpm.sock;
        fastcgi_param HTTPS on;
    }

    location ~ /\. {
        deny all;
    }
}
```

O certificado:

```sh
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d cofre.seudominio
```

Firewall:

```sh
sudo ufw default deny incoming
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

Confira que a porta do MySQL e a do PHP-FPM não aparecem em `ss -lnt`. As duas ficam em localhost.

## aaPanel

O caminho é o mesmo, com os cliques do painel:

1. Instale o aaPanel e, nele, Nginx, MySQL (ou Postgres) e PHP 8.2.
2. No PHP 8.2, ligue as extensões `sodium`, `intl`, `gmp`, `mbstring`, `curl` e `pdo_mysql`.
3. Crie o site com o domínio, raiz em `servidor/public`, e o PHP 8.2.
4. Peça o certificado Let's Encrypt no próprio site e force HTTPS.
5. Crie o banco e o usuário, preencha o `.env` e rode `composer install`, `key:generate` e `migrate` no terminal do painel, dentro de `servidor/`.
6. No firewall do aaPanel, deixe só 22, 80 e 443. Não publique a porta do banco.

## O que conferir depois

`https://cofre.seudominio/` responde `{"servico":"broquel","versao":1}`. `APP_DEBUG` continua `false`. Um `GET` em `/v1/cofre/` com um id inventado não devolve cabeçalho. Os logs em `storage/logs` não devem ser `debug`.

O primeiro cofre é criado pelo aplicativo, que ainda é a etapa 3, ou por um cliente que já fale esta API. No primeiro acesso não há segundo fator. Com a sessão aberta, o cofre web (etapa 4) cadastra o TOTP ou a chave FIDO2. A partir daí todo login pede o segundo fator. Os oito códigos de recuperação aparecem uma vez. Guarde-os fora do servidor.

## O que ainda não está feito

- Não há DNS, certificado nem VPS criados daqui. Isso é na máquina de produção.
- O aplicativo Android e o cofre web ainda não existem, então ninguém sincroniza até as etapas 3 e 4.
- Não há fila, e-mail nem painel de administração. Não precisa.
- A cerimônia FIDO2 completa depende de um navegador e de uma chave de verdade. O teste automático confere que uma cerimônia forjada é recusada e que o servidor emite o desafio.
