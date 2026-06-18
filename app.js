// Bluesky License — AT Protocol の公開APIでプロフィールを読み込み、運転免許証風カードを生成する
const API = "https://public.api.bsky.app/xrpc";

const $ = (id) => document.getElementById(id);
const canvas = $("license-canvas");
const ctx = canvas.getContext("2d");

let lastData = null;

function setStatus(msg, kind = "") {
  const el = $("status");
  el.textContent = msg;
  el.className = "status" + (kind ? " " + kind : "");
}

// ===== データ取得（Bluesky 公開API。CORS許可済み・認証不要）=====
async function fetchProfile(actor) {
  setStatus("Fetching Bluesky profile…");
  const p = await fetch(`${API}/app.bsky.actor.getProfile?actor=${encodeURIComponent(actor)}`)
    .then((r) => { if (!r.ok) throw new Error("Profile not found"); return r.json(); });

  // エンゲージメント：直近投稿の like + repost + reply を集計（Bluesky版の「反応」指標）
  setStatus("Fetching recent posts for engagement…");
  let engagement = 0, sampled = 0;
  try {
    const feed = await fetch(`${API}/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(p.did)}&limit=100&filter=posts_no_replies`)
      .then((r) => r.json());
    for (const it of (feed.feed || [])) {
      const post = it && it.post;
      if (!post) continue;
      sampled++;
      engagement += (post.likeCount || 0) + (post.repostCount || 0) + (post.replyCount || 0);
    }
  } catch {}

  const createdAt = p.createdAt ? Math.floor(Date.parse(p.createdAt) / 1000) : null;
  const lastSeen = p.indexedAt ? Math.floor(Date.parse(p.indexedAt) / 1000) : null;

  // 検証：カスタムドメイン handle（= ドメイン認証）または trusted verifier / verified
  const v = p.verification || {};
  const customDomain = !!p.handle && !/\.bsky\.social$/i.test(p.handle) && p.handle !== "handle.invalid";
  const verified = customDomain || v.verifiedStatus === "valid" || v.trustedVerifierStatus === "valid";

  return {
    did: p.did,
    handle: p.handle || "",
    name: p.displayName || p.handle || "NO NAME",
    picture: p.avatar || "",
    description: p.description || "",
    followers: p.followersCount || 0,
    follows: p.followsCount || 0,
    posts: p.postsCount || 0,
    engagement,
    engagementSampled: sampled,
    createdAt,
    lastSeen: lastSeen || createdAt || Math.floor(Date.now() / 1000),
    verified,
  };
}

// ===== ランク（実データ基準）=====
function computeRank(d) {
  const ageY = d.createdAt ? (Date.now() / 1000 - d.createdAt) / (365.25 * 24 * 3600) : 0;
  if (d.followers >= 10000 || ageY >= 3) return "BLUESKY VETERAN";
  if (d.followers >= 1000 || d.posts >= 1000) return "BLUESKY CITIZEN";
  if (d.posts >= 50 || d.followers >= 100) return "BLUESKY EXPLORER";
  return "BLUESKY NEWCOMER";
}

// 実数 → ★(1..5)。log スケール。
function starFrom(x, k, base = 1) {
  const n = Math.round(Math.log10((x || 0) + 1) * k) + base;
  return Math.max(1, Math.min(5, n));
}
// ステータス（5項目・すべて実データ）。2列グリッドで表示。各 {label, n, icon}
function computeStars(d) {
  const ageY = d.createdAt ? (Date.now() / 1000 - d.createdAt) / (365.25 * 24 * 3600) : 0;
  return [
    { label: "Communication", icon: "bubble", n: starFrom(d.posts, 1.4) },
    { label: "Followers", icon: "shield", n: starFrom(d.followers, 1.1) },
    { label: "Following", icon: "person", n: starFrom(d.follows, 1.4) },
    { label: "Engagement", icon: "bolt", n: starFrom(d.engagement, 1.2) },
    { label: "Veteran", icon: "relay", n: Math.max(1, Math.min(5, Math.round(ageY) + 1)) },
  ];
}

// ===== 画像ロード（CORS対策のため weserv プロキシにフォールバック）=====
function loadImage(url, { crossOrigin = true } = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}
async function loadAvatar(url) {
  if (!url) return null;
  try { return await loadImage(url); } catch {}
  try {
    const proxied = "https://images.weserv.nl/?url=" + encodeURIComponent(url) + "&w=480&h=480&fit=cover";
    return await loadImage(proxied);
  } catch {}
  return null;
}

// ===== QRコード生成（bsky.app プロフィールへのリンク）=====
async function makeQR(text) {
  try {
    const QR = (await import("https://esm.sh/qrcode@1.5.4")).default;
    const dataUrl = await QR.toDataURL(text, { margin: 1, width: 300, errorCorrectionLevel: "H", color: { dark: "#16233a", light: "#ffffff" } });
    return await loadImage(dataUrl);
  } catch {
    return null;
  }
}

// ===== 描画ユーティリティ =====
function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
function fmtISO(ts) {
  const dt = new Date(ts * 1000);
  const p = (n) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}
function licenseNo(d) {
  const h = d.did || d.handle || "";
  let n = 0; for (const ch of h) n = (n * 31 + ch.charCodeAt(0)) >>> 0;
  return `BSKY-${String(n % 10000).padStart(4, "0")}-${new Date().getFullYear()}`;
}
function hexPath(c, cx, cy, r) {
  c.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 90);
    const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
    i ? c.lineTo(x, y) : c.moveTo(x, y);
  }
  c.closePath();
}
function guilloche(c, cx, cy, R, amp, k, turns, color, alpha, lw = 1) {
  c.save();
  c.globalAlpha = alpha;
  c.strokeStyle = color;
  c.lineWidth = lw;
  c.beginPath();
  const steps = turns * 160;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * turns * Math.PI * 2;
    const r = R + amp * Math.cos(k * t);
    const x = cx + r * Math.cos(t), y = cy + r * Math.sin(t);
    i ? c.lineTo(x, y) : c.moveTo(x, y);
  }
  c.stroke();
  c.restore();
}
// 蝶（Bluesky）グリフ
function drawButterfly(c, cx, cy, s, col) {
  c.save();
  c.translate(cx, cy);
  c.fillStyle = col;
  c.beginPath(); c.ellipse(-0.42 * s, -0.30 * s, 0.42 * s, 0.60 * s, -0.55, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.ellipse(0.42 * s, -0.30 * s, 0.42 * s, 0.60 * s, 0.55, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.ellipse(-0.34 * s, 0.42 * s, 0.32 * s, 0.42 * s, 0.6, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.ellipse(0.34 * s, 0.42 * s, 0.32 * s, 0.42 * s, -0.6, 0, Math.PI * 2); c.fill();
  c.restore();
}
// 六角バッジ＋白い蝶（ブランドロゴ）
function drawHexLogo(c, cx, cy, s, colA, colB) {
  c.save();
  hexPath(c, cx, cy, s);
  const g = c.createLinearGradient(cx - s, cy - s, cx + s, cy + s);
  g.addColorStop(0, colA);
  g.addColorStop(1, colB);
  c.fillStyle = g;
  c.fill();
  c.lineWidth = Math.max(1, s * 0.05);
  c.strokeStyle = "rgba(255,255,255,0.55)";
  c.stroke();
  drawButterfly(c, cx, cy, s * 0.66, "#ffffff");
  c.restore();
}
function drawShield(c, cx, cy, w, h, t) {
  c.save();
  const x = cx - w / 2, y = cy - h / 2;
  c.beginPath();
  c.moveTo(cx, y);
  c.lineTo(x + w, y + h * 0.2);
  c.lineTo(x + w, y + h * 0.55);
  c.quadraticCurveTo(x + w, y + h * 0.9, cx, y + h);
  c.quadraticCurveTo(x, y + h * 0.9, x, y + h * 0.55);
  c.lineTo(x, y + h * 0.2);
  c.closePath();
  const g = c.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, "#dfeeff");
  g.addColorStop(0.5, "#dce8ff");
  g.addColorStop(1, "#e2f3ff");
  c.fillStyle = g;
  c.fill();
  c.lineWidth = 2.5;
  c.strokeStyle = t.border;
  c.globalAlpha = 0.75;
  c.stroke();
  c.globalAlpha = 1;
  const lw = w * 0.26, lh = h * 0.2, lx = cx - lw / 2, ly = cy - lh * 0.1;
  c.fillStyle = t.accent;
  roundRect(c, lx, ly, lw, lh, 4);
  c.fill();
  c.lineWidth = w * 0.07;
  c.strokeStyle = t.accent;
  c.beginPath();
  c.arc(cx, ly, lw * 0.32, Math.PI, 0);
  c.stroke();
  c.restore();
}
function drawHoloSeal(c, cx, cy, r) {
  c.save();
  const hues = ["#bfe3ff", "#cfe0ff", "#c9f0ff", "#d9eaff", "#e6f3ff"];
  for (let i = 0; i < 5; i++) guilloche(c, cx, cy, r - 6 - i * 3, 6 + i * 2, 7 + i, 3, hues[i], 0.55, 1.3);
  c.beginPath();
  c.arc(cx, cy, r, 0, Math.PI * 2);
  c.lineWidth = 2;
  c.strokeStyle = "rgba(80,140,230,0.5)";
  c.stroke();
  drawHexLogo(c, cx, cy, r * 0.34, "#1e9df1", "#0a63d6");
  c.restore();
}
function drawStatIcon(c, name, x, y, s, color) {
  c.save();
  c.fillStyle = color;
  c.strokeStyle = color;
  c.lineWidth = s * 0.12;
  c.lineCap = "round";
  c.lineJoin = "round";
  if (name === "bubble") {
    roundRect(c, x, y, s, s * 0.78, s * 0.22);
    c.fill();
    c.beginPath();
    c.moveTo(x + s * 0.25, y + s * 0.72);
    c.lineTo(x + s * 0.18, y + s);
    c.lineTo(x + s * 0.45, y + s * 0.72);
    c.closePath();
    c.fill();
  } else if (name === "relay") {
    const pts = [[x + s * 0.5, y + s * 0.16], [x + s * 0.14, y + s * 0.84], [x + s * 0.86, y + s * 0.84]];
    c.beginPath();
    c.moveTo(pts[0][0], pts[0][1]); c.lineTo(pts[1][0], pts[1][1]);
    c.moveTo(pts[0][0], pts[0][1]); c.lineTo(pts[2][0], pts[2][1]);
    c.moveTo(pts[1][0], pts[1][1]); c.lineTo(pts[2][0], pts[2][1]);
    c.stroke();
    for (const p of pts) { c.beginPath(); c.arc(p[0], p[1], s * 0.13, 0, Math.PI * 2); c.fill(); }
  } else if (name === "shield") {
    c.beginPath();
    c.moveTo(x + s * 0.5, y);
    c.lineTo(x + s, y + s * 0.22);
    c.lineTo(x + s, y + s * 0.55);
    c.quadraticCurveTo(x + s, y + s * 0.92, x + s * 0.5, y + s);
    c.quadraticCurveTo(x, y + s * 0.92, x, y + s * 0.55);
    c.lineTo(x, y + s * 0.22);
    c.closePath();
    c.fill();
    c.strokeStyle = "#fff";
    c.lineWidth = s * 0.1;
    c.beginPath();
    c.moveTo(x + s * 0.3, y + s * 0.52);
    c.lineTo(x + s * 0.45, y + s * 0.68);
    c.lineTo(x + s * 0.72, y + s * 0.34);
    c.stroke();
  } else if (name === "bolt") {
    c.beginPath();
    c.moveTo(x + s * 0.56, y);
    c.lineTo(x + s * 0.16, y + s * 0.56);
    c.lineTo(x + s * 0.46, y + s * 0.56);
    c.lineTo(x + s * 0.4, y + s);
    c.lineTo(x + s * 0.84, y + s * 0.42);
    c.lineTo(x + s * 0.52, y + s * 0.42);
    c.closePath();
    c.fill();
  } else if (name === "person") {
    c.beginPath();
    c.arc(x + s * 0.5, y + s * 0.28, s * 0.22, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.moveTo(x + s * 0.1, y + s);
    c.quadraticCurveTo(x + s * 0.5, y + s * 0.5, x + s * 0.9, y + s);
    c.closePath();
    c.fill();
  }
  c.restore();
}
function drawStarRating(c, x, y, n, size, fill, empty) {
  c.textAlign = "left";
  c.textBaseline = "middle";
  c.font = `${size}px 'Hiragino Sans','Apple Color Emoji',sans-serif`;
  for (let i = 0; i < 5; i++) {
    c.fillStyle = i < n ? fill : empty;
    c.fillText(i < n ? "★" : "☆", x + i * size * 0.96, y);
  }
}
function drawPill(c, text, x, y, { bg, fg, font, padX = 14, h = 34, r = 7 }) {
  c.font = font;
  c.textAlign = "left";
  c.textBaseline = "middle";
  const w = c.measureText(text).width + padX * 2;
  roundRect(c, x, y, w, h, r);
  c.fillStyle = bg;
  c.fill();
  c.fillStyle = fg;
  c.fillText(text, x + padX, y + h / 2 + 1);
  return w;
}
// 車アイコン（Material 未読込時のフォールバック）
function drawCar(c, x, cy, color) {
  c.save();
  c.translate(x, cy);
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(2, 4);
  c.lineTo(2, -2);
  c.quadraticCurveTo(2, -5, 8, -6);
  c.lineTo(15, -6);
  c.quadraticCurveTo(20, -16, 31, -16);
  c.lineTo(40, -16);
  c.quadraticCurveTo(49, -15, 54, -6);
  c.lineTo(60, -5);
  c.quadraticCurveTo(64, -4, 64, 0);
  c.lineTo(64, 4);
  c.quadraticCurveTo(64, 7, 60, 7);
  c.lineTo(6, 7);
  c.quadraticCurveTo(2, 7, 2, 4);
  c.closePath();
  c.fill();
  c.fillStyle = "rgba(255,255,255,0.78)";
  c.beginPath();
  c.moveTo(19, -6); c.lineTo(23, -14); c.lineTo(31, -14); c.lineTo(31, -6); c.closePath(); c.fill();
  c.beginPath();
  c.moveTo(34, -6); c.lineTo(34, -14); c.lineTo(39, -14); c.quadraticCurveTo(46, -13, 49, -6); c.closePath(); c.fill();
  c.fillStyle = "#2a3550";
  c.beginPath(); c.arc(18, 8, 7, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.arc(49, 8, 7, 0, Math.PI * 2); c.fill();
  c.fillStyle = "#e7ecf6";
  c.beginPath(); c.arc(18, 8, 3, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.arc(49, 8, 3, 0, Math.PI * 2); c.fill();
  c.restore();
}

const THEMES = {
  sky:   { accent: "#1185fe", accent2: "#0a63d6", ink: "#10243f", sub: "#3a5680", line: "#9fc0ef", border: "#1185fe", gold1: "#dcc07f", gold2: "#b48a3c", paper: ["#eef5ff", "#eef1fc", "#f2f6ff"] },
  cyber: { accent: "#0a9fc0", accent2: "#d6249f", ink: "#142539", sub: "#3a5066", line: "#9bd3e2", border: "#0a9fc0", gold1: "#bcae72", gold2: "#8c7a38", paper: ["#eafaff", "#eef0fb", "#fde8f6"] },
  gold:  { accent: "#b4863a", accent2: "#9a6b1e", ink: "#2a2206", sub: "#5a4d22", line: "#dcc79a", border: "#b4863a", gold1: "#e6cd84", gold2: "#b4863a", paper: ["#fffaf0", "#fff4e2", "#fdeed6"] },
};

// ===== カード描画（高級ホログラム調 / 英語表記）=====
async function renderCard(d, theme = "sky") {
  const t = THEMES[theme] || THEMES.sky;
  const c = ctx;
  const W = canvas.width, H = canvas.height; // 1568 x 984
  c.clearRect(0, 0, W, H);
  c.lineCap = "round";
  c.lineJoin = "round";

  let carFont = false;
  try {
    await document.fonts.load('400 46px "Material Symbols Outlined"', "electric_car");
    carFont = document.fonts.check('400 46px "Material Symbols Outlined"');
  } catch {}

  // ===== 背景（イリデッセント）=====
  const bg = c.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, t.paper[0]);
  bg.addColorStop(0.5, t.paper[1]);
  bg.addColorStop(1, t.paper[2]);
  roundRect(c, 0, 0, W, H, 24);
  c.fillStyle = bg;
  c.fill();

  c.save();
  roundRect(c, 0, 0, W, H, 24);
  c.clip();

  const sheen = c.createLinearGradient(0, H, W, 0);
  sheen.addColorStop(0.0, "rgba(120,180,255,0.10)");
  sheen.addColorStop(0.35, "rgba(150,200,255,0.06)");
  sheen.addColorStop(0.6, "rgba(180,210,255,0.07)");
  sheen.addColorStop(0.85, "rgba(160,230,255,0.06)");
  sheen.addColorStop(1.0, "rgba(200,225,255,0.08)");
  c.fillStyle = sheen;
  c.fillRect(0, 0, W, H);

  // 地紋：別キャンバスに不透明で一度だけ描き、最後に1回だけ薄く合成（端末差を防ぐ）
  {
    const off = document.createElement("canvas");
    off.width = W; off.height = H;
    const g = off.getContext("2d");
    g.lineCap = "round"; g.lineJoin = "round";
    for (let i = 0; i < 78; i++) {
      const yy = 26 + i * 12.4;
      g.strokeStyle = i % 2 ? t.line : t.accent;
      g.lineWidth = 1;
      g.beginPath();
      for (let x = 24; x <= W - 24; x += 5) {
        const y2 = yy + Math.sin(x / 44 + i * 0.55) * 7 + Math.sin(x / 128 - i * 0.32) * 5 + Math.cos(x / 320 + i * 0.12) * 3;
        x === 24 ? g.moveTo(x, y2) : g.lineTo(x, y2);
      }
      g.stroke();
    }
    for (let j = 0; j < 50; j++) {
      const xx = 24 + j * 31;
      g.strokeStyle = j % 2 ? t.accent : t.line;
      g.lineWidth = 1;
      g.beginPath();
      for (let y = 24; y <= H - 24; y += 6) {
        const x2 = xx + Math.sin(y / 50 + j * 0.5) * 6 + Math.sin(y / 150 - j * 0.3) * 4;
        y === 24 ? g.moveTo(x2, y) : g.lineTo(x2, y);
      }
      g.stroke();
    }
    guilloche(g, W * 0.20, H * 0.34, 230, 74, 9, 26, t.accent, 1, 1);
    guilloche(g, W * 0.20, H * 0.34, 150, 52, 14, 26, t.accent2, 1, 1);
    guilloche(g, W * 0.50, H * 0.50, 380, 104, 7, 30, t.accent, 1, 1);
    guilloche(g, W * 0.50, H * 0.50, 250, 84, 17, 26, t.accent2, 1, 1);
    guilloche(g, W * 0.83, H * 0.72, 210, 66, 11, 24, t.accent2, 1, 1);
    guilloche(g, W * 0.83, H * 0.72, 130, 46, 16, 24, t.accent, 1, 1);
    for (const [px, py] of [[110, 120], [W - 120, 120], [120, H - 110], [W - 120, H - 110]]) {
      guilloche(g, px, py, 70, 26, 13, 18, t.accent, 1, 1);
    }
    g.globalCompositeOperation = "destination-out";
    const fade = g.createLinearGradient(0, 0, 0, H);
    fade.addColorStop(0.0, "rgba(0,0,0,0)");
    fade.addColorStop(1.0, "rgba(0,0,0,0.5)");
    g.fillStyle = fade;
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = "source-over";
    c.save();
    c.globalAlpha = 0.20;
    c.drawImage(off, 0, 0);
    c.restore();
  }

  const streak = c.createLinearGradient(0, 0, W, H);
  streak.addColorStop(0.30, "rgba(255,255,255,0)");
  streak.addColorStop(0.44, "rgba(150,200,255,0.16)");
  streak.addColorStop(0.50, "rgba(180,210,255,0.18)");
  streak.addColorStop(0.56, "rgba(170,220,255,0.14)");
  streak.addColorStop(0.70, "rgba(255,255,255,0)");
  c.fillStyle = streak;
  c.fillRect(0, 0, W, H);

  // 透かしの大きな蝶
  c.save();
  c.globalAlpha = 0.06;
  drawButterfly(c, W * 0.46, 330, 150, t.accent);
  c.restore();

  c.restore(); // unclip

  // ===== 枠線（二重）=====
  c.lineWidth = 5;
  c.strokeStyle = t.border;
  roundRect(c, 10, 10, W - 20, H - 20, 20);
  c.stroke();
  c.lineWidth = 1.5;
  c.strokeStyle = "rgba(17,133,254,0.45)";
  roundRect(c, 22, 22, W - 44, H - 44, 14);
  c.stroke();

  const PAD = 70;

  // ===== ヘッダー =====
  c.textAlign = "left";
  c.textBaseline = "alphabetic";
  c.fillStyle = "#11151c";
  c.font = "800 76px 'Hiragino Sans','Yu Gothic','Arial Black',sans-serif";
  c.fillText("BLUESKY LICENSE", PAD, 118);
  c.fillStyle = t.accent;
  c.font = "italic 600 30px 'Hiragino Sans','Georgia',serif";
  c.fillText("Your handle, your identity.", PAD + 4, 158);

  c.textAlign = "right";
  c.fillStyle = t.accent;
  c.font = "800 30px 'Hiragino Sans',sans-serif";
  c.fillText("BLUESKY SOCIAL", W - PAD - 86, 102);
  drawHexLogo(c, W - PAD - 36, 90, 40, t.accent, t.accent2);

  c.strokeStyle = t.line;
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(PAD, 182);
  c.lineTo(W * 0.62, 182);
  c.stroke();
  c.setLineDash([6, 8]);
  c.beginPath();
  c.moveTo(W * 0.62, 182);
  c.lineTo(W - PAD, 182);
  c.stroke();
  c.setLineDash([]);

  const rank = computeRank(d);

  // ===== 写真 =====
  const phX = 850, phY = 202, phW = 360, phH = 468, phR = 16;
  c.save();
  c.shadowColor = "rgba(30,40,80,0.28)";
  c.shadowBlur = 26;
  c.shadowOffsetY = 10;
  roundRect(c, phX, phY, phW, phH, phR);
  c.fillStyle = "#e7ecf6";
  c.fill();
  c.restore();
  c.save();
  roundRect(c, phX, phY, phW, phH, phR);
  c.clip();
  if (d._avatar) {
    const img = d._avatar;
    const ratio = Math.max(phW / img.width, phH / img.height);
    const dw = img.width * ratio, dh = img.height * ratio;
    c.drawImage(img, phX + (phW - dw) / 2, phY + (phH - dh) / 2, dw, dh);
  } else {
    c.fillStyle = t.sub;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.font = "22px sans-serif";
    c.fillText("NO IMAGE", phX + phW / 2, phY + phH / 2);
  }
  c.restore();
  c.lineWidth = 3;
  c.strokeStyle = "rgba(255,255,255,0.9)";
  roundRect(c, phX + 2, phY + 2, phW - 4, phH - 4, phR - 2);
  c.stroke();
  c.lineWidth = 2;
  c.strokeStyle = t.border;
  roundRect(c, phX, phY, phW, phH, phR);
  c.stroke();

  // ===== 左カラム：フィールド =====
  const lx = PAD;
  const fieldMaxW = phX - 40 - lx;
  c.textAlign = "left";
  c.textBaseline = "alphabetic";

  drawPill(c, "NAME", lx, 208, { bg: t.accent, fg: "#fff", font: "700 22px 'Hiragino Sans',sans-serif", h: 34 });
  c.fillStyle = t.ink;
  c.font = "800 58px 'Hiragino Sans','Yu Gothic',sans-serif";
  c.fillText(d.name, lx, 292);
  if (d.handle) {
    c.fillStyle = t.accent;
    c.font = "600 28px 'Hiragino Sans',sans-serif";
    c.fillText("@" + d.handle, lx, 348);
  }

  // DID
  drawPill(c, "DID", lx, 386, { bg: t.accent, fg: "#fff", font: "700 22px 'Hiragino Sans',sans-serif", h: 34 });
  c.fillStyle = t.ink;
  let dp = 28;
  while (dp > 13) {
    c.font = `600 ${dp}px 'SF Mono','Menlo','Consolas',monospace`;
    if (c.measureText(d.did).width <= fieldMaxW) break;
    dp -= 1;
  }
  c.fillText(d.did, lx, 444);

  // HANDLE（検証マーク付き）
  drawPill(c, "HANDLE", lx, 496, { bg: t.accent, fg: "#fff", font: "700 22px 'Hiragino Sans',sans-serif", h: 34 });
  const handleText = d.handle ? "@" + d.handle : "—";
  let hp = 32;
  while (hp > 14) {
    c.font = `600 ${hp}px 'SF Mono','Menlo','Consolas',monospace`;
    if (c.measureText(handleText).width <= fieldMaxW - 36) break;
    hp -= 1;
  }
  c.fillStyle = t.ink;
  c.fillText(handleText, lx, 552);
  if (d.handle && d.verified) {
    const aw = c.measureText(handleText).width;
    c.font = "700 28px 'Hiragino Sans',sans-serif";
    c.fillStyle = "#1c9e57";
    c.fillText("✓", lx + aw + 12, 551);
  }

  // 下段3カラム（ISSUED / CREATED / LICENSE CLASS）
  const THREE_YEARS = 3 * 365.25 * 24 * 3600;
  const rowY = 614;
  const col = [lx, lx + 230, lx + 450];
  c.fillStyle = t.sub;
  c.font = "700 19px 'Hiragino Sans',sans-serif";
  c.fillText("ISSUED", col[0], rowY);
  c.fillText("CREATED", col[1], rowY);
  c.fillText("LICENSE CLASS", col[2], rowY);
  c.fillStyle = t.ink;
  c.font = "400 25px 'Hiragino Sans',sans-serif";
  c.fillText(fmtISO(Math.floor(Date.now() / 1000)), col[0], rowY + 32);
  c.fillText(d.createdAt ? fmtISO(d.createdAt) : "—", col[1], rowY + 32);
  drawPill(c, rank, col[2], rowY + 20, { bg: t.accent2, fg: "#fff", font: "700 21px 'Hiragino Sans',sans-serif", h: 34 });

  // ===== 右カラム =====
  const rlx = 1250;
  const rcx = 1392;
  c.textAlign = "left";
  c.fillStyle = t.sub;
  c.font = "700 22px 'Hiragino Sans',sans-serif";
  c.fillText("LICENSE NO.", rlx, 222);
  c.fillStyle = t.ink;
  c.font = "500 25px 'Hiragino Sans',sans-serif";
  c.fillText(licenseNo(d), rlx, 260);
  c.fillStyle = t.sub;
  c.font = "700 22px 'Hiragino Sans',sans-serif";
  c.fillText("VALID THRU", rlx, 316);
  c.fillStyle = t.ink;
  c.font = "500 25px 'Hiragino Sans',sans-serif";
  c.fillText(fmtISO(d.lastSeen + THREE_YEARS), rlx, 354);

  drawShield(c, rcx, 442, 96, 116, t);
  c.fillStyle = t.sub;
  c.textAlign = "center";
  c.font = "700 22px 'Hiragino Sans',sans-serif";
  c.fillText("SELF-SOVEREIGN", rcx, 528);
  c.fillText("IDENTITY", rcx, 554);

  if (d._qr) {
    const qs = 150, qx = rcx - qs / 2, qy = 588;
    c.fillStyle = "#fff";
    roundRect(c, qx - 10, qy - 10, qs + 20, qs + 20, 14);
    c.fill();
    c.drawImage(d._qr, qx, qy, qs, qs);
    drawHexLogo(c, qx + qs / 2, qy + qs / 2, 21, t.accent, t.accent2);
  }

  // ===== ステータス・パネル =====
  const pnX = 60, pnY = 712, pnW = 1000, pnH = 182;
  c.save();
  c.shadowColor = "rgba(80,60,20,0.18)";
  c.shadowBlur = 16;
  c.shadowOffsetY = 6;
  const pg = c.createLinearGradient(pnX, pnY, pnX, pnY + pnH);
  pg.addColorStop(0, "#f6efdc");
  pg.addColorStop(1, "#efe6cf");
  roundRect(c, pnX, pnY, pnW, pnH, 12);
  c.fillStyle = pg;
  c.fill();
  c.restore();
  c.lineWidth = 1.5;
  c.strokeStyle = t.gold2;
  c.globalAlpha = 0.6;
  roundRect(c, pnX, pnY, pnW, pnH, 12);
  c.stroke();
  c.globalAlpha = 1;

  c.save();
  const tbW = 404, tbH = 46, tbX = pnX + 16, tbY = pnY - 20;
  c.beginPath();
  c.moveTo(tbX, tbY + 12);
  c.arcTo(tbX, tbY, tbX + 12, tbY, 12);
  c.lineTo(tbX + tbW, tbY);
  c.lineTo(tbX + tbW - 28, tbY + tbH);
  c.lineTo(tbX + 12, tbY + tbH);
  c.arcTo(tbX, tbY + tbH, tbX, tbY + tbH - 12, 12);
  c.closePath();
  const tg = c.createLinearGradient(tbX, tbY, tbX, tbY + tbH);
  tg.addColorStop(0, t.gold1);
  tg.addColorStop(1, t.gold2);
  c.fillStyle = tg;
  c.fill();
  c.fillStyle = "#3a2c08";
  c.textAlign = "left";
  c.textBaseline = "middle";
  c.font = "800 24px 'Hiragino Sans',sans-serif";
  c.fillText("BLUESKY FLYER PROFILE", tbX + 24, tbY + tbH / 2 + 1);
  c.restore();

  const stats = computeStars(d);
  const colX = [pnX + 40, pnX + 510];
  const rowsY = [pnY + 56, pnY + 106, pnY + 156];
  for (let i = 0; i < stats.length; i++) {
    const s = stats[i];
    const cxp = colX[i % 2];
    const cyp = rowsY[Math.floor(i / 2)];
    drawStatIcon(c, s.icon, cxp, cyp - 15, 28, t.accent);
    c.fillStyle = t.ink;
    c.textAlign = "left";
    c.textBaseline = "middle";
    c.font = "700 27px 'Hiragino Sans',sans-serif";
    c.fillText(s.label, cxp + 44, cyp);
    drawStarRating(c, cxp + 296, cyp, s.n, 28, "#1e2a5a", "#b9c1d7");
  }

  // ===== 署名・ホロ印 =====
  c.fillStyle = "#1b2336";
  c.textAlign = "center";
  c.textBaseline = "alphabetic";
  c.font = "italic 600 44px 'Snell Roundhand','Apple Chancery','Brush Script MT',cursive";
  c.fillText(d.handle || d.name, 1285, 828);
  c.fillStyle = t.sub;
  c.font = "700 20px 'Hiragino Sans',sans-serif";
  c.fillText("AUTHORIZED BY BLUESKY", 1285, 866);
  drawHoloSeal(c, 1486, 832, 48);

  // ===== 最下段：キャッチ =====
  const capY = 936;
  if (carFont) {
    c.fillStyle = t.accent;
    c.textAlign = "left";
    c.textBaseline = "middle";
    c.font = '400 40px "Material Symbols Outlined"';
    c.fillText("electric_car", PAD, capY);
  } else {
    drawCar(c, PAD, capY, t.accent);
  }
  c.fillStyle = "#2a3550";
  c.textAlign = "left";
  c.textBaseline = "middle";
  c.font = "600 25px 'Hiragino Sans',sans-serif";
  c.fillText("Fly the open social web.", PAD + 64, capY);

  c.fillStyle = t.accent;
  c.textAlign = "right";
  c.font = "800 25px 'Hiragino Sans',sans-serif";
  c.fillText("SEE YOU IN THE SKY.", W - PAD, capY);

  $("download-btn").disabled = false;
}

// ===== 発行フロー =====
function normalizeActor(raw) {
  raw = raw.trim().replace(/^@/, "");
  if (raw.startsWith("http")) {
    const m = raw.match(/\/profile\/([^/?#]+)/);
    if (m) raw = m[1];
  }
  if (!raw) throw new Error("Enter a handle or DID");
  return raw;
}

async function issueFor(actor) {
  try {
    const data = await fetchProfile(actor);
    setStatus("Generating avatar / QR…");
    const [avatar, qr] = await Promise.all([
      loadAvatar(data.picture),
      makeQR("https://bsky.app/profile/" + (data.handle || data.did)),
    ]);
    data._avatar = avatar;
    data._qr = qr;
    lastData = data;

    await renderCard(data, $("theme-select").value);
    setStatus(
      `Done: ${data.name} | posts ${data.posts} / followers ${data.followers} / following ${data.follows} / engagement ${data.engagement}${data.verified ? " / verified ✓" : ""}`,
      "ok"
    );
  } catch (err) {
    console.error(err);
    setStatus("Error: " + (err?.message || err), "error");
  }
}

$("manual-btn").addEventListener("click", async () => {
  const raw = $("npub-input").value;
  if (!raw.trim()) { setStatus("Enter a handle or DID", "error"); return; }
  try {
    await issueFor(normalizeActor(raw));
  } catch (err) {
    setStatus("Error: " + (err?.message || err), "error");
  }
});
$("npub-input").addEventListener("keydown", (e) => { if (e.key === "Enter") $("manual-btn").click(); });

$("theme-select").addEventListener("change", () => {
  if (lastData) renderCard(lastData, $("theme-select").value);
});

// 初期プレースホルダ描画
(function initPlaceholder() {
  const t = THEMES.sky;
  const g = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  g.addColorStop(0, t.paper[0]);
  g.addColorStop(0.5, t.paper[1]);
  g.addColorStop(1, t.paper[2]);
  roundRect(ctx, 0, 0, canvas.width, canvas.height, 24);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = t.border;
  roundRect(ctx, 10, 10, canvas.width - 20, canvas.height - 20, 20);
  ctx.stroke();
  guilloche(ctx, canvas.width * 0.5, canvas.height * 0.5, 320, 90, 7, 18, t.accent, 0.06, 1);
  ctx.fillStyle = t.sub;
  ctx.font = "700 30px 'Hiragino Sans','Noto Sans JP',sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Enter a handle or DID and press Issue", canvas.width / 2, canvas.height / 2);
})();

$("download-btn").addEventListener("click", () => {
  try {
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = "bluesky-license.png";
    a.click();
  } catch (err) {
    setStatus("Download failed (possible avatar CORS restriction): " + err.message, "error");
  }
});
