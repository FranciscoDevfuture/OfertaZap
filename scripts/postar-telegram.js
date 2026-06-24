/**
 * OfertaZap — Poster automático de ofertas no Telegram
 *
 * Lê os produtos do index.html e posta as melhores ofertas
 * no canal @ZapOferta automaticamente.
 *
 * Variáveis de ambiente (GitHub Secrets):
 *   TELEGRAM_TOKEN  — Token do bot (@OfertaZapbot)
 *   TELEGRAM_CHAT   — Username do canal (@ZapOferta)
 */

import fs from 'fs';
import path from 'path';
import { JSDOM } from 'jsdom';

const TOKEN     = process.env.TELEGRAM_TOKEN;
const CHAT_ID   = process.env.TELEGRAM_CHAT || '-1004412875557';
const INDEX     = path.resolve('index.html');
const MAX_POST  = 5; // quantos produtos postar por vez

if (!TOKEN) {
  console.error('❌ TELEGRAM_TOKEN não definido.');
  process.exit(1);
}

// ── Ler produtos do index.html ─────────────────────────
function lerProdutos() {
  const html = fs.readFileSync(INDEX, 'utf-8');
  const dom  = new JSDOM(html);
  const doc  = dom.window.document;
  const cards = doc.querySelectorAll('.card-produto');

  return Array.from(cards).map(card => {
    const nome      = card.querySelector('.card-nome')?.textContent?.trim() || '';
    const precoEl   = card.querySelector('.preco-atual')?.textContent?.trim() || '';
    const origEl    = card.querySelector('.preco-original')?.textContent?.trim() || '';
    const link      = card.querySelector('.btn-comprar')?.href || '';
    const descEl    = card.querySelector('.badge-desconto')?.textContent?.trim() || '';
    const freteGrat = card.querySelector('.frete-gratis');
    const freteCup  = card.querySelector('.frete-cupom');
    const cat       = card.dataset?.cat || 'casa';
    const img       = card.querySelector('.card-img img')?.src || '';

    return { nome, preco: precoEl, orig: origEl, link, desc: descEl, freteGrat: !!freteGrat, freteCup: !!freteCup, cat, img };
  }).filter(p => p.nome && p.link);
}

// ── Escolher produtos para postar ─────────────────────
function escolherProdutos(produtos) {
  // Pega os primeiros N produtos (os mais recentemente adicionados ficam no topo)
  return produtos.slice(0, MAX_POST);
}

// ── Emoji por categoria ────────────────────────────────
function emojiCat(cat) {
  return { eletronicos: '📱', moda: '👗', casa: '🏠', beleza: '💄', esporte: '⚽', infantil: '🧸' }[cat] || '📦';
}

// ── Formatar mensagem individual ───────────────────────
function formatarMensagem(p) {
  const frete = p.freteGrat
    ? '✅ Frete grátis'
    : p.freteCup
    ? '🏷️ Frete grátis com cupom'
    : '🚚 Frete a calcular';

  const desconto = p.desc ? `📉 ${p.desc} de desconto\n` : '';
  const original = p.orig ? `~~${p.orig}~~ → ` : '';

  return `${emojiCat(p.cat)} *${p.nome}*\n\n💰 ${original}*${p.preco}*\n${desconto}${frete}\n\n🛒 [Comprar na Shopee](${p.link})\n\n📲 Mais ofertas: https://da.gd/OfertazZap`;
}

// ── Formatar mensagem com lista de produtos ────────────
function formatarListagem(produtos) {
  const itens = produtos.map((p, i) =>
    `${i + 1}️⃣ ${emojiCat(p.cat)} *${p.nome.slice(0, 60)}${p.nome.length > 60 ? '...' : ''}* — ${p.preco}${p.desc ? ` (${p.desc})` : ''}`
  ).join('\n');

  return `🔥 *MELHORES OFERTAS DE HOJE*\n\n${itens}\n\n🔗 Ver todas as ofertas:\nhttps://da.gd/OfertazZap\n\n💬 Manda pra quem tá precisando economizar! 👇`;
}

// ── Enviar mensagem via Telegram API ──────────────────
async function enviarMensagem(texto, imgUrl = null) {
  const base = `https://api.telegram.org/bot${TOKEN}`;

  // Se tiver imagem, usa sendPhoto com caption
  if (imgUrl && imgUrl.startsWith('http')) {
    const resp = await fetch(`${base}/sendPhoto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id:    CHAT_ID,
        photo:      imgUrl,
        caption:    texto,
        parse_mode: 'Markdown',
      }),
    });
    const data = await resp.json();
    if (!data.ok) {
      console.warn(`  ⚠️  sendPhoto falhou: ${data.description} — tentando sendMessage`);
      // Fallback para texto puro
      return enviarTexto(base, texto);
    }
    return data;
  }

  return enviarTexto(base, texto);
}

async function enviarTexto(base, texto) {
  const resp = await fetch(`${base}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id:    CHAT_ID,
      text:       texto,
      parse_mode: 'Markdown',
      disable_web_page_preview: false,
    }),
  });
  const data = await resp.json();
  if (!data.ok) {
    console.error('  🔍 Resposta completa da API:', JSON.stringify(data));
    console.error('  🔍 chat_id usado:', CHAT_ID);
    console.error('  🔍 Token (primeiros 20 chars):', TOKEN?.slice(0, 20));
  }
  return data;
}

// ── Aguardar entre mensagens ───────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Main ───────────────────────────────────────────────
async function main() {
  console.log('📦 Lendo produtos do index.html...');
  const todos    = lerProdutos();
  const produtos = escolherProdutos(todos);

  console.log(`✅ ${todos.length} produtos encontrados. Postando ${produtos.length} ofertas...`);

  // 1. Posta mensagem de listagem geral
  const listagem = formatarListagem(produtos);
  const resLista = await enviarMensagem(listagem);
  if (resLista.ok) {
    console.log('  ✅ Listagem geral enviada');
  } else {
    console.warn('  ⚠️  Erro na listagem:', resLista.description);
  }

  await sleep(2000);

  // 2. Posta cada produto individualmente com foto
  for (const [i, p] of produtos.entries()) {
    console.log(`\n  📤 Postando [${i+1}/${produtos.length}]: ${p.nome.slice(0, 50)}`);
    const msg = formatarMensagem(p);
    const res = await enviarMensagem(msg, p.img);

    if (res.ok) {
      console.log('  ✅ Enviado!');
    } else {
      console.warn('  ❌ Erro:', res.description);
    }

    // Intervalo de 3s entre mensagens para não ser bloqueado pelo Telegram
    if (i < produtos.length - 1) await sleep(3000);
  }

  console.log('\n🎉 Postagem concluída!');
}

main().catch(err => {
  console.error('💥 Erro fatal:', err);
  process.exit(1);
});
