/** Shared HTML for merchant-facing pages (install success → dashboard). */

export const page = (body: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SuperX × your store</title><link rel="icon" href="https://superx-ten.vercel.app/logo.png">
<style>
  :root{color-scheme:dark}*{margin:0;box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0c0f0d;color:#e8ece9;
       min-height:100svh;display:grid;place-items:center;padding:24px}
  main{max-width:620px;text-align:center}
  .logo{width:64px;height:64px;border-radius:16px;margin-bottom:20px}
  h1{font-size:clamp(26px,6vw,38px);letter-spacing:-.02em;line-height:1.12}
  .ok{color:#7fd6a2}
  .banner{margin:0 auto 18px;display:inline-block;background:#101b14;border:1px solid #22432f;
          border-radius:999px;padding:7px 16px;font-size:13px;color:#7fd6a2}
  p.sub{margin:14px auto 0;max-width:54ch;font-size:16px;line-height:1.65;color:#a8b0ab}
  .stats{margin-top:26px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
  .stat{background:#101b14;border:1px solid #22432f;border-radius:14px;padding:12px 20px;font-size:13px;color:#c7cec9;min-width:130px}
  .stat b{color:#7fd6a2;font-size:22px;display:block}
  .steps{margin-top:28px;display:grid;gap:10px;text-align:left}
  .step{background:#131815;border:1px solid #1e2620;border-radius:12px;padding:13px 16px;font-size:15px;color:#c7cec9}
  .step span{color:#7fd6a2;font-weight:700;margin-right:8px}
  a{color:#7fd6a2}
  .fine{margin-top:24px;font-size:13px;color:#5d6660}
</style></head><body><main>${body}</main></body></html>`;

export interface MerchantStats {
  shop: string;
  variants: number;
  products: number;
  lastUpdate: string | null;
  justInstalled: boolean;
}

export const dashboardHtml = (s: MerchantStats) => `
  <img class="logo" src="https://superx-ten.vercel.app/logo.png" alt="SuperX">
  ${s.justInstalled ? `<div class="banner">🎉 Connected — welcome to the SuperX network</div>` : ""}
  <h1>${s.shop.replace(".myshopify.com", "")} <span class="ok">· live</span></h1>
  <p class="sub">Shoppy — our shopping copilot on WhatsApp — is answering shoppers with your
  real-time prices, stock, and direct product links.</p>
  <div class="stats">
    <div class="stat"><b>${s.products}</b>products live</div>
    <div class="stat"><b>${s.variants}</b>variants tracked</div>
    <div class="stat"><b>${s.lastUpdate ?? "—"}</b>last catalog update</div>
  </div>
  <div class="steps">
    <div class="step"><span>⚡</span>Sync is automatic. Change a price or stock level in Shopify and
    it reaches Shoppy within seconds — nothing to maintain, ever.</div>
    <div class="step"><span>🛍</span>When a shopper asks for something you carry, Shoppy quotes your
    exact price with a tap-to-buy link to your product page.</div>
    <div class="step"><span>📈</span><b>Demand dashboard — coming soon.</b> Anonymous, aggregated view
    of what shoppers near you are watching and waiting to buy.</div>
  </div>
  <p class="fine">Read-only access (products only) · uninstall anytime from your Apps page — your data
  deletes automatically · <a href="https://superx-ten.vercel.app/privacy">privacy</a> ·
  support: mohitab2005@gmail.com</p>`;
