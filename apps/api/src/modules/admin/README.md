# Admin Module

Modulo administrativo funcional para dashboard, participantes, categorias e
segmentos de venda.

- `admin-dashboard.*`: metricas e cadastros recentes.
- `admin-users.*`: busca, paginacao, detalhes e status dos participantes.
- `admin-categories.*`: CRUD e exclusao logica das categorias.
- `admin-segments.*`: CRUD e exclusao logica dos segmentos usados na primeira venda.
- `admin-service-types.*`: CRUD dos servicos individuais de prestadores, como Frete e Entregador.
- `admin.serializer.js`: respostas seguras sem senha e com CPF mascarado.
- `admin.validator.js`: contratos Zod das escritas administrativas.
