# Agente OfertaZap

Este pacote adiciona um atualizador automatico para o site OfertaZap no GitHub.

## Como usar

1. Copie estes arquivos para a raiz do repositorio `FranciscoDevfuture/OfertaZap`.
2. No GitHub, abra `Settings > Secrets and variables > Actions`.
3. Crie o segredo `OPENAI_API_KEY` se quiser que a IA organize melhor nome, preco e categoria.
4. Cole novos links da Shopee em `links-novos.txt`, um por linha.
5. Va em `Actions > Atualizar produtos Shopee > Run workflow`.

O agente preserva os produtos ja existentes porque ele le todos os links Shopee no `index.html` antes de adicionar qualquer card novo.

## Observacoes

- O site precisa ter o elemento `id="grid-produtos"` no `index.html`.
- Links duplicados nao sao adicionados novamente.
- Se a Shopee bloquear a leitura de dados, o card ainda sera criado com informacoes basicas e o link de afiliado correto.
- O workflow tambem roda automaticamente todos os dias as 11:00 UTC.

