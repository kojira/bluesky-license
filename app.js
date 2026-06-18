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

// ===== i18n（フロントUIのみ。カード本体は英語固定）=====
let LANG = "en";
const L = () => I18N[LANG] || I18N.en;
const doneSummary = (d, words) => {
  const plus = (v, c) => v + (c ? "+" : "");
  const gen = d.pdsOk ? plus(d.likesGiven, d.likesCapped) : "—";
  return `${words.done}: ${d.name} | ${words.mileage} ${d.posts} / WoT ${plus(d.wot, d.wotCapped)} / ${words.engagement} ${plus(d.engagement, d.postsCapped)} / ${words.generosity} ${gen} / ${words.velocity} ${d.velocity.toFixed(1)}/d / ${words.streak} ${d.streak}d / ${words.peak} ${d.peakUTC}${d.verified ? " / verified ✓" : ""}`;
};
const I18N = {
  en: {
    tagline: "Turn your Bluesky identity into a driver's-license-style card.",
    ph: "Handle or DID (e.g. user.bsky.social)",
    issue: "Issue", design: "Design", language: "Language", lang_auto: "Auto",
    avatarFit: "Square avatar (no cropping)",
    th_sky: "Bluesky (blue)", th_skyphoto: "Blue Sky photo", th_sunset: "Sunset", th_mint: "Mint", th_cyber: "Cyberpunk", th_gold: "Gold license",
    download: "Download PNG", about: "About / notes",
    a1: "Enter a Bluesky handle (e.g. <code>user.bsky.social</code> or a custom domain) or a DID, then press Issue.",
    a2: "Reads public AT Protocol data: profile, plus your posts / likes / follows (up to the most recent 1000) and the follower graph. No login required.",
    a3: "Stats: Web of Trust (mutual follows), Engagement, Generosity (likes given), Velocity, Streak, Veteran — plus Mileage and peak posting hours (UTC).",
    a4: "HANDLE shows a green ✓ when the account is verified (custom-domain handle, or Bluesky verified / trusted-verifier status).",
    a5: "This is an <strong>unofficial fan card</strong> for fun — not affiliated with Bluesky, and not an official ID.",
    glossary: "Card terms",
    glossaryHtml: `<dl class="glossary">
      <dt>Web of Trust</dt><dd>Mutual follows — people you follow who also follow you back.</dd>
      <dt>Engagement</dt><dd>Total likes + reposts + replies your recent posts received.</dd>
      <dt>Generosity</dt><dd>Total likes you've given to others.</dd>
      <dt>Velocity</dt><dd>Posts per day (total posts ÷ account age).</dd>
      <dt>Streak</dt><dd>Your longest run of consecutive days with at least one post.</dd>
      <dt>Veteran</dt><dd>How long your account has existed.</dd>
      <dt>Mileage</dt><dd>Your total number of posts — like an odometer.</dd>
      <dt>Peak (UTC)</dt><dd>The 2-hour window, in UTC, when you post the most.</dd>
      <dt>DID</dt><dd>Your decentralized identifier (<code>did:plc:…</code>) — the permanent ID behind your handle.</dd>
      <dt>Handle ✓</dt><dd>Your @handle. A green ✓ means verified: a custom-domain handle, or Bluesky verified / trusted-verifier status.</dd>
      <dt>License Class</dt><dd>A rank from your stats: Newcomer → Explorer → Citizen → Veteran.</dd>
      <dt>Valid Thru</dt><dd>A playful "expiry": last activity + 3 years.</dd>
      <dt>Sampling</dt><dd>Analysis covers up to your most recent ~1000 posts/likes and up to 2500 follows (for mutuals). Bigger accounts show "+".</dd>
    </dl>`,
    canvasHint: "Enter a handle or DID and press Issue",
    stProfile: "Fetching Bluesky profile…",
    stPosts: (n, m) => `Analyzing posts… ${n}/${m}`,
    stWoT: (n, m) => `Computing Web of Trust… ${n}/${m}`,
    stLikes: "Counting likes given…",
    stAvatar: "Generating avatar / QR…",
    stDone: (d) => doneSummary(d, { done: "Done", mileage: "mileage", engagement: "engagement", generosity: "generosity", velocity: "velocity", streak: "streak", peak: "peak" }),
    err: (m) => "Error: " + m,
    errEnter: "Enter a handle or DID",
    errNotFound: "Profile not found",
    errDownload: (m) => "Download failed (possible avatar CORS restriction): " + m,
  },
  ja: {
    tagline: "あなたのBlueskyアイデンティティを運転免許証風カードにします。",
    ph: "ハンドル または DID（例: user.bsky.social）",
    issue: "発行", design: "デザイン", language: "言語", lang_auto: "自動",
    avatarFit: "アイコンを正方形で表示（切り取りなし）",
    th_sky: "Bluesky（ブルー）", th_skyphoto: "青空写真", th_sunset: "サンセット", th_mint: "ミント", th_cyber: "サイバーパンク", th_gold: "ゴールド",
    download: "PNGをダウンロード", about: "このサービスについて / 注意",
    a1: "Blueskyのハンドル（例: <code>user.bsky.social</code> やカスタムドメイン）または DID を入力して「発行」を押してください。",
    a2: "AT Protocol の公開データを読み込みます：プロフィールに加え、あなたの投稿／いいね／フォロー（直近最大1000件）とフォロワーグラフ。ログイン不要。",
    a3: "指標：Web of Trust（相互フォロー）／ Engagement ／ Generosity（付けたいいね）／ Velocity ／ Streak ／ Veteran ＋ Mileage と最も投稿が多い時間帯（UTC）。",
    a4: "アカウントが認証済み（カスタムドメインのハンドル、または Bluesky の verified / trusted-verifier）のとき、HANDLE に緑の ✓ が付きます。",
    a5: "これは<strong>非公式のファンカード</strong>（遊び）です。Blueskyとは無関係で、公的な身分証ではありません。",
    glossary: "カードの用語解説",
    glossaryHtml: `<dl class="glossary">
      <dt>Web of Trust</dt><dd>相互フォロー数。あなたがフォローしていて、相手もあなたをフォローし返している人数。</dd>
      <dt>Engagement</dt><dd>直近の投稿が受け取った いいね＋リポスト＋返信 の合計。</dd>
      <dt>Generosity</dt><dd>あなたが他の人に付けた いいね の総数。</dd>
      <dt>Velocity</dt><dd>1日あたりの投稿数（総投稿 ÷ アカウント日数）。</dd>
      <dt>Streak</dt><dd>1投稿以上した日が連続した最長日数。</dd>
      <dt>Veteran</dt><dd>アカウントの利用期間（古さ）。</dd>
      <dt>Mileage</dt><dd>総投稿数。オドメーター（走行距離）的な表示。</dd>
      <dt>Peak (UTC)</dt><dd>最も投稿が多い2時間帯（UTC・協定世界時）。</dd>
      <dt>DID</dt><dd>分散型ID（<code>did:plc:…</code>）。ハンドルの裏にある不変の識別子。</dd>
      <dt>Handle ✓</dt><dd>あなたの @ハンドル。緑の ✓ は認証済み（カスタムドメインのハンドル、または Bluesky の verified / trusted-verifier）。</dd>
      <dt>License Class</dt><dd>指標から決まるランク：Newcomer → Explorer → Citizen → Veteran。</dd>
      <dt>Valid Thru</dt><dd>遊びの「有効期限」：最終アクティビティ＋3年。</dd>
      <dt>Sampling（取得上限）</dt><dd>解析は直近およそ1000件の投稿/いいね、相互フォローは最大2500フォローまで。超過は「+」表示。</dd>
    </dl>`,
    canvasHint: "ハンドル または DID を入力して「発行」",
    stProfile: "Blueskyプロフィールを取得中…",
    stPosts: (n, m) => `投稿を解析中… ${n}/${m}`,
    stWoT: (n, m) => `Web of Trust を計算中… ${n}/${m}`,
    stLikes: "付けたいいねを集計中…",
    stAvatar: "アバター / QR を生成中…",
    stDone: (d) => doneSummary(d, { done: "完了", mileage: "投稿", engagement: "反応", generosity: "いいね魂", velocity: "速度", streak: "連続", peak: "ピーク" }),
    err: (m) => "エラー: " + m,
    errEnter: "ハンドル または DID を入力してください",
    errNotFound: "プロフィールが見つかりません",
    errDownload: (m) => "ダウンロード失敗（アバター画像のCORS制限の可能性）: " + m,
  },
};
function detectLang() {
  const n = (navigator.language || (navigator.languages && navigator.languages[0]) || "en").toLowerCase();
  return n.startsWith("ja") ? "ja" : "en";
}
function applyLang(choice) {
  LANG = choice === "auto" || !choice ? detectLang() : (I18N[choice] ? choice : "en");
  document.documentElement.lang = LANG;
  const dict = L();
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const v = dict[el.getAttribute("data-i18n")];
    if (v != null) el.innerHTML = v;
  });
  document.querySelectorAll("[data-i18n-ph]").forEach((el) => {
    const v = dict[el.getAttribute("data-i18n-ph")];
    if (v != null) el.placeholder = v;
  });
  if (!lastData) drawPlaceholder();
}

const MAX_RECORDS = 1000; // 解析の取得上限（直近 N 件）
const THROTTLE_MS = 80;   // API 連続呼び出しの間隔（公開APIに優しく）
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// DID から PDS エンドポイントを解決
async function resolvePds(did) {
  try {
    if (did.startsWith("did:plc:")) {
      const doc = await fetch(`https://plc.directory/${did}`).then((r) => r.json());
      const svc = (doc.service || []).find((s) => (s.id || "").endsWith("atproto_pds"));
      return svc ? svc.serviceEndpoint : null;
    }
    if (did.startsWith("did:web:")) {
      const host = did.slice("did:web:".length).replace(/:/g, "/");
      const doc = await fetch(`https://${host}/.well-known/did.json`).then((r) => r.json());
      const svc = (doc.service || []).find((s) => (s.id || "").endsWith("atproto_pds"));
      return svc ? svc.serviceEndpoint : null;
    }
  } catch {}
  return null;
}

// PDS の listRecords でコレクションを最大 max 件まで数える（{ count, capped }）
async function countRecords(pds, did, collection, max) {
  let cursor = null, count = 0;
  const pagesMax = Math.ceil(max / 100);
  for (let page = 0; page < pagesMax; page++) {
    const url = `${pds}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(did)}&collection=${collection}&limit=100` + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : "");
    let j;
    try { j = await fetch(url).then((r) => { if (!r.ok) throw 0; return r.json(); }); } catch { break; }
    const recs = j.records || [];
    count += recs.length;
    cursor = j.cursor;
    if (!cursor || recs.length === 0) return { count, capped: false };
    await sleep(THROTTLE_MS);
  }
  return { count, capped: true };
}

// 自分の投稿（リポスト除外）を最大 max 件取得 → タイムスタンプとエンゲージメント
async function fetchAuthorPosts(did, max) {
  let cursor = null;
  const posts = [];
  const pagesMax = Math.ceil(max / 100);
  for (let page = 0; page < pagesMax; page++) {
    setStatus(L().stPosts(posts.length, max));
    const url = `${API}/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(did)}&limit=100&filter=posts_with_replies` + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : "");
    let j;
    try { j = await fetch(url).then((r) => r.json()); } catch { break; }
    for (const it of (j.feed || [])) {
      if (it.reason) continue; // リポストは除外
      const p = it.post;
      if (!p || !p.author || p.author.did !== did) continue;
      const ts = Date.parse((p.record && p.record.createdAt) || p.indexedAt);
      if (!isFinite(ts)) continue;
      posts.push({ ts: Math.floor(ts / 1000), eng: (p.likeCount || 0) + (p.repostCount || 0) + (p.replyCount || 0) });
      if (posts.length >= max) return posts;
    }
    cursor = j.cursor;
    if (!cursor) break;
    await sleep(THROTTLE_MS);
  }
  return posts;
}

// フォロー/フォロワーの DID 配列を取得（最大 max 件）
async function fetchGraphList(method, did, max) {
  let cursor = null;
  const out = [];
  const key = method === "getFollows" ? "follows" : "followers";
  const pagesMax = Math.ceil(max / 100);
  for (let page = 0; page < pagesMax; page++) {
    const url = `${API}/app.bsky.graph.${method}?actor=${encodeURIComponent(did)}&limit=100` + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : "");
    let j;
    try { j = await fetch(url).then((r) => r.json()); } catch { break; }
    for (const a of (j[key] || [])) { out.push(a.did); if (out.length >= max) return out; }
    cursor = j.cursor;
    if (!cursor) break;
    await sleep(THROTTLE_MS);
  }
  return out;
}

// WoT＝相互フォロー数。小さい側（通常はフォロー数）を全取得し getRelationships で相互判定。
// → フォロワー数百万の巨大アカウントでも、フォロー数が常識的なら正確に出せる。
const WOT_CAP = 2500;
async function computeWoT(did, followsCount, followersCount) {
  const useFollows = (followsCount || 0) <= (followersCount || 0);
  const method = useFollows ? "getFollows" : "getFollowers";
  const list = await fetchGraphList(method, did, WOT_CAP);
  let mutual = 0;
  for (let i = 0; i < list.length; i += 30) {
    setStatus(L().stWoT(Math.min(i + 30, list.length), list.length));
    const batch = list.slice(i, i + 30);
    const qs = batch.map((d) => "others=" + encodeURIComponent(d)).join("&");
    let j;
    try { j = await fetch(`${API}/app.bsky.graph.getRelationships?actor=${encodeURIComponent(did)}&${qs}`).then((r) => r.json()); } catch { continue; }
    for (const rel of (j.relationships || [])) {
      if (useFollows ? rel.followedBy : rel.following) mutual++;
    }
    await sleep(THROTTLE_MS);
  }
  return { wot: mutual, capped: list.length >= WOT_CAP };
}

// 最長連続投稿日数（UTC日付ベース）
function longestStreak(timestamps) {
  const days = [...new Set(timestamps.map((t) => Math.floor(t / 86400)))].sort((a, b) => a - b);
  if (!days.length) return 0;
  let best = 1, cur = 1;
  for (let i = 1; i < days.length; i++) {
    if (days[i] === days[i - 1] + 1) { cur++; best = Math.max(best, cur); } else { cur = 1; }
  }
  return best;
}
// 最も投稿が多い2時間帯（UTC）
function peakBand(timestamps) {
  if (!timestamps.length) return "—";
  const h = new Array(24).fill(0);
  for (const t of timestamps) h[new Date(t * 1000).getUTCHours()]++;
  let bi = 0, bv = -1;
  for (let i = 0; i < 24; i++) { const v = h[i] + h[(i + 1) % 24]; if (v > bv) { bv = v; bi = i; } }
  const p = (n) => String(n).padStart(2, "0");
  return `${p(bi)}–${p((bi + 2) % 24)} UTC`;
}

// ===== データ取得＋解析 =====
async function fetchProfile(actor) {
  setStatus(L().stProfile);
  const p = await fetch(`${API}/app.bsky.actor.getProfile?actor=${encodeURIComponent(actor)}`)
    .then((r) => { if (!r.ok) throw new Error(L().errNotFound); return r.json(); });
  const did = p.did;

  const createdAt = p.createdAt ? Math.floor(Date.parse(p.createdAt) / 1000) : null;
  const lastSeen = p.indexedAt ? Math.floor(Date.parse(p.indexedAt) / 1000) : null;
  const posts = p.postsCount || 0;
  const ageDays = createdAt ? Math.max(1, (Date.now() / 1000 - createdAt) / 86400) : 1;

  // 投稿解析（エンゲージメント・連続日数・ピーク時間帯）
  const postRecs = await fetchAuthorPosts(did, MAX_RECORDS);
  const engagement = postRecs.reduce((a, r) => a + r.eng, 0);
  const streak = longestStreak(postRecs.map((r) => r.ts));
  const peakUTC = peakBand(postRecs.map((r) => r.ts));
  const postsCapped = postRecs.length >= MAX_RECORDS;

  // WoT（相互フォロー）— 小さい側を全取得して getRelationships で相互判定
  setStatus(L().stWoT(0, "…"));
  const wotRes = await computeWoT(did, p.followsCount, p.followersCount);
  const wot = wotRes.wot;
  const wotCapped = wotRes.capped;

  // Generosity（付けたいいね総数）— repo を直接参照
  setStatus(L().stLikes);
  let likesGiven = 0, likesCapped = false;
  const pds = await resolvePds(did);
  if (pds) {
    const r = await countRecords(pds, did, "app.bsky.feed.like", MAX_RECORDS);
    likesGiven = r.count;
    likesCapped = r.capped;
  }

  // 検証：カスタムドメイン handle（= ドメイン認証）または trusted verifier / verified
  const v = p.verification || {};
  const customDomain = !!p.handle && !/\.bsky\.social$/i.test(p.handle) && p.handle !== "handle.invalid";
  const verified = customDomain || v.verifiedStatus === "valid" || v.trustedVerifierStatus === "valid";

  return {
    did,
    handle: p.handle || "",
    name: p.displayName || p.handle || "NO NAME",
    picture: p.avatar || "",
    posts,                          // Mileage（オドメーター）
    velocity: posts / ageDays,      // 1日あたり投稿数
    engagement, postsCapped,
    streak,
    peakUTC,
    wot, wotCapped,
    likesGiven, likesCapped, pdsOk: !!pds,
    createdAt,
    lastSeen: lastSeen || createdAt || Math.floor(Date.now() / 1000),
    verified,
  };
}

// ===== ランク（実データ基準）=====
function computeRank(d) {
  const ageY = d.createdAt ? (Date.now() / 1000 - d.createdAt) / (365.25 * 24 * 3600) : 0;
  if (d.wot >= 300 || ageY >= 3) return "BLUESKY VETERAN";
  if (d.wot >= 50 || d.posts >= 1000) return "BLUESKY CITIZEN";
  if (d.posts >= 50 || d.engagement >= 100) return "BLUESKY EXPLORER";
  return "BLUESKY NEWCOMER";
}

// 実数 → ★(1..5)。log スケール。
function starFrom(x, k, base = 1) {
  const n = Math.round(Math.log10((x || 0) + 1) * k) + base;
  return Math.max(1, Math.min(5, n));
}
// ステータス（6項目・すべて実データ）。2×3グリッドで表示。各 {label, n, icon}
function computeStars(d) {
  const ageY = d.createdAt ? (Date.now() / 1000 - d.createdAt) / (365.25 * 24 * 3600) : 0;
  return [
    { label: "Web of Trust", icon: "shield", n: starFrom(d.wot, 1.4) },
    { label: "Engagement", icon: "bolt", n: starFrom(d.engagement, 1.2) },
    { label: "Generosity", icon: "person", n: starFrom(d.likesGiven, 1.2) },
    { label: "Velocity", icon: "relay", n: starFrom(d.velocity, 2.5) },
    { label: "Streak", icon: "bubble", n: starFrom(d.streak, 2.2) },
    // Veteran：Bluesky は最長でも ~3.4 年なので、3年以上＝星5になるよう調整
    { label: "Veteran", icon: "relay", n: ageY >= 3 ? 5 : ageY >= 2 ? 4 : ageY >= 1 ? 3 : ageY >= 0.25 ? 2 : 1 },
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

// 背景写真（同一オリジンのアセット）をキャッシュ付きでロード
const _bgCache = {};
async function getBgPhoto(src) {
  if (!src) return null;
  if (src in _bgCache) return _bgCache[src];
  try { _bgCache[src] = await loadImage(src, { crossOrigin: false }); }
  catch { _bgCache[src] = null; }
  return _bgCache[src];
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
  sky:      { accent: "#1185fe", accent2: "#0a63d6", ink: "#10243f", sub: "#3a5680", line: "#9fc0ef", border: "#1185fe", gold1: "#dcc07f", gold2: "#b48a3c", paper: ["#eef5ff", "#eef1fc", "#f2f6ff"] },
  // 青空写真モード（ユーザー撮影の写真を薄く敷く）
  skyphoto: { accent: "#0a63d6", accent2: "#0a4fb0", ink: "#0e244f", sub: "#33507e", line: "#bcd6f5", border: "#1185fe", gold1: "#dcc07f", gold2: "#b48a3c", paper: ["#f4f9ff", "#eef5ff", "#f6fbff"], photo: "bg/sky1.jpg", photoAlpha: 0.34 },
  sunset:   { accent: "#e2603a", accent2: "#c23b6a", ink: "#3a1f24", sub: "#7a4a52", line: "#f0b9a0", border: "#e2603a", gold1: "#e8c074", gold2: "#c98a3a", paper: ["#fff3ec", "#ffeef0", "#fff0e6"] },
  mint:     { accent: "#10a37f", accent2: "#0a7d8c", ink: "#0e2a26", sub: "#3a6a60", line: "#a8e0d0", border: "#10a37f", gold1: "#dcc07f", gold2: "#b48a3c", paper: ["#eefbf6", "#eef6f4", "#f2fbf8"] },
  cyber:    { accent: "#0a9fc0", accent2: "#d6249f", ink: "#142539", sub: "#3a5066", line: "#9bd3e2", border: "#0a9fc0", gold1: "#bcae72", gold2: "#8c7a38", paper: ["#eafaff", "#eef0fb", "#fde8f6"] },
  gold:     { accent: "#b4863a", accent2: "#9a6b1e", ink: "#2a2206", sub: "#5a4d22", line: "#dcc79a", border: "#b4863a", gold1: "#e6cd84", gold2: "#b4863a", paper: ["#fffaf0", "#fff4e2", "#fdeed6"] },
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

  // 背景写真（テーマに photo があれば、cover で薄く敷く）
  if (t.photo) {
    const ph = await getBgPhoto(t.photo);
    if (ph) {
      c.save();
      c.globalAlpha = t.photoAlpha != null ? t.photoAlpha : 0.25;
      const ratio = Math.max(W / ph.width, H / ph.height);
      const dw = ph.width * ratio, dh = ph.height * ratio;
      c.drawImage(ph, (W - dw) / 2, (H - dh) / 2, dw, dh);
      c.restore();
    }
  }

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
  // 正方形モード：枠を正方形にして元のポートレート枠(202..670)内で縦中央寄せ。
  // アイコン(1:1)を左右切り取りなしで全体表示できる。
  const squareAvatar = !!$("square-avatar")?.checked;
  const phX = 850, phR = 16;
  // 正方形時も幅は通常枠と同じ360に揃え、右カラム(LICENSE NO. 1250)との余白40pxを確保。
  // 高さだけ短くなるので元のポートレート枠(202..670)内で縦中央寄せ。
  const phW = 360;
  const phH = squareAvatar ? 360 : 468;
  const phY = squareAvatar ? 202 + (468 - phH) / 2 : 202;
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
    // 正方形モードは contain（全体表示）、通常はポートレート枠に cover（はみ出し切り取り）
    const ratio = squareAvatar
      ? Math.min(phW / img.width, phH / img.height)
      : Math.max(phW / img.width, phH / img.height);
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
  let np = 58; // 長い表示名は枠内に収まるまで縮小
  while (np > 20) {
    c.font = `800 ${np}px 'Hiragino Sans','Yu Gothic',sans-serif`;
    if (c.measureText(d.name).width <= fieldMaxW) break;
    np -= 2;
  }
  c.fillText(d.name, lx, 292);
  if (d.handle) {
    c.fillStyle = t.accent;
    let sp = 28; // 長いハンドルも縮小
    while (sp > 14) {
      c.font = `600 ${sp}px 'Hiragino Sans',sans-serif`;
      if (c.measureText("@" + d.handle).width <= fieldMaxW) break;
      sp -= 1;
    }
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

  // 下段：ISSUED / CREATED / LICENSE CLASS（HANDLE との間に余白を確保）
  // MILEAGE / PEAK はステータスパネル内のフッターに表示（下段の詰まりを回避）
  const THREE_YEARS = 3 * 365.25 * 24 * 3600;
  const col = [lx, lx + 230, lx + 450];
  c.textAlign = "left";
  c.textBaseline = "alphabetic";
  const r1 = 596;
  c.fillStyle = t.sub;
  c.font = "700 19px 'Hiragino Sans',sans-serif";
  c.fillText("ISSUED", col[0], r1);
  c.fillText("CREATED", col[1], r1);
  c.fillText("LICENSE CLASS", col[2], r1);
  c.fillStyle = t.ink;
  c.font = "400 25px 'Hiragino Sans',sans-serif";
  c.fillText(fmtISO(Math.floor(Date.now() / 1000)), col[0], r1 + 30);
  c.fillText(d.createdAt ? fmtISO(d.createdAt) : "—", col[1], r1 + 30);
  drawPill(c, rank, col[2], r1 + 16, { bg: t.accent2, fg: "#fff", font: "700 21px 'Hiragino Sans',sans-serif", h: 34 });

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
  const pnX = 60, pnY = 690, pnW = 1000, pnH = 206;
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
  const rowsY = [pnY + 54, pnY + 100, pnY + 146];
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

  // パネル内フッター：MILEAGE / PEAK（区切り線つき）
  c.save();
  c.strokeStyle = t.gold2; c.globalAlpha = 0.4; c.lineWidth = 1;
  c.beginPath(); c.moveTo(pnX + 40, pnY + 172); c.lineTo(pnX + pnW - 40, pnY + 172); c.stroke();
  c.restore();
  const fy = pnY + 194;
  c.textAlign = "left"; c.textBaseline = "alphabetic";
  c.fillStyle = t.sub; c.font = "700 18px 'Hiragino Sans',sans-serif";
  c.fillText("MILEAGE", colX[0], fy);
  c.fillStyle = t.ink; c.font = "700 22px 'SF Mono','Menlo','Consolas',monospace";
  c.fillText(d.posts.toLocaleString("en-US"), colX[0] + 104, fy);
  c.fillStyle = t.sub; c.font = "700 18px 'Hiragino Sans',sans-serif";
  c.fillText("PEAK (UTC)", colX[1], fy);
  c.fillStyle = t.ink; c.font = "700 22px 'Hiragino Sans',sans-serif";
  c.fillText(d.peakUTC, colX[1] + 144, fy);

  // ===== 署名・ホロ印 =====
  c.fillStyle = "#1b2336";
  c.textAlign = "center";
  c.textBaseline = "alphabetic";
  const sigText = d.handle || d.name || "";
  const sigMaxW = 290; // ホロ印（左端~1438）に被らない範囲
  let sigSize = 44;
  while (sigSize > 18) {
    c.font = `italic 600 ${sigSize}px 'Snell Roundhand','Apple Chancery','Brush Script MT',cursive`;
    if (c.measureText(sigText).width <= sigMaxW) break;
    sigSize -= 2;
  }
  c.fillText(sigText, 1285, 828);
  c.fillStyle = t.sub;
  c.font = "700 20px 'Hiragino Sans',sans-serif";
  c.fillText("UNOFFICIAL FAN CARD", 1285, 866);
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
  if (!raw) throw new Error(L().errEnter);
  return raw;
}

async function issueFor(actor) {
  try {
    const data = await fetchProfile(actor);
    setStatus(L().stAvatar);
    const [avatar, qr] = await Promise.all([
      loadAvatar(data.picture),
      makeQR("https://bsky.app/profile/" + (data.handle || data.did)),
    ]);
    data._avatar = avatar;
    data._qr = qr;
    lastData = data;

    await renderCard(data, $("theme-select").value);
    setStatus(L().stDone(data), "ok");
  } catch (err) {
    console.error(err);
    setStatus(L().err(err?.message || err), "error");
  }
}

$("manual-btn").addEventListener("click", async () => {
  const raw = $("npub-input").value;
  if (!raw.trim()) { setStatus(L().errEnter, "error"); return; }
  try {
    await issueFor(normalizeActor(raw));
  } catch (err) {
    setStatus(L().err(err?.message || err), "error");
  }
});
$("npub-input").addEventListener("keydown", (e) => { if (e.key === "Enter") $("manual-btn").click(); });

$("theme-select").addEventListener("change", () => {
  if (lastData) renderCard(lastData, $("theme-select").value);
});

// 初期プレースホルダ描画
function drawPlaceholder() {
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
  ctx.fillText(L().canvasHint, canvas.width / 2, canvas.height / 2);
}

// ===== 言語：ブラウザ言語で自動表示＋手動切り替え =====
const savedLang = (() => { try { return localStorage.getItem("bsl_lang"); } catch { return null; } })() || "auto";
$("lang-select").value = savedLang;
$("lang-select").addEventListener("change", (e) => {
  try { localStorage.setItem("bsl_lang", e.target.value); } catch {}
  applyLang(e.target.value);
});
applyLang(savedLang);

// ===== アイコン正方形表示トグル =====
try {
  const sq = $("square-avatar");
  if (localStorage.getItem("bsl_square") === "1") sq.checked = true;
  sq.addEventListener("change", () => {
    try { localStorage.setItem("bsl_square", sq.checked ? "1" : "0"); } catch {}
    if (lastData) renderCard(lastData, $("theme-select").value);
  });
} catch {}

$("download-btn").addEventListener("click", () => {
  try {
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = "bluesky-license.png";
    a.click();
  } catch (err) {
    setStatus(L().errDownload(err.message), "error");
  }
});
