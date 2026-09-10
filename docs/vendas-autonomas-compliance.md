# Vendas autonomas: limites de lancamento e conformidade

Ultima atualizacao: 2026-09-04

## Decisao atual

Uma pessoa pode criar uma venda autonoma tecnicamente, sem abrir uma loja,
somente depois de concluir o KYC `TIER_2`, usar o mesmo CPF da conta no perfil
de vendedor, possuir segmento ativo e ter uma chave Pix de recebimento ativa.
O limite operacional atual de pessoa fisica e R$ 5.000,00 por mes, somando
lojas e vendas autonomas do mesmo CPF.

Esse teto e um controle de risco da plataforma. Ele nao substitui obrigacoes
tributarias, cadastro municipal, emissao de documento fiscal ou formalizacao
do vendedor.

Perfil com CNPJ numerico ou alfanumerico fica `ATIVO` quando o documento passa
pela validacao oficial dos digitos verificadores. Esse fluxo nao exige o envio
de RG, CNH ou RNE da empresa.

## O que ja esta protegido no codigo

- CPF e CNPJ comercial possuem unicidade no banco.
- Perfil de venda pessoa fisica precisa corresponder ao CPF da conta.
- Venda autonoma por CPF exige usuario com KYC aprovado e `nivel_kyc = TIER_2`;
  por CNPJ, exige CNPJ valido e perfil comercial ativo.
- Perfil comercial precisa estar `ATIVO` e com KYC comercial aprovado.
- A cobranca exige chave Pix ativa do proprio recebedor.
- Valores usam centavos inteiros, pagamento interno e repasse possuem
  referencias idempotentes, e a mesma cobranca nao pode ser paga duas vezes.
- O limite mensal de CPF considera o faturamento comercial combinado.

## Bloqueios para abrir vendas autonomas ao publico

### Canal da venda

A venda autonoma gera um QR. O banco ainda conserva um `link_slug` interno,
mas a API nao expoe mais `paymentPath`: hoje, ao ser paga, qualquer venda
autonoma e tratada como presencial e pode iniciar liberacao e repasse imediato.
Isso so e aceitavel se o produto for estritamente uma venda de balcao entre
pessoas presentes.

Antes de publicar o link para compra remota, separar explicitamente os canais:

- `PRESENCIAL`: QR exibido no local, sem promessa de arrependimento pela
  plataforma depois do repasse; o fluxo deve informar essa condicao antes do
  pagamento.
- `REMOTA`: identificacao completa do vendedor, resumo da contratacao,
  entrega/prazo, canal de suporte, cancelamento, direito de arrependimento e
  reserva financeira compativel. Esse canal nao pode liberar repasse na hora.

Enquanto essa separacao nao existir, venda autonoma deve permanecer em piloto
fechado e uso presencial controlado, sem divulgar o `paymentPath` como link de
compra remota.

### Consumidor, fiscal e privacidade

- Nao existe aceite de termos comerciais, politica de itens proibidos,
  classificacao etaria, garantia, entrega, comprovante de compra ou fluxo de
  disputa proprio para venda autonoma.
- `DocumentoFiscal` existe no banco apenas para transacoes de lojas e nao ha
  emissao, integracao fiscal ou comprovante equivalente para venda autonoma.
- Documentos e selfie do KYC sao dados pessoais de alto risco; a privacidade,
  retencao, seguranca, acesso e exclusao precisam de politica publica e
  processo operacional antes de tratar dados reais em escala.
- O KYC automatico local esta em calibracao. Ele reduz fraude basica, mas nao
  substitui documentoscopia, prova de vida ativa e analise juridica para
  liberar limites maiores.

## Regras externas que orientam a implementacao

- O CDC exige oferta clara e vinculante; nas contratacoes fora do
  estabelecimento, ha direito de arrependimento em sete dias e devolucao dos
  valores pagos. [Lei 8.078/1990](https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm)
- O Decreto do comercio eletronico exige identificacao do fornecedor,
  informacoes claras, resumo antes da contratacao, confirmacao e mecanismo de
  atendimento/cancelamento. [Decreto 7.962/2013](https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2013/decreto/d7962.htm)
- A LGPD classifica dado biometrico como dado pessoal sensivel e exige base
  legal e medidas de seguranca adequadas. [Lei 13.709/2018](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm)
- Obrigacao de nota varia pela natureza do vendedor, comprador, mercadoria e
  municipio/UF. Mesmo MEI possui situacoes em que a nota e obrigatoria,
  especialmente venda para empresa ou remessa de mercadoria. [Orientacao para
  MEI](https://www.gov.br/empresas-e-negocios/pt-br/empreendedor/servicos-para-mei/nota-fiscal/nota-fiscal-2)

Este documento orienta produto e engenharia; contador e advogado devem validar
o modelo comercial, fiscal e consumerista da cidade/UF antes da abertura.

## Proxima entrega obrigatoria

Modelar o canal da venda autonoma no banco e na API, ocultar links remotos de
vendas presenciais e criar o fluxo completo de venda remota antes de permitir
compartilhamento publico: termos, identificacao, politica de arrependimento,
comprovante/fiscal, reserva de repasse e suporte.
