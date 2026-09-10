# KYC automatico proprio

Ultima atualizacao: 2026-09-03

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
5. A API normaliza as imagens e executa OCR e reconhecimento facial.
6. Falha objetiva (CPF ausente, selfie sem rosto, foto reutilizada, rosto
   divergente ou prova de vida insuficiente) termina como `REPROVADO`.
7. Caso sem falha objetiva, mas selecionado para calibracao, com OCR/tipo de
   documento/qualidade inconclusivos ou com aprovacao automatica desligada,
   termina como `EM_ANALISE`. Nao libera saque nem limite alto enquanto isso.
8. Reprovacao mostra um motivo objetivo e permite novo envio, respeitando o
   limite de tres tentativas por hora.
9. Somente a aprovacao automatica habilitada ou uma decisao registrada no
   painel promove para `TIER_2` e sincroniza lojista, vendedor e indicacao
   recebida na mesma transacao.

## Regras automaticas

Para aprovar, todas as verificacoes abaixo precisam passar:

- assinatura real, dimensoes e leitura valida da imagem;
- CPF cadastrado encontrado pelo OCR no documento;
- pelo menos 80% dos termos relevantes do nome encontrados no documento;
- marcador compativel com RG, CNH ou RNE e OCR com confianca minima de 65%;
- rosto detectado no documento;
- exatamente um rosto, com tamanho suficiente, na selfie;
- selfie acima dos limites de antisspoof e liveness passivos;
- similaridade entre o descritor do documento e da selfie;
- nenhuma imagem reutilizada por outra conta.

O texto integral extraido e os vetores biometricos nao sao gravados. A
`triagem_json` guarda somente resultado, codigos de falha, metricas, limites e
versao do motor. Isso reduz a quantidade de dado sensivel persistido.

## Configuracao

```dotenv
KYC_MODE=automatic
KYC_AUTOMATIC_APPROVAL_ENABLED=false
KYC_CALIBRATION_SAMPLE_RATE=1.00
KYC_FACE_MATCH_THRESHOLD=0.65
KYC_LIVENESS_THRESHOLD=0.50
KYC_ANTISPOOF_THRESHOLD=0.60
KYC_MINIMUM_FACE_AREA=0.06
KYC_NAME_MATCH_THRESHOLD=0.80
KYC_OCR_CONFIDENCE_THRESHOLD=0.65
KYC_PRIVATE_DIR=
```

`KYC_MODE=manual` existe somente para contingencia e testes dos registros
legados. `KYC_AUTOMATIC_APPROVAL_ENABLED=false` e
`KYC_CALIBRATION_SAMPLE_RATE=1.00` sao a configuracao inicial segura para
producao: toda submissao sem falha vai para a fila de calibracao e nao recebe
`TIER_2` so pelo motor local.

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
- Imagens so podem ser lidas por rota administrativa autenticada e usam
  `Cache-Control: private, no-store`.
- Cada imagem aceita no maximo 8 MB. O rate limit usa Redis quando conectado.
- SHA-256 identifica repeticao sem comparar o conteudo visual bruto.

## Banco e painel

- `kyc_usuarios` guarda o estado consolidado do usuario.
- `solicitacoes_kyc` guarda cada tentativa, decisao automatica, motivo e
  metricas sem OCR integral ou embedding facial.
- `arquivos_kyc` guarda metadados e caminho privado das evidencias.
- A decisao e o estado de usuario/lojista/vendedor sao gravados numa unica
  transacao Prisma.
- O painel `KYC` tambem atende a fila de calibracao. A justificativa cria o
  dado rotulado usado para medir a qualidade do motor; ela nao expoe os arquivos
  para usuarios comuns.

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
- `POST /api/admin/kyc/submissions/:id/approve` para legado/contingencia
- `POST /api/admin/kyc/submissions/:id/reject` para legado/contingencia

## Verificacao executada

- motor WASM carregou localmente com detector, descritor, antisspoof e
  liveness;
- OCR portugues carregou do pacote local, sem CDN;
- teste negativo confirmou CPF/nome por OCR e recusou selfie sem rosto;
- teste positivo controlado confirmou comparacao do mesmo rosto com 98%;
- teste HTTP confirmou a recusa automatica para selfie sem rosto e o teste de
  politica confirma que calibracao deixa o caso em `EM_ANALISE`, sem liberar
  `TIER_2`;
- schema Prisma valido e build do painel aprovado.
