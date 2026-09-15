# Assets visuais curados

## Objetivo

Este pacote substitui os placeholders com texto usados pela seed por imagens comerciais leves e coerentes com a identidade clara e verde do DeTudoJa.

Os arquivos oficiais ficam em `storage/uploads/curated`. Os demais arquivos enviados por usuarios continuam ignorados pelo Git.

## Conteudo

- 11 imagens de categorias: Restaurantes, Mercados, Farmacias, Conveniencias, Servicos, Moda, Pet, Beleza, Casa, Eletronicos e Outros. `Restaurante` e `Restaurantes` compartilham a mesma arte.
- 8 arquivos de banner aplicados a 9 lojas: cinco lojas demo e as lojas LOJA DE ROUPAS MELO, Mercado pires, Loja de Informatica e FRETES JOSE. A loja demo de moda reutiliza o banner da LOJA DE ROUPAS MELO.
- 20 imagens de produtos, cobrindo todo o catalogo existente em 2026-08-07. O pacote inclui alimentacao, mercado, farmacia, moda, beleza, materiais de construcao e eletronicos.
- As imagens de categoria tambem funcionam como logos limpos das lojas associadas.

## Formatos

- Categorias: `720x720`, WebP, qualidade 84.
- Produtos: `960x960`, WebP, qualidade 84. Cada item tem imagem propria, sem reutilizacao generica entre produtos diferentes.
- Banners: `1440x540`, WebP, qualidade 84.
- Nenhuma arte contem texto, marca de terceiro ou informacao que conflite com os dados da API.

## Aplicacao no banco

O comando abaixo apenas atualiza colunas de URL em registros existentes. Ele nao cria migration, nao altera schema e nao apaga dados:

```bash
npm run media:curated
```

O script `apps/api/prisma/apply-curated-media.js` procura categorias, lojas e produtos pelo nome normalizado, sem depender dos IDs locais. Pode ser executado novamente sem duplicar registros.

O `seed:demo` usa os assets curados em sete lojas de teste e gera o catalogo de
42 produtos. No
Docker, os arquivos sao copiados para o volume persistente `uploads_data` antes
da carga. O fallback gerado permanece disponivel apenas para futuros itens que
ainda nao tenham arte oficial.

## Geracao

- Ferramenta/modelo: gerador de imagens integrado ao Codex; o identificador interno do modelo nao e exposto pela ferramenta.
- Direcao de arte: fotografia comercial realista ou 3D realista, fundo branco ou verde muito claro, composicao central, margens seguras para cards mobile e ausencia de texto, logos, marcas e watermark.
- Banners usam composicao horizontal com elementos importantes no centro vertical para suportar recorte responsivo.
- Produtos usam fotografia de catalogo quadrada com escala e materiais realistas.
