#!/usr/bin/env bash
# Confere se o site publicado é igual ao build deste repositório.
# Uso: scripts/conferir-web.sh [origem]   (padrão: https://broquel.jracing.dev.br)
# Rode com o repositório baixado do GitHub, não do servidor que está sendo conferido.
set -euo pipefail
origem="${1:-https://broquel.jracing.dev.br}"
lista="$(dirname "$0")/../web/BUILD-SHA256.txt"
falhas=0
while read -r esperado arquivo; do
  [ -n "$arquivo" ] || continue
  obtido="$(curl -fsS --proto '=https' "$origem/app/$arquivo" | sha256sum | cut -d' ' -f1)" || obtido="erro"
  if [ "$obtido" = "$esperado" ]; then
    echo "ok        $arquivo"
  else
    echo "DIFERENTE $arquivo"
    falhas=$((falhas + 1))
  fi
done < <(tr -d '\r' < "$lista")
if [ "$falhas" -gt 0 ]; then
  echo "O site publicado NÃO bate com o build do repositório ($falhas arquivo(s))." >&2
  exit 1
fi
echo "O site publicado bate com o build do repositório."
