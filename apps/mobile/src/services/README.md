# Services

Clientes de API do app mobile entram aqui.

- `auth.api.js`: autenticacao e CPF.
- `users.api.js`: perfil do usuario.
- `wallet.api.js`: carteiras reais.
- `network.api.js`: rede e matriz 2x20.
- `seller.api.js`: segmentos, cadastro de vendedor e vendas autonomas.
- `read-cache.js`: cache de leitura em memoria, chaves por conta/contexto,
  limpeza da sessao e invalidacao depois de escritas relevantes.
- `api.js`: compartilha GETs que estao em andamento; novas leituras financeiras
  sempre consultam o servidor e mutacoes nunca sao agrupadas.
