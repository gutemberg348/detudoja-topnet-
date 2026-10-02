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
for filename in sicredi-multipag.cer sicredi-multipag.key sicredi-multipag-chain.cer; do
  if [[ ! -f "$cert_dir/$filename" ]]; then
    printf 'Arquivo ausente: %s/%s\n' "$cert_dir" "$filename" >&2
    exit 1
  fi
done
cert_dir="$(realpath -e -- "$cert_dir")"
env_args=()
if [[ -f apps/api/.env ]]; then env_args+=(--env-file "$repo_dir/apps/api/.env"); fi
test_env="${SICREDI_PIX_TEST_ENV_FILE:-/etc/detudoja/sicredi-pix-sandbox.env}"
if [[ -f "$test_env" ]]; then
  env_args+=(--env-file "$(realpath -e -- "$test_env")")
elif [[ -n "${SICREDI_PIX_TEST_ENV_FILE:-}" ]]; then
  printf 'Arquivo de teste informado nao existe: %s\n' "$test_env" >&2
  exit 1
fi

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
  "${env_args[@]}" \
  --env SICREDI_PIX_TEST_CERT_PATH=/run/sicredi/sicredi-multipag.cer \
  --env SICREDI_PIX_TEST_KEY_PATH=/run/sicredi/sicredi-multipag.key \
  --env SICREDI_PIX_TEST_CHAIN_PATH=/run/sicredi/sicredi-multipag-chain.cer \
  --mount "type=bind,source=$cert_dir,target=/run/sicredi,readonly" \
  --mount "type=bind,source=$repo_dir/apps/api/scripts/sicredi-pix-sandbox.js,target=/app/apps/api/scripts/sicredi-pix-sandbox.js,readonly" \
  --mount "type=bind,source=$repo_dir/apps/api/src/modules/payments/sicredi,target=/app/apps/api/src/modules/payments/sicredi,readonly" \
  --mount "type=bind,source=$repo_dir/apps/api/src/utils/errors.js,target=/app/apps/api/src/utils/errors.js,readonly" \
  "$api_image" /app/apps/api/scripts/sicredi-pix-sandbox.js "$@"
