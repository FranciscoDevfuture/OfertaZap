import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import * as cheerio from "cheerio";

const INDEX_PATH = "index.html";
const LINKS_PATH = "links-novos.txt";
const SHOPEE_HOSTS = ["shopee.com.br", "s.shopee.com.br"];

const CATEGORIAS = [
  "eletronicos",
  "moda",
  "casa",
  "beleza",
  "esporte",
  "infantil"
];

function normalizarUrl(url) {
  return String(url || "").trim().replace(/\/+$/, "");
}

function ehLinkShopee(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return SHOPEE_HOSTS.some((permitido) => host === permitido || host.endsWith(`.${permitido}`));
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
      .filter(ehLinkShopee)
      .map(normalizarUrl)
  )];
}

function linksExistentes($) {
  const links = new Set();

  $("a[href]").each((_, el) => {
    const href = normalizarUrl($(el).attr("href"));
    if (ehLinkShopee(href)) links.add(href);
  });

  return links;
}

async function buscarMetadados(url) {
  const fallback = {
    nome: "Produto Shopee",
    imagem: "",
    preco: "Ver oferta",
    precoOriginal: "",
    categoria: "casa",
    avaliacao: "4.8",
    vendas: "novo"
  };

  try {
    const resposta = await fetch(url, {
      redirect: "follow",
      headers: {
        "user-agent": "Mozilla/5.0 OfertaZapBot/1.0",
        "accept-language": "pt-BR,pt;q=0.9,en;q=0.8"
      }
    });

    const html = await resposta.text();
    const $ = cheerio.load(html);

    const nome =
      $("meta[property='og:title']").attr("content") ||
      $("meta[name='twitter:title']").attr("content") ||
      $("title").text() ||
      fallback.nome;

    const imagem =
      $("meta[property='og:image']").attr("content") ||
      $("meta[name='twitter:image']").attr("content") ||
      "";

    const descricao =
      $("meta[property='og:description']").attr("content") ||
      $("meta[name='description']").attr("content") ||
      "";

    return normalizarProdutoComIA({
      ...fallback,
      nome: limparTexto(nome),
