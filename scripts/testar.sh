#!/bin/sh
set -eu
raiz=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
cd "$raiz/packages/cripto"
npm test
npm run typecheck
cd "$raiz/web"
npm test
npm run typecheck
cd "$raiz/php"
composer test
cd "$raiz/servidor"
php artisan test --colors=never
if [ -x "$raiz/android/gradlew" ]; then
  cd "$raiz/android"
  ./gradlew :cripto:test :app:testDebugUnitTest
fi
