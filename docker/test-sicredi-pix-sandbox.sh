#!/usr/bin/env bash
set -euo pipefail

# Teste isolado: reutiliza a imagem instalada, sem compose up/build ou banco.
repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_dir"
if [[ $# -gt 2 ]]; then
  printf 'Uso: bash docker/test-sicredi-pix-sandbox.sh diagnostico|autenticar|criar|consultar [ESCOPO|TXID]\n' >&2
  exit 2
fi
case "${1:-diagnostico}" in
  diagnostico|autenticar|criar|consultar) ;;
  *) printf 'Modo desconhecido. Use diagnostico, autenticar, criar ou consultar.\n' >&2; exit 2 ;;
esac

cert_dir="${SICREDI_PIX_TEST_CERT_DIR:-/etc/detudoja/certificados}"
certificate_file="${SICREDI_PIX_TEST_CERT_FILE:-$cert_dir/sicredi-multipag.cer}"
key_file="${SICREDI_PIX_TEST_KEY_FILE:-$cert_dir/sicredi-multipag.key}"
chain_file="${SICREDI_PIX_TEST_CHAIN_FILE:-$cert_dir/sicredi-multipag-chain.cer}"
for filename in "$certificate_file" "$key_file" "$chain_file"; do
  if [[ ! -f "$filename" ]]; then
    printf 'Arquivo ausente: %s\n' "$filename" >&2
    exit 1
  fi
done
certificate_file="$(realpath -e -- "$certificate_file")"
key_file="$(realpath -e -- "$key_file")"
chain_file="$(realpath -e -- "$chain_file")"
test_env="${SICREDI_PIX_TEST_ENV_FILE:-/etc/detudoja/sicredi-pix-sandbox.env}"
if [[ ! -f "$test_env" ]]; then
  printf 'Crie %s a partir de docker/sicredi-pix-sandbox.env.example e preencha o novo par Pix.\n' "$test_env" >&2
  exit 1
fi
test_env="$(realpath -e -- "$test_env")"

api_image="${SICREDI_PIX_TEST_IMAGE:-}"
if [[ -z "$api_image" ]]; then
  api_image="$(docker compose config --images | awk '/^brasil-cashback-api:/ && !found {print; found=1}')"
fi
if [[ -z "$api_image" ]] || ! docker image inspect "$api_image" >/dev/null 2>&1; then
  printf 'Imagem local da API ausente. Informe SICREDI_PIX_TEST_IMAGE com uma imagem ja instalada.\n' >&2
  exit 1
fi

docker run --rm --read-only --cap-drop ALL --security-opt no-new-privileges \
  --user 0:0 --entrypoint node \
  --env-file "$test_env" \
  --env SICREDI_PIX_TEST_CERT_PATH=/run/sicredi/client.cer \
  --env SICREDI_PIX_TEST_KEY_PATH=/run/sicredi/client.key \
  --env SICREDI_PIX_TEST_CHAIN_PATH=/run/sicredi/chain.cer \
  --mount "type=bind,source=$certificate_file,target=/run/sicredi/client.cer,readonly" \
  --mount "type=bind,source=$key_file,target=/run/sicredi/client.key,readonly" \
  --mount "type=bind,source=$chain_file,target=/run/sicredi/chain.cer,readonly" \
  --mount "type=bind,source=$repo_dir/apps/api/scripts/sicredi-pix-sandbox.js,target=/app/apps/api/scripts/sicredi-pix-sandbox.js,readonly" \
  --mount "type=bind,source=$repo_dir/apps/api/src/modules/payments/sicredi,target=/app/apps/api/src/modules/payments/sicredi,readonly" \
  --mount "type=bind,source=$repo_dir/apps/api/src/utils/errors.js,target=/app/apps/api/src/utils/errors.js,readonly" \
  "$api_image" /app/apps/api/scripts/sicredi-pix-sandbox.js "$@"
