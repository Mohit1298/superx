/** OAuth redirect target: exchanges the code, registers webhooks, syncs catalog. */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  checkState,
  exchangeCodeForToken,
  normalizeShop,
  registerWebhooks,
  shopifyConfigured,
  verifyOAuthQuery,
} from "../../src/shopify.js";
import { syncCatalog } from "../../src/shopify.js";
import { upsertMerchant } from "../../src/db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!shopifyConfigured()) {
    res.status(503).send("not configured");
    return;
  }
  const shop = normalizeShop(String(req.query.shop ?? ""));
  const code = String(req.query.code ?? "");
  const state = String(req.query.state ?? "");
  if (!shop || !code || !checkState(shop, state) || !verifyOAuthQuery(req.query as Record<string, unknown>)) {
    res.status(400).send("invalid install request");
    return;
  }
  try {
    const token = await exchangeCodeForToken(shop, code);
    await upsertMerchant(shop, token);
    await registerWebhooks(shop, token);
    const count = await syncCatalog(shop, token);
    res.status(200).send(page(successHtml(shop, count)));
  } catch (err) {
    console.error("[shopify] install failed:", err);
    res.status(500).send(
      page(`
        <img class="logo" src="https://superx-ten.vercel.app/logo.png" alt="SuperX">
        <h1>Almost there</h1>
        <p class="sub">The connection hiccuped on our side — nothing is broken on your store.</p>
        <p class="sub">Try the install link once more in a minute. If it keeps happening, email
        <a href="mailto:mohitab2005@gmail.com">mohitab2005@gmail.com</a> and we'll fix it fast.</p>`)
    );
  }
}

const page = (body: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SuperX × your store</title><link rel="icon" href="https://superx-ten.vercel.app/logo.png">
<style>
  :root{color-scheme:dark}*{margin:0;box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0c0f0d;color:#e8ece9;
       min-height:100svh;display:grid;place-items:center;padding:24px}
  main{max-width:600px;text-align:center}
  .logo{width:72px;height:72px;border-radius:18px;margin-bottom:24px}
  h1{font-size:clamp(28px,6vw,40px);letter-spacing:-.02em;line-height:1.1}
  .ok{color:#7fd6a2}
  p.sub{margin:16px auto 0;max-width:52ch;font-size:16px;line-height:1.65;color:#a8b0ab}
  .stat{display:inline-block;margin-top:24px;background:#101b14;border:1px solid #22432f;border-radius:14px;
        padding:14px 22px;font-size:15px;color:#c7cec9}
  .stat b{color:#7fd6a2;font-size:22px;display:block}
  .steps{margin-top:32px;display:grid;gap:10px;text-align:left}
  .step{background:#131815;border:1px solid #1e2620;border-radius:12px;padding:14px 16px;font-size:15px;color:#c7cec9}
  .step span{color:#7fd6a2;font-weight:700;margin-right:8px}
  a{color:#7fd6a2}
  .fine{margin-top:26px;font-size:13px;color:#5d6660}
</style></head><body><main>${body}</main></body></html>`;

const successHtml = (shop: string, count: number) => `
  <img class="logo" src="https://superx-ten.vercel.app/logo.png" alt="SuperX">
  <h1>You're connected <span class="ok">✓</span></h1>
  <p class="sub"><b>${shop.replace(".myshopify.com", "")}</b> is now part of the SuperX network.
  Shoppy — our shopping copilot on WhatsApp — answers shoppers with your real-time prices, stock, and
  direct product links.</p>
  <div class="stat"><b>${count}</b>product variants synced</div>
  <div class="steps">
    <div class="step"><span>1</span>Your catalog stays live automatically — every price or stock change
    streams to us the moment you save it. Nothing to maintain.</div>
    <div class="step"><span>2</span>When shoppers ask for products you carry, Shoppy quotes your exact
    price with a link straight to the product page.</div>
    <div class="step"><span>3</span>Coming soon: your demand dashboard — see what nearby shoppers are
    watching and waiting to buy.</div>
  </div>
  <p class="fine">Questions or want out? Uninstall anytime from your store's Apps page — your data
  deletes automatically. · <a href="https://superx-ten.vercel.app/privacy">Privacy</a></p>`;
