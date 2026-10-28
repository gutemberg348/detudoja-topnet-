#!/usr/bin/env bash
set -euo pipefail

# Testes com o par MULTIPAG ja existente em apps/api/.env da VPS.
# Somente sandbox. Nenhum POST de pagamento, alteracao do app ou acesso ao DB.
repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_dir"

if [[ $# -ne 0 ]]; then
  printf 'Uso: bash docker/test-sicredi-multipag-suite.sh (somente sandbox, sem envio)\n' >&2
  exit 2
fi
cert_dir="${SICREDI_MULTIPAG_TEST_CERT_DIR:-/etc/detudoja/certificados}"
cert="$cert_dir/sicredi-multipag.cer"
key="$cert_dir/sicredi-multipag.key"
chain="$cert_dir/sicredi-multipag-chain.cer"
for file in "$cert" "$key" "$chain" "$repo_dir/apps/api/.env"; do
  if [[ ! -f "$file" ]]; then
    printf '[multipag-suite] Arquivo necessario ausente: %s\n' "$file" >&2
    exit 1
  fi
done

printf '[multipag-suite] Sandbox Multipag: usa SICREDI_MULTIPAG_CLIENT_ID/SECRET do apps/api/.env. Nao usa as credenciais da API Pix.\n'
printf '[multipag-suite] Nenhum pagamento sera enviado. O escopo pagar abaixo solicita somente um token.\n'
failed=0
consultation_ok=false
printf '\n[multipag-suite] 1/3 Autenticar multipag.pix.consultar\n'
if bash docker/test-sicredi-multipag.sh "$cert" "$key" sandbox "$chain" consultar; then
  consultation_ok=true
else
  failed=$((failed + 1))
fi
printf '\n[multipag-suite] 2/3 Autenticar multipag.pix.pagar (sem enviar Pix)\n'
if ! bash docker/test-sicredi-multipag.sh "$cert" "$key" sandbox "$chain" pagar; then
  failed=$((failed + 1))
fi
if [[ "$consultation_ok" == true ]]; then
  printf '\n[multipag-suite] 3/3 Consultar exemplo publico 0910F3HT1\n'
  if ! bash docker/test-sicredi-multipag-pix.sh "$cert" "$key" "$chain" consultar-exemplo; then
    failed=$((failed + 1))
  fi
else
  printf '\n[multipag-suite] Consulta do exemplo pulada porque a autenticacao de consulta falhou.\n'
fi
if [[ "$failed" -gt 0 ]]; then
  printf '\n[multipag-suite] Houve %s etapa(s) com falha. Envie a saida do diagnostico, sem copiar o .env.\n' "$failed" >&2
  exit 1
fi
printf '\n[multipag-suite] Tres etapas concluidas. Valida autenticacao e consulta do contrato sandbox; nao comprova envio ou liquidacao em producao.\n'
