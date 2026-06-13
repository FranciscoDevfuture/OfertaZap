/**
 * OfertaZap — Atualizador via API oficial de Afiliados da Shopee
 *
 * Queries usadas (GraphQL):
 *   - productOfferV2  → busca produto por shopId + itemId
 *
 * Variáveis de ambiente (GitHub Secrets):
 *   SHOPEE_APP_ID  — App ID do painel de afiliados
 *   SHOPEE_SECRET  — Secret Key do painel de afiliados
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// ── Configurações ──────────────────────────────────────────────
const APP_ID    = process.env.SHOPEE_APP_ID;
const SECRET    = process.env.SHOPEE_SECRET;
const INDEX     = path.resolve('index.html');
const LINKS_TXT = path.resolve('links-novos.txt');
const API_URL   = 'https://open-api.affiliate.shopee.com.br/graphql';

if (!APP_ID || !SECRET) {
  console.error('❌ SHOPEE_APP_ID e SHOPEE_SECRET precisam estar definidos.');
  process.exit(1);
}

// ── Autenticação SHA256 (padrão Shopee Affiliate Open API) ─────
// Fórmula: factor = AppId + Timestamp + Payload + Secret
// Signature = SHA256(factor)  ← hash direto, NÃO é HMAC
// Header: Authorization: SHA256 Credential=<AppId>, Timestamp=<ts>, Signature=<sig>
function gerarAuthHeader(payload) {
  const timestamp = Math.floor(Date.now() / 1000);
  const factor    = `${APP_ID}${timestamp}${payload}${SECRET}`;
  const signature = crypto
    .createHash('sha256')
    .update(factor)
    .digest('hex');

  return {
    Authorization: `SHA256 Credential=${APP_ID}, Timestamp=${timestamp}, Signature=${signature}`,
    'Content-Type': 'application/json',
  };
}

// ── Resolver link encurtado → shopId + itemId ──────────────────
async function resolverLink(url) {
  try {
    const resp = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    const final = resp.url;

    // Formato longo: /product/<shopId>/<itemId>
    const m1 = final.match(/\/product\/(\d+)\/(\d+)/);
    if (m1) return { shopId: m1[1], itemId: m1[2] };

    // Query string: ?shopid=&itemid=
    const u = new URL(final);
    const shopId = u.searchParams.get('shopid');
    const itemId = u.searchParams.get('itemid');
    if (shopId && itemId) return { shopId, itemId };

  } catch (e) {
    console.warn(`  ⚠️  Não foi possível resolver: ${url} — ${e.message}`);
  }
  return null;
}

// ── Buscar produto via productOfferV2 ──────────────────────────
async function buscarProduto(shopId, itemId, linkOriginal) {
  // Query GraphQL conforme documentação (productOfferV2 com shopId + itemId)
  const query = `
    query {
      productOfferV2(
        input: {
          shopId: ${shopId}
          itemId: ${itemId}
          limit: 1
        }
      ) {
        nodes {
          itemId
          itemName
          priceMin
          priceMax
          ratingStar
          sales
          imageUrl
          shopName
          offerLink
          commissionRate
          price
        }
        pageInfo {
          page
          limit
          hasNextPage
        }
      }
    }
  `;

  try {
    const body    = JSON.stringify({ query });
    const headers = gerarAuthHeader(body);  // payload = body da requisição

    const resp = await fetch(API_URL, {
      method: 'POST',
      headers,
      body,
    });

    if (!resp.ok) {
      console.warn(`  ⚠️  HTTP ${resp.status} da API Shopee`);
      return null;
    }

    const json = await resp.json();

    if (json.errors) {
      console.warn(`  ⚠️  Erro GraphQL: ${JSON.stringify(json.errors)}`);
      return null;
    }

    const node = json?.data?.productOfferV2?.nodes?.[0];
    if (!node) {
      console.warn(`  ⚠️  Produto não retornado pela API (shopId=${shopId}, itemId=${itemId})`);
      return null;
    }

    const preco = parseFloat(node.price || node.priceMin) || 0;
    const orig  = parseFloat(node.priceMax) > preco ? parseFloat(node.priceMax) : 0;

    return {
      id:     itemId,
      nome:   node.itemName    || 'Produto Shopee',
      catNome: node.categoryName || '',
      preco,
      orig,
      link:   node.offerLink   || linkOriginal,
      img:    node.imageUrl    || '',
      stars:  parseFloat(node.ratingStar) || 4.5,
      sales:  parseInt(node.sales)        || 0,
    };

  } catch (e) {
    console.warn(`  ⚠️  Erro na requisição: ${e.message}`);
    return null;
  }
}

// ── Extrair links já presentes no index.html ───────────────────
function linksExistentes(html) {
  const re = /href="(https?:\/\/[^"]*shopee[^"]+)"/gi;
  const links = new Set();
  let m;
  while ((m = re.exec(html)) !== null) links.add(m[1]);
  return links;
}

// ── Mapear categoria ───────────────────────────────────────────
function mapearCategoria(cat) {
  const c = (cat || '').toLowerCase();
  if (c.includes('eletrôn') || c.includes('eletron') || c.includes('celular') || c.includes('inform')) return 'eletronicos';
  if (c.includes('moda') || c.includes('roupa') || c.includes('vestido') || c.includes('calça') || c.includes('blusa')) return 'moda';
  if (c.includes('beleza') || c.includes('skin') || c.includes('cabelo') || c.includes('perfume')) return 'beleza';
  if (c.includes('esporte') || c.includes('fitness') || c.includes('futebol')) return 'esporte';
  if (c.includes('infantil') || c.includes('bebê') || c.includes('brinquedo')) return 'infantil';
  return 'casa';
}

const CAT_NOMES = {
  eletronicos: 'Eletrônicos', moda: 'Moda', casa: 'Casa & Utilidades',
  beleza: 'Beleza', esporte: 'Esporte', infantil: 'Infantil',
};

const CAT_CORES = {
  eletronicos: '#ec489915', moda: '#ec489915', casa: '#f59e0b15',
  beleza: '#8b5cf615', esporte: '#22c55e15', infantil: '#f97316015',
};

// ── Gerar HTML do card (idêntico à estrutura do index.html) ────
function gerarCard(p) {
  const cat      = mapearCategoria(p.catNome || '');
  const estrelas = '★'.repeat(Math.floor(p.stars)) + (p.stars % 1 >= 0.5 ? '½' : '');
  const votos    = p.sales > 0 ? p.sales.toLocaleString('pt-BR') : Math.floor(Math.random() * 900 + 100);
  const bgColor  = CAT_CORES[cat] || '#ec489915';

  const badgeDesconto = p.orig > p.preco
    ? `<span class="badge-desconto">-${Math.round((1 - p.preco / p.orig) * 100)}%</span>`
    : '';

  const badgeFrete = `<span class="badge-frete frete-cupom">🏷️ Frete c/ cupom</span>`;

  const precoOriginal = p.orig > p.preco
    ? `<span class="preco-original">R$ ${p.orig.toFixed(2).replace('.', ',')}</span>`
    : '';

  return `<div class="card-produto" data-cat="${cat}">
            <div class="card-img" style="background:${bgColor}">
              <img src="${p.img}" alt="${p.nome}" onerror="this.style.display='none'">
              <div class="emoji-placeholder" style="display:none">📦</div>
              ${badgeDesconto}
              ${badgeFrete}
            </div>
            <div class="card-info">
              <div class="card-categoria">${CAT_NOMES[cat] || 'Geral'}</div>
              <div class="card-nome">${p.nome}</div>
              <div class="card-precos">
                <span class="preco-atual">R$ ${p.preco.toFixed(2).replace('.', ',')}</span>
                ${precoOriginal}
              </div>
              <div class="card-estrelas">
                <span class="estrelas">${estrelas}</span>
                <span>${p.stars} (${votos})</span>
              </div>
              <a class="btn-comprar" href="${p.link}" target="_blank" rel="nofollow">🛒 Ver na Shopee</a>
            </div>
          </div>`;

// ── Atualizar preço de um card já existente ────────────────────
function atualizarPreco(html, link, novoPreco) {
  // Localiza o card pelo offerLink e substitui o preço-atual
  const linkEscapado = link.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `(href="${linkEscapado}"[\\s\\S]{0,2000}?preco-atual">)R\\$\\s*[\\d,.]+(<\\/span>)`,
    'm'
  );
  if (re.test(html)) {
    return {
      html: html.replace(re, `$1R$ ${novoPreco.toFixed(2).replace('.', ',')}$2`),
      atualizado: true,
    };
  }
  return { html, atualizado: false };
}

// ── Main ───────────────────────────────────────────────────────
async function main() {
  if (!fs.existsSync(LINKS_TXT)) {
    console.log('ℹ️  links-novos.txt não encontrado. Nada a fazer.');
    return;
  }

  const linksNovos = fs
    .readFileSync(LINKS_TXT, 'utf-8')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.startsWith('http'));

  if (!linksNovos.length) {
    console.log('ℹ️  Nenhum link em links-novos.txt. Nada a fazer.');
    return;
  }

  let html = fs.readFileSync(INDEX, 'utf-8');
  const jaExistem = linksExistentes(html);
  let adicionados = 0;
  let atualizados = 0;
  let ignorados   = 0;

  for (const link of linksNovos) {
    console.log(`\n🔗 Processando: ${link}`);

    const ids = await resolverLink(link);
    if (!ids) {
      console.log('  ↩️  Não foi possível resolver. Pulando.');
      ignorados++;
      continue;
    }
    console.log(`  📦 shopId=${ids.shopId} | itemId=${ids.itemId}`);

    const produto = await buscarProduto(ids.shopId, ids.itemId, link);
    if (!produto) {
      console.log('  ↩️  Dados não disponíveis. Pulando.');
      ignorados++;
      continue;
    }
    console.log(`  📋 ${produto.nome} — R$ ${produto.preco.toFixed(2)}`);

    // Tenta atualizar preço se o card já existe
    const { html: htmlAtualizado, atualizado } = atualizarPreco(html, produto.link, produto.preco);
    if (atualizado) {
      html = htmlAtualizado;
      console.log(`  ✏️  Preço atualizado.`);
      atualizados++;
      continue;
    }

    // Evita duplicatas pelo link original também
    if (jaExistem.has(link) || jaExistem.has(produto.link)) {
      console.log('  ⏭️  Já existe no HTML. Pulando.');
      ignorados++;
      continue;
    }

    // Insere card novo no início do grid
    const card = gerarCard(produto);
    const inserido = html.replace(
      /(<div[^>]+id="grid-produtos"[^>]*>)/,
      `$1${card}`
    );

    if (inserido === html) {
      console.warn('  ⚠️  Container #grid-produtos não encontrado no index.html.');
    } else {
      html = inserido;
      jaExistem.add(produto.link);
      adicionados++;
      console.log(`  ✅ Card adicionado.`);
    }
  }

  fs.writeFileSync(INDEX, html, 'utf-8');
  fs.writeFileSync(LINKS_TXT, '', 'utf-8'); // limpa o arquivo após processar

  console.log(`\n🎉 Concluído!`);
  console.log(`   ✅ ${adicionados} adicionado(s)`);
  console.log(`   ✏️  ${atualizados} preço(s) atualizado(s)`);
  console.log(`   ⏭️  ${ignorados} ignorado(s)`);
}

main().catch(err => {
  console.error('💥 Erro fatal:', err);
  process.exit(1);
});
