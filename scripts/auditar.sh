#!/bin/sh
# Confere vulnerabilidades conhecidas nas dependências que vão para produção.
set -eu
raiz=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)

cd "$raiz/php"
composer audit --no-interaction --locked

cd "$raiz/servidor"
composer audit --no-interaction --locked

cd "$raiz/packages/cripto"
npm audit --omit=dev

cd "$raiz/web"
npm audit --omit=dev

python3 "$raiz/scripts/auditar-gradle.py"
