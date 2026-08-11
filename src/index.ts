import { Hono } from "hono";

const app = new Hono<{ Bindings: Env }>();

const page = /* html */ `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>nenpyo.net — 近日公開</title>
<style>
  :root { color-scheme: dark; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Noto Sans JP", sans-serif;
    background: #05060a;
    color: #e8ecf4;
    display: grid;
    place-items: center;
    min-height: 100dvh;
    overflow: hidden;
    position: relative;
  }
  .aurora {
    position: fixed;
    inset: -30%;
    background:
      radial-gradient(40% 40% at 20% 30%, rgba(99,102,241,.35), transparent 60%),
      radial-gradient(45% 45% at 80% 20%, rgba(236,72,153,.28), transparent 60%),
      radial-gradient(50% 50% at 60% 85%, rgba(34,211,238,.25), transparent 60%);
    filter: blur(30px);
    animation: drift 18s ease-in-out infinite alternate;
    z-index: 0;
  }
  @keyframes drift {
    from { transform: translate3d(-3%, -2%, 0) scale(1); }
    to   { transform: translate3d(3%, 2%, 0) scale(1.1); }
  }
  main {
    position: relative;
    z-index: 1;
    text-align: center;
    padding: 2rem;
    animation: rise .9s cubic-bezier(.2,.7,.2,1) both;
  }
  @keyframes rise {
    from { opacity: 0; transform: translateY(16px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .greeting {
    font-size: clamp(1rem, 3.5vw, 1.4rem);
    color: #aeb6cc;
    letter-spacing: .04em;
    margin-bottom: 1.1rem;
  }
  .brand {
    font-size: clamp(2.75rem, 12vw, 6.5rem);
    font-weight: 800;
    line-height: 1;
    letter-spacing: -.03em;
    background: linear-gradient(120deg, #a5b4fc, #f0abfc 45%, #67e8f9);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    text-shadow: 0 0 60px rgba(129,140,248,.25);
  }
  .soon {
    margin-top: 1.6rem;
    display: inline-flex;
    align-items: center;
    gap: .6rem;
    font-size: clamp(.85rem, 3vw, 1.05rem);
    letter-spacing: .3em;
    text-transform: none;
    color: #cdd4e6;
    padding: .55rem 1.2rem;
    border: 1px solid rgba(255,255,255,.14);
    border-radius: 999px;
    background: rgba(255,255,255,.04);
    backdrop-filter: blur(6px);
  }
  .dot {
    width: .5rem; height: .5rem;
    border-radius: 50%;
    background: #67e8f9;
    box-shadow: 0 0 12px #67e8f9;
    animation: pulse 1.6s ease-in-out infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: .4; transform: scale(.8); }
    50%      { opacity: 1;  transform: scale(1.2); }
  }
</style>
</head>
<body>
  <div class="aurora" aria-hidden="true"></div>
  <main>
    <p class="greeting">どーも、バスケです</p>
    <h1 class="brand">nenpyo.net</h1>
    <span class="soon"><span class="dot"></span>近日公開</span>
  </main>
</body>
</html>`;

app.all("*", (c) => {
  return c.html(page, 503, {
    "Retry-After": "3600",
    "Cache-Control": "no-store",
  });
});

export default app;
