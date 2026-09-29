#!/usr/bin/env bash
set -euo pipefail

# Uso: bash docker/test-sicredi-multipag.sh CERTIFICADO_CER [CHAVE_KEY] [sandbox|production] [CADEIA_CER] [consultar|pagar]
repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_dir"

certificate_input="${1:-}"
key_input="${2:-/etc/detudoja/certificados/sicredi-multipag.key}"
target_environment="${3:-sandbox}"
chain_input="${4:-}"
scope_mode="${5:-consultar}"

if [[ -z "$certificate_input" || $# -gt 5 ]]; then
  printf 'Uso: bash docker/test-sicredi-multipag.sh CERTIFICADO_CER [CHAVE_KEY] [sandbox|production] [CADEIA_CER] [consultar|pagar]\n' >&2
  exit 2
fi

case "$target_environment" in
  sandbox|production) ;;
  *) printf 'Ambiente invalido: use sandbox ou production.\n' >&2; exit 2 ;;
esac
case "$scope_mode" in
  consultar) target_scope=multipag.pix.consultar ;;
  pagar) target_scope=multipag.pix.pagar ;;
  *) printf 'Escopo invalido: use consultar ou pagar.\n' >&2; exit 2 ;;
esac

if [[ ! -f "$certificate_input" || ! -f "$key_input" ]]; then
  printf 'Certificado assinado ou chave privada nao encontrado no servidor.\n' >&2
  exit 1
fi
if [[ -n "$chain_input" && ! -f "$chain_input" ]]; then
  printf 'Arquivo da cadeia Sicredi nao encontrado no servidor.\n' >&2
  exit 1
fi
if [[ ! -f apps/api/.env ]]; then
  printf 'Configure SICREDI_MULTIPAG_CLIENT_ID e SICREDI_MULTIPAG_CLIENT_SECRET em apps/api/.env na VPS.\n' >&2
  exit 1
fi

certificate_file="$(realpath -e -- "$certificate_input")"
key_file="$(realpath -e -- "$key_input")"
if [[ -n "$chain_input" ]]; then
  chain_file="$(realpath -e -- "$chain_input")"
fi
if [[ "$certificate_file" == "$key_file" ]]; then
  printf 'Certificado e chave precisam ser arquivos diferentes.\n' >&2
  exit 1
fi

# Usa a imagem construida para o servico API, mesmo se o container ativo ainda
# estiver numa versao anterior. Nao inicia a API nem monta seus volumes de dados.
api_image="$(docker compose config --images | grep -m 1 '^brasil-cashback-api:' || true)"
if [[ -z "$api_image" ]] || ! docker image inspect "$api_image" >/dev/null 2>&1; then
  printf 'Imagem da API ausente. Execute docker compose build api antes do teste.\n' >&2
  exit 1
fi

docker_args=(
  --rm --read-only --cap-drop ALL --security-opt no-new-privileges
  --user 0:0
  --env-file "$repo_dir/apps/api/.env"
  --env "SICREDI_MULTIPAG_ENV=$target_environment"
  --env "SICREDI_MULTIPAG_SCOPE=$target_scope"
  --env SICREDI_MULTIPAG_CERT_PATH=/run/sicredi/client.cer
  --env SICREDI_MULTIPAG_KEY_PATH=/run/sicredi/client.key
  --env SICREDI_MULTIPAG_PFX_PATH=
  --mount "type=bind,source=$certificate_file,target=/run/sicredi/client.cer,readonly"
  --mount "type=bind,source=$key_file,target=/run/sicredi/client.key,readonly"
)
if [[ -n "$chain_input" ]]; then
  docker_args+=(
    --env SICREDI_MULTIPAG_CHAIN_PATH=/run/sicredi/chain.cer
    --mount "type=bind,source=$chain_file,target=/run/sicredi/chain.cer,readonly"
  )
else
  docker_args+=(--env SICREDI_MULTIPAG_CHAIN_PATH=)
fi

docker run "${docker_args[@]}" \
  "$api_image" node /app/apps/api/scripts/sicredi-multipag-smoke.js
