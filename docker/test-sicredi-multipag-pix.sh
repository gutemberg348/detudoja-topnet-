#!/usr/bin/env bash
set -euo pipefail

# Consulta ou solicita um pagamento Pix exclusivamente no Sandbox Multipag.
repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_dir"

certificate_input="${1:-}"
key_input="${2:-}"
chain_input="${3:-}"
mode="${4:-}"
transaction_id="${5:-}"
confirmation="${6:-}"

if [[ $# -lt 4 || $# -gt 6 || -z "$certificate_input" || -z "$key_input" || -z "$chain_input" ]]; then
  printf 'Uso: bash docker/test-sicredi-multipag-pix.sh CERTIFICADO_CER CHAVE_KEY CADEIA_CER consultar|enviar ID_TRANSACAO [CONFIRMO_SANDBOX] ou consultar-exemplo ou enviar-exemplo CONFIRMO_SANDBOX\n' >&2
  exit 2
fi
case "$mode" in
  enviar-exemplo)
    if [[ $# -ne 5 || "$transaction_id" != CONFIRMO_SANDBOX ]]; then printf 'Use enviar-exemplo CONFIRMO_SANDBOX (sem ID).\n' >&2; exit 2; fi
    confirmation="$transaction_id"
    transaction_id=""
    ;;
  consultar-exemplo) if [[ $# -ne 4 ]]; then printf 'consultar-exemplo nao aceita ID nem confirmacao.\n' >&2; exit 2; fi ;;
  consultar) if [[ $# -ne 5 ]]; then printf 'Consulta nao aceita confirmacao de envio.\n' >&2; exit 2; fi ;;
  enviar) if [[ "$confirmation" != CONFIRMO_SANDBOX ]]; then printf 'Para enviar em Sandbox, acrescente CONFIRMO_SANDBOX.\n' >&2; exit 2; fi ;;
  *) printf 'Acao invalida: use consultar, consultar-exemplo, enviar ou enviar-exemplo.\n' >&2; exit 2 ;;
esac
if [[ "$mode" != *-exemplo && ! "$transaction_id" =~ ^[a-zA-Z0-9:-]{1,100}$ ]]; then
  printf 'ID_TRANSACAO invalido (use letras, numeros, : ou -; ate 100 caracteres).\n' >&2
  exit 2
fi
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

# Reutiliza as dependencias da imagem e carrega o diagnostico do checkout atual.
# Atualizacoes destes arquivos JS nao exigem rebuild da imagem inteira.
script_args=("$mode")
if [[ "$mode" != *-exemplo ]]; then script_args+=("$transaction_id"); fi
docker run --rm --read-only --cap-drop ALL --security-opt no-new-privileges \
  --user 0:0 \
  --env-file "$repo_dir/apps/api/.env" \
  --env SICREDI_MULTIPAG_ENV=sandbox \
  --env "SICREDI_MULTIPAG_TEST_CONFIRM=$confirmation" \
  --env SICREDI_MULTIPAG_CERT_PATH=/run/sicredi/client.cer \
  --env SICREDI_MULTIPAG_KEY_PATH=/run/sicredi/client.key \
  --env SICREDI_MULTIPAG_CHAIN_PATH=/run/sicredi/chain.cer \
  --mount "type=bind,source=$certificate_file,target=/run/sicredi/client.cer,readonly" \
  --mount "type=bind,source=$key_file,target=/run/sicredi/client.key,readonly" \
  --mount "type=bind,source=$chain_file,target=/run/sicredi/chain.cer,readonly" \
  --mount "type=bind,source=$repo_dir/apps/api/scripts/sicredi-multipag-transfer-smoke.js,target=/app/apps/api/scripts/sicredi-multipag-transfer-smoke.js,readonly" \
  --mount "type=bind,source=$repo_dir/apps/api/src/modules/payments/sicredi,target=/app/apps/api/src/modules/payments/sicredi,readonly" \
  "$api_image" node /app/apps/api/scripts/sicredi-multipag-transfer-smoke.js "${script_args[@]}"
