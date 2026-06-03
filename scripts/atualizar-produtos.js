import fs from "node:fs/promises";
import { existsSync } from "node:fs";

const INDEX_PATH = "index.html";
const LINKS_PATH = "links-novos.txt";

function normalizarUrl(url) {
  return String(url || "").trim().replace(/\/+$/, "");
}

function ehShopee(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return host === "shopee.com.br" || host === "s.shopee.com.br" || host.endsWith(".shopee.com.br");
  } catch {
    return false;
  }
}

async function lerLinksNovos() {
  if (!existsSync(LINKS_PATH)) {
    throw new Error("O arquivo links-novos.txt nao existe na raiz do repositorio.");
  }

  const texto = await fs.readFile(LINKS_PATH, "utf8");
  const links = texto
    .split(/\r?\n/)
    .map((linha) => linha.trim())
    .filter((linha) => linha && !linha.startsWith("#"))
    .map(normalizarUrl)
    .filter(ehShopee);

  return [...new Set(links)];
}

function escaparHtml(valor) {
  return String(valor || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function criarCard(link, numero) {
  return `
    <div class="card-produto" data-cat="casa">
      <div class="card-img" style="background:#f59e0b15">
        <div class="emoji-placeholder">📦</div>
        <span class="badge-frete frete-cupom">🏷️ Frete c/ cupom</span>
      </div>
      <div class="card-info">
        <div class="card-categoria">Casa</div>
        <div class="card-nome">Oferta Shopee ${numero}</div>
        <div class="card-precos">
          <span class="preco-atual">Ver oferta</span>
        </div>
        <div class="card-estrelas">
          <span class="estrelas">★★★★½</span>
          <span>4.8 (novo)</span>
        </div>
        <a class="btn-comprar" href="${escaparHtml(link)}" target="_blank" rel="nofollow sponsored noopener">🛒 Ver na Shopee</a>
      </div>
    </div>`;
}

function inserirCardsNoGrid(html, cards) {
  const inicioGrid = html.search(/<div[^>]+id=["']grid-produtos["'][^>]*>/i);

  if (inicioGrid === -1) {
    throw new Error("Nao encontrei o bloco id='grid-produtos' no index.html.");
  }

  const inicioConteudo = html.indexOf(">", inicioGrid) + 1;
  const antes = html.slice(0, inicioConteudo);
  const depois = html.slice(inicioConteudo);

  return `${antes}
${cards}
${depois}`;
}

async function main() {
  console.log("Iniciando atualizacao do OfertaZap...");

  if (!existsSync(INDEX_PATH)) {
    throw new Error("Nao encontrei index.html na raiz do repositorio.");
  }

  const html = await fs.readFile(INDEX_PATH, "utf8");
  const linksNovos = await lerLinksNovos();

  console.log(`Links validos encontrados: ${linksNovos.length}`);

  if (!linksNovos.length) {
    console.log("Nenhum link novo para adicionar.");
    return;
  }

  const linksParaAdicionar = linksNovos.filter((link) => !html.includes(link));

  console.log(`Links ainda nao presentes no site: ${linksParaAdicionar.length}`);

  if (!linksParaAdicionar.length) {
    console.log("Todos os links informados ja existem no site.");
    return;
  }

  const cards = linksParaAdicionar
    .map((link, index) => criarCard(link, index + 1))
    .join("\n");

  const htmlAtualizado = inserirCardsNoGrid(html, cards);

  await fs.writeFile(INDEX_PATH, htmlAtualizado, "utf8");
  await fs.writeFile(LINKS_PATH, "# Cole aqui novos links da Shopee, um por linha.\n", "utf8");

  console.log(`Produtos adicionados: ${linksParaAdicionar.length}`);
}

main().catch((erro) => {
  console.error("Erro ao atualizar produtos:");
  console.error(erro?.stack || erro?.message || erro);
  process.exit(1);
});
