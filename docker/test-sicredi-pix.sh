#!/usr/bin/env bash
set -euo pipefail

# Autenticacao OAuth2/mTLS da API Pix de recebimento. Nao cria cobranca.
repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_dir"

certificate_input="${1:-}"
key_input="${2:-/etc/detudoja/certificados/sicredi-multipag.key}"
chain_input="${3:-}"
scope="${4:-cob.read}"

if [[ -z "$certificate_input" || -z "$chain_input" || $# -gt 4 ]]; then
  printf 'Uso: bash docker/test-sicredi-pix.sh CERTIFICADO_CER CHAVE_KEY CADEIA_CER [cob.read|cob.write|pix.read|pix.write]\n' >&2
  exit 2
fi
case "$scope" in
  cob.read|cob.write|pix.read|pix.write) ;;
  *) printf 'Escopo de teste Pix invalido.\n' >&2; exit 2 ;;
esac
if [[ ! -f "$certificate_input" || ! -f "$key_input" || ! -f "$chain_input" || ! -f apps/api/.env ]]; then
  printf 'Certificado, chave, cadeia ou apps/api/.env ausente.\n' >&2
  exit 1
fi

certificate_file="$(realpath -e -- "$certificate_input")"
key_file="$(realpath -e -- "$key_input")"
chain_file="$(realpath -e -- "$chain_input")"
api_image="$(docker compose config --images | grep -m 1 '^brasil-cashback-api:' || true)"
if [[ -z "$api_image" ]] || ! docker image inspect "$api_image" >/dev/null 2>&1; then
  printf 'Imagem da API ausente. Execute docker compose build api.\n' >&2
  exit 1
fi

docker run --rm --read-only --cap-drop ALL --security-opt no-new-privileges \
  --user 0:0 \
  --env-file "$repo_dir/apps/api/.env" \
  --env "SICREDI_PIX_SMOKE_SCOPE=$scope" \
  --env SICREDI_PIX_CERT_PATH=/run/sicredi/client.cer \
  --env SICREDI_PIX_KEY_PATH=/run/sicredi/client.key \
  --env SICREDI_PIX_CHAIN_PATH=/run/sicredi/chain.cer \
  --mount "type=bind,source=$certificate_file,target=/run/sicredi/client.cer,readonly" \
  --mount "type=bind,source=$key_file,target=/run/sicredi/client.key,readonly" \
  --mount "type=bind,source=$chain_file,target=/run/sicredi/chain.cer,readonly" \
  "$api_image" node /app/apps/api/scripts/sicredi-pix-smoke.js
