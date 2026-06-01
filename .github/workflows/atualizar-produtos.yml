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
    await fs.writeFile(LINKS_PATH, "", "utf8");
    return [];
  }

  const texto = await fs.readFile(LINKS_PATH, "utf8");
  return [...new Set(
    texto
      .split(/\r?\n/)
      .map((linha) => linha.trim())
      .filter((linha) => linha && !linha.startsWith("#"))
      .map(normalizarUrl)
      .filter(ehShopee)
  )];
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
  const nome = `Oferta Shopee ${numero}`;

  return `
    <div class="card-produto" data-cat="casa">
      <div class="card-img" style="background:#f59e0b15">
        <div class="emoji-placeholder">📦</div>
        <span class="badge-frete frete-cupom">🏷️ Frete c/ cupom</span>
      </div>
      <div class="card-info">
        <div class="card-categoria">Casa</div>
        <div class="card-nome">${escaparHtml(nome)}</div>
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

async function main() {
  if (!existsSync(INDEX_PATH)) {
    throw new Error("Nao encontrei index.html na raiz do repositorio.");
  }

  const html = await fs.readFile(INDEX_PATH, "utf8");
  const linksNovos = await lerLinksNovos();

  if (!linksNovos.length) {
    console.log("Nenhum link novo em links-novos.txt.");
    return;
  }

  const linksParaAdicionar = linksNovos.filter((link) => !html.includes(link));

  if (!linksParaAdicionar.length) {
    console.log("Todos os links de links-novos.txt ja existem no site.");
    await fs.writeFile(LINKS_PATH, "# Cole aqui novos links da Shopee, um por linha.\n", "utf8");
    return;
  }

  const marcadorFinal = "</div>\n</main>";
  let htmlAtualizado = html;

  if (!htmlAtualizado.includes('id="grid-produtos"') && !htmlAtualizado.includes("id='grid-produtos'")) {
    throw new Error("Nao encontrei #grid-produtos no index.html.");
  }

  const cards = linksParaAdicionar
    .map((link, index) => criarCard(link, index + 1))
    .join("\n");
