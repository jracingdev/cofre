#!/bin/sh
set -eu
raiz=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
cd "$raiz/packages/cripto"
npm test
npm run typecheck
cd "$raiz/php"
composer test
