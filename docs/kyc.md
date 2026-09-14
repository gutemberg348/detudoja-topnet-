# KYC automatico proprio

Ultima atualizacao: 2026-09-14

## Estado atual

O aplicativo captura o documento e a selfie somente pela camera e a API faz a
triagem automaticamente usando duas bibliotecas locais. Nesta fase de
calibracao, uma imagem tecnicamente valida pode ficar em `EM_ANALISE` para
receber uma decisao rotulada no painel antes de liberar `TIER_2`:

- `tesseract.js` com o pacote portugues `@tesseract.js-data/por` para OCR;
- `@vladmandic/human` com TensorFlow.js/WASM para detectar rosto, criar o
  descritor facial, comparar documento/selfie e calcular antisspoof e liveness
  passivos.

Os modelos e o idioma ficam dentro da imagem Docker. Uma verificacao nao
depende de servico externo nem baixa modelos da internet em tempo de execucao.

## Jornada do usuario

1. O usuario informa um CPF valido na conta.
2. Escolhe RG, CNH ou RNE em `KycVerificationScreen`.
3. RG/RNE exigem frente, verso e selfie. CNH exige frente e selfie; verso e
   opcional.
4. Todas as imagens sao obtidas pela camera. A galeria foi removida para
   reduzir reutilizacao de fotos prontas.
5. A API normaliza e salva as imagens, cria a solicitacao como `EM_ANALISE` e
   responde `202` sem aguardar OCR ou reconhecimento facial.
6. Um worker duravel busca o envio no banco e executa OCR e biometria em
   segundo plano. O aplicativo consulta o estado a cada quatro segundos.
7. Evidencia objetiva de fraude ou divergencia (imagem usada por outra conta,
   mais de um rosto, rostos divergentes com deteccao confiavel, antisspoof ou
   prova de vida insuficiente) termina como `REPROVADO`.
8. Tudo que o motor nao consegue reconhecer com seguranca fica em
   `EM_ANALISE`: rosto ausente ou distante, deteccao facial fraca, CPF/nome/tipo
   nao lidos, OCR baixo, imagem ruim ou falha tecnica. O analista ve as fotos e
   decide no painel; nenhum desses casos libera `TIER_2` sozinho.
9. Reprovacao mostra um motivo objetivo e permite novo envio, respeitando o
   limite de tres tentativas por hora.
10. Somente a aprovacao automatica habilitada ou uma decisao registrada no
   painel promove para `TIER_2` e sincroniza lojista, vendedor e indicacao
   recebida na mesma transacao.
11. Operacoes comerciais revalidam `TIER_2` e KYC `APROVADO` no backend. Sem
    isso, a loja sai da vitrine e ficam bloqueados venda autonoma, cobranca QR,
    proposta/pedido, prestacao de servico e aceite de corrida. Um CNPJ valido
    nao remove a obrigacao de o representante concluir o `TIER_2`.

## Regras automaticas

Para aprovar, todas as verificacoes abaixo precisam passar:

- assinatura real, dimensoes e leitura valida da imagem;
- CPF cadastrado encontrado pelo OCR no documento;
- pelo menos 80% dos termos relevantes do nome encontrados no documento;
- marcador compativel com RG, CNH ou RNE e OCR com confianca minima de 65%;
- rosto detectado no documento e selfie com confianca minima de 60%;
- exatamente um rosto, com tamanho suficiente, na selfie;
- selfie acima dos limites de antisspoof e liveness passivos;
- similaridade entre o descritor do documento e da selfie;
- nenhuma imagem reutilizada por outra conta.

CPF, nome, tipo documental ou rosto nao confirmados nao provocam reprovacao
automatica isoladamente. Resultado inconclusivo segue para revisao humana para
evitar falsa recusa. Falha interna do motor tambem preserva o envio em
`EM_ANALISE`.

A politica implementada separa tres resultados:

- `APROVADO`: todos os sinais obrigatorios ficaram consistentes e acima dos
  limites; a promocao para `TIER_2` ocorre na mesma transacao;
- `EM_ANALISE`: o motor nao teve informacao suficiente; a conta continua em
  `TIER_1` e aparece na fila administrativa;
- `REPROVADO`: houve um sinal forte e mensuravel de fraude ou divergencia, nao
  apenas ausencia de reconhecimento.

O texto integral extraido e os vetores biometricos nao sao gravados. A
`triagem_json` guarda somente resultado, codigos de falha, metricas, limites e
versao do motor. Isso reduz a quantidade de dado sensivel persistido.

## Configuracao

```dotenv
KYC_MODE=automatic
KYC_AUTOMATIC_APPROVAL_ENABLED=false
KYC_CALIBRATION_SAMPLE_RATE=1.00
KYC_FACE_DETECTION_THRESHOLD=0.60
KYC_FACE_MATCH_THRESHOLD=0.65
KYC_LIVENESS_THRESHOLD=0.50
KYC_ANTISPOOF_THRESHOLD=0.60
KYC_MINIMUM_FACE_AREA=0.06
KYC_NAME_MATCH_THRESHOLD=0.80
KYC_OCR_CONFIDENCE_THRESHOLD=0.65
KYC_WORKER_ENABLED=true
KYC_PRIVATE_DIR=
```

`KYC_MODE=manual` existe somente para contingencia e testes dos registros
legados. `KYC_AUTOMATIC_APPROVAL_ENABLED=false` e
`KYC_CALIBRATION_SAMPLE_RATE=1.00` sao a configuracao inicial segura para
producao: toda submissao sem falha vai para a fila de calibracao e nao recebe
`TIER_2` so pelo motor local.

Em homologacao controlada, o caminho automatico pode ser exercitado com
`KYC_AUTOMATIC_APPROVAL_ENABLED=true` e `KYC_CALIBRATION_SAMPLE_RATE=0`. Isso
nao significa que os limites estejam calibrados para producao.

Para habilitar a aprovacao automatica, usar somente documentos reais com
autorizacao expressa, registrar no painel o resultado correto e medir separado
por tipo de documento: taxa de falso aceite, falsa recusa, OCR abaixo do limite
e reprovacoes por prova de vida. So apos um volume representativo e revisado,
reduzir gradualmente `KYC_CALIBRATION_SAMPLE_RATE` e ativar
`KYC_AUTOMATIC_APPROVAL_ENABLED=true`. Limites nunca devem ser reduzidos apenas
para facilitar um teste.

## Armazenamento e acesso

- Os arquivos ficam em `KYC_PRIVATE_DIR` ou `storage/private/kyc`.
- A pasta nao passa por `express.static` e nao possui URL publica.
- O Docker usa o volume persistente `kyc_private_data`.
- O container `kyc-worker` processa OCR/biometria separado do processo HTTP da
  API. Em execucao local, o worker pode rodar dentro da API.
- Imagens so podem ser lidas por rota administrativa autenticada e usam
  `Cache-Control: private, no-store`.
- Cada imagem aceita no maximo 8 MB. O rate limit usa Redis quando conectado.
- SHA-256 identifica repeticao sem comparar o conteudo visual bruto.

## Banco e painel

- `kyc_usuarios` guarda o estado consolidado do usuario.
- `solicitacoes_kyc` guarda cada tentativa, decisao automatica, motivo e
  metricas sem OCR integral ou embedding facial.
- `triagem_json.processingStatus` registra `PENDENTE`, `PROCESSANDO`,
  `CONCLUIDO`, `FALHA` ou `REVISAO_MANUAL`. Processamentos interrompidos por
  reinicio sao recuperados pelo worker apos o prazo de seguranca.
- `arquivos_kyc` guarda metadados e caminho privado das evidencias.
- A decisao e o estado de usuario/lojista/vendedor sao gravados numa unica
  transacao Prisma.
- O painel `KYC` tambem atende a fila de calibracao. A justificativa cria o
  dado rotulado usado para medir a qualidade do motor; ela nao expoe os arquivos
  para usuarios comuns.
- Frente, verso e selfie aparecem como miniaturas no detalhe da solicitacao e
  podem ser ampliadas em tela cheia. O navegador recebe a imagem por `Blob`
  autenticado, cria uma URL temporaria em memoria e a revoga ao fechar a tela.
- O analista precisa registrar justificativa antes de `Aprovar KYC` ou
  `Reprovar`. Casos aprovados tambem podem ser revogados e bloqueiam conta,
  loja, prestador, motoboy e sessoes ativas.

## Limite de seguranca desta versao

O `Human` executa antisspoof e liveness **passivos sobre uma foto**. Isso e
melhor que comparar arquivos manualmente, mas nao equivale a uma prova de vida
ativa com video/desafio nem valida autenticidade documental em fonte oficial.
Por isso o modo de calibracao bloqueia `TIER_2` por padrao em producao.

Antes de abrir saques e altos limites ao publico, a recomendacao e substituir
o motor local por um provedor homologado, mantendo a interface atual como
adaptador. A opcao mais aderente ao React Native avaliada foi a idwall, que
oferece captura, OCR, documentoscopia, Face Match e Face Liveness, mas exige
contrato/token e atualmente nao disponibiliza sandbox publico. AWS Rekognition
Face Liveness tambem exige captura de video e deve ser combinado com OCR e
validacao documental separados.

## Rotas

Aplicativo:

- `GET /api/app/kyc`
- `POST /api/app/kyc/submissions` com `multipart/form-data`

Auditoria administrativa:

- `GET /api/admin/kyc/submissions`
- `GET /api/admin/kyc/submissions/:id`
- `GET /api/admin/kyc/submissions/:id/files/:fileId`
- `POST /api/admin/kyc/submissions/:id/approve` para decisao humana pendente
- `POST /api/admin/kyc/submissions/:id/reject` para decisao humana pendente
- `POST /api/admin/kyc/submissions/:id/revoke` para bloquear KYC aprovado

## Verificacao executada

- motor WASM carregou localmente com detector, descritor, antisspoof e
  liveness;
- OCR portugues carregou do pacote local, sem CDN;
- teste negativo confirmou CPF/nome por OCR e encaminhou selfie sem rosto para
  revisao humana;
- teste positivo controlado confirmou comparacao do mesmo rosto com 98%;
- teste HTTP confirmou que selfie sem rosto permanece em `EM_ANALISE` e o
  teste de politica confirma que nenhum caso inconclusivo libera `TIER_2`;
- schema Prisma valido e build do painel aprovado.
