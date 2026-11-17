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

## Cofre web

O cofre no navegador é um site estático. A cifra acontece no navegador, com a mesma biblioteca da etapa 1. O servidor continua recebendo só o cabeçalho e os blobs.

O build já pode estar em `servidor/public/app/`. Para gerar de novo, no computador que tem Node.js 22:

```sh
cd web
npm ci
npm test
npm run build
```

Isso escreve os arquivos em `servidor/public/app/`. O Nginx, com a raiz em `servidor/public`, entrega `https://cofre.seudominio/app/`. A API continua em `/v1`, na mesma origem. Não há campo de servidor no site: a política de conteúdo só deixa a página falar com ela mesma.

No bloco `server` do Nginx, junto das outras rotas:

```nginx
location /app/ {
    add_header Content-Security-Policy "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self'; connect-src 'self'; worker-src 'none'; manifest-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'" always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options DENY always;
    add_header Referrer-Policy no-referrer always;
    add_header Cache-Control "no-store" always;
    try_files $uri $uri/ /app/index.html;
}
```

`wasm-unsafe-eval` existe porque o libsodium sobe o WebAssembly. Não há `unsafe-inline` e não há script de outro site. O `index.html` também traz essa política e a integridade (SRI) dos arquivos. A chave do cofre fica só na memória e some ao travar ou ao fechar a aba. O navegador pode guardar o cabeçalho e os itens cifrados no IndexedDB. Isso não é a senha nem a chave.

`BROQUEL_RP_ID` e `BROQUEL_ORIGEM` têm de ser o domínio e a origem em que o site abre, senão a chave FIDO2 recusa. Exemplo: `cofre.seudominio` e `https://cofre.seudominio`.

No celular, o identificador de 32 caracteres hexadecimais aparece nos ajustes e na tela do kit. No site, cole esse identificador em "Abrir cofre existente" e use a mesma senha mestra. O que for criado num lado aparece no outro depois de sincronizar.

## Aplicativo Android, versão de release

O CI publica o APK de debug, que ainda aceita HTTP para testar um servidor local. A versão de release recusa HTTP, liga o R8 e não entra em backup da nuvem nem na transferência do aparelho.

Para assinar de verdade, crie a loja fora do repositório e não a envie ao Git:

```sh
keytool -genkeypair -keystore broquel.keystore -alias broquel -keyalg RSA -keysize 3072 -validity 3650
```

Guarde a senha fora do Git. Na hora de montar:

```sh
export BROQUEL_KEYSTORE=/caminho/broquel.keystore
export BROQUEL_KEYSTORE_SENHA='a senha da loja'
export BROQUEL_KEY_ALIAS=broquel
export BROQUEL_KEY_SENHA='a senha da chave'
cd android && ./gradlew :app:assembleRelease
```

O APK sai em `android/app/build/outputs/apk/release/`. Sem essas variáveis o Gradle ainda gera o pacote ofuscado, mas sem assinatura de publicação. Não use o APK de debug no dia a dia: ele é depurável e aceita endereço sem HTTPS.

## aaPanel

O caminho é o mesmo, com os cliques do painel:

1. Instale o aaPanel e, nele, Nginx, MySQL (ou Postgres) e PHP 8.2.
2. No PHP 8.2, ligue as extensões `sodium`, `intl`, `gmp`, `mbstring`, `curl` e `pdo_mysql`.
3. Crie o site com o domínio, raiz em `servidor/public`, e o PHP 8.2.
4. Peça o certificado Let's Encrypt no próprio site e force HTTPS.
5. Crie o banco e o usuário, preencha o `.env` e rode `composer install`, `key:generate` e `migrate` no terminal do painel, dentro de `servidor/`.
6. No firewall do aaPanel, deixe só 22, 80 e 443. Não publique a porta do banco.

## O que conferir depois

`https://cofre.seudominio/` responde `{"servico":"broquel","versao":1}`. `https://cofre.seudominio/app/` abre o Broquel. `APP_DEBUG` continua `false`. Um `GET` em `/v1/cofre/` com um id inventado não devolve cabeçalho. Os logs em `storage/logs` não devem ser `debug`.

O primeiro cofre pode nascer no aplicativo ou no site. No primeiro acesso não há segundo fator. Com a sessão aberta, o site cadastra o TOTP ou a chave FIDO2. A partir daí todo login, no site e no aplicativo, pede o segundo fator. Os oito códigos de recuperação aparecem uma vez. Guarde-os fora do servidor.

## O que ainda não está feito

- Não há DNS, certificado nem VPS criados daqui. Isso é na máquina de produção.
- Não há fila, e-mail nem painel de administração. Não precisa.
- A cerimônia FIDO2 completa depende de um navegador e de uma chave de verdade. O teste automático confere que uma cerimônia forjada é recusada e que o servidor emite o desafio. O site chama a API de cadastro e de login dessa chave.
