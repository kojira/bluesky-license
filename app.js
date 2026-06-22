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
    issue: "Issue", fullscan: "🔬 Full scan", design: "Design", language: "Language", lang_auto: "Auto",
    avatarFit: "Square avatar (no cropping)",
    th_sky: "Bluesky (blue)", th_skyphoto: "Blue Sky photo", th_sunset: "Sunset", th_mint: "Mint", th_cyber: "Cyberpunk", th_gold: "Gold license",
    download: "Download PNG", about: "About / notes",
    a1: "Enter a Bluesky handle (e.g. <code>user.bsky.social</code> or a custom domain) or a DID, then press Issue.",
    a2: "Downloads your full public repository (CAR) — every post / like / repost — plus the follower graph. No login required. Most repos are small; very active accounts can be tens of MB.",
    a3: "Drag the activity graph to pick a period. Posts, Likes (given), Reposts, Streak, Velocity and Peak are recomputed for that period. Account start (CLASS / tenure), Engagement (reactions received) and Web of Trust are computed separately — start = account-creation date, Engagement = a recent approximation.",
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
      <dt>License Class — your tenure</dt><dd>Purely <b>how long you've been on Bluesky</b>, so an older account is never outranked by a newer one. <b>Era badges (fixed by join date):</b> <b>INNOVATOR</b> = joined the iOS beta (before Jul 2023) · <b>PIONEER</b> = invite-only era (before the Feb 6 2024 public launch) · <b>EARLY ADOPTER</b> = joined in 2024 (the first public year). <b>Then by age:</b> <b>CITIZEN</b> 1 year+ · <b>EXPLORER</b> 1 month+ · <b>CHRYSALIS</b> 1 week+ · <b>CATERPILLAR</b> 1 day+ · <b>EGG</b> under a day. The newcomer tiers follow a butterfly's metamorphosis (egg → caterpillar → chrysalis → emerges as Explorer) and line up with the Day-1 / Day-7 / Day-30 retention milestones.</dd>
      <dt>Endorsement — your type</dt><dd>Your <b>standout trait</b> among the stats — a lateral "type", not a rank. <b>CONNECTOR</b> = top Web of Trust · <b>HEADLINER</b> = top Engagement · <b>PATRON</b> = top Generosity · <b>SPEEDSTER</b> = top Velocity · <b>MARATHONER</b> = top Streak · <b>CASUAL</b> = active, but no ★4+ standout yet · <b>LURKER</b> = barely active — you watch more than you post · <b>ALL-ROUNDER</b> = ★4+ in every stat · <b>TERMINALLY ONLINE</b> = max Velocity AND max Streak (the true 🦋 addict). A specific archetype (CONNECTOR…MARATHONER) needs that stat at ★4 or more, so it's never claimed loosely.</dd>
      <dt>Valid Thru</dt><dd>A playful "expiry": last activity + 3 years.</dd>
      <dt>Period</dt><dd>The graph shows weekly posts/likes/reposts over your whole history. Drag it (or use the All/90d/30d/7d presets) to choose the period the card reflects. Web of Trust uses up to 2500 follows for mutuals; "+" means capped.</dd>
      <dt>Dating</dt><dd>Timestamps come from each record's key (a time-based <code>TID</code>), not the freely-editable <code>createdAt</code> — so backdated / future-dated "joke" posts land on their real creation date instead of breaking the timeline.</dd>
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
    issue: "発行", fullscan: "🔬 全期間スキャン", design: "デザイン", language: "言語", lang_auto: "自動",
    avatarFit: "アイコンを正方形で表示（切り取りなし）",
    th_sky: "Bluesky（ブルー）", th_skyphoto: "青空写真", th_sunset: "サンセット", th_mint: "ミント", th_cyber: "サイバーパンク", th_gold: "ゴールド",
    download: "PNGをダウンロード", about: "このサービスについて / 注意",
    a1: "Blueskyのハンドル（例: <code>user.bsky.social</code> やカスタムドメイン）または DID を入力して「発行」を押してください。",
    a2: "あなたの公開リポジトリ全体（CAR）を取得します：全投稿／いいね／リポスト＋フォロワーグラフ。ログイン不要。多くは小さいですが、非常に活発なアカウントは数十MBになることがあります。",
    a3: "アクティビティ・グラフを<b>ドラッグ</b>して期間を選択。投稿・いいね（付与）・リポスト・連続(Streak)・Velocity・ピークはその期間で再計算されます。<b>開始日（CLASS/在籍）・Engagement（受け取った反応）・WoT は期間と別計算</b>です（開始日＝アカウント作成日、Engagement＝直近の概算）。",
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
      <dt>License Class — 在籍期間</dt><dd><b>Blueskyにどれだけ長くいるか</b>だけで決まります。だから古いアカウントが新しいアカウントに抜かれることはありません。<b>時期バッジ（入会日で固定）:</b> <b>INNOVATOR</b>＝iOSベータ初期（2023年7月より前）· <b>PIONEER</b>＝招待制期（2024年2月6日の一般公開より前）· <b>EARLY ADOPTER</b>＝2024年入会（最初の公開年）。<b>以降は参加期間で:</b> <b>CITIZEN</b> 1年+ · <b>EXPLORER</b> 1ヶ月+ · <b>CHRYSALIS</b> 1週間+ · <b>CATERPILLAR</b> 1日+ · <b>EGG</b> 1日未満。新人期は蝶の変態（卵→幼虫→さなぎ→羽化してExplorer）に対応し、Day1 / Day7 / Day30 のリテンション節目に連動しています。</dd>
      <dt>Endorsement — タイプ</dt><dd>★の中で<b>一番尖っている特性</b>。上下ではなく横並びの「型」です。<b>CONNECTOR</b>＝Web of Trust最強 · <b>HEADLINER</b>＝Engagement最強 · <b>PATRON</b>＝Generosity最強 · <b>SPEEDSTER</b>＝Velocity最強 · <b>MARATHONER</b>＝Streak最強 · <b>CASUAL</b>＝活動はあるが★4以上の突出なし · <b>LURKER</b>＝ほぼ非活動（見る専）· <b>ALL-ROUNDER</b>＝全項目★4以上 · <b>TERMINALLY ONLINE</b>＝Velocityと Streak がともにMAX（真の廃人🦋）。個別アーキタイプ（CONNECTOR…MARATHONER）はその項目が★4以上の時だけ付くので、緩く付与されることはありません。</dd>
      <dt>Valid Thru</dt><dd>遊びの「有効期限」：最終アクティビティ＋3年。</dd>
      <dt>期間選択</dt><dd>グラフは全履歴の週次（投稿/いいね/リポスト）。ドラッグ（または 全期間/90d/30d/7d ボタン）でカードに反映する期間を選べます。相互フォローは最大2500フォローまで（超過は「+」）。</dd>
      <dt>日付の扱い</dt><dd>時刻は各レコードのキー（時刻ベースID <code>TID</code>）を使います。自由に書き換えられる本文の <code>createdAt</code> は使いません。だから1923年などに詐称された投稿も、実際の作成日に正しく配置されます。</dd>
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

// グラフ3系列の色（表・裏で共通）。明確に別色＋意味づけ：投稿=青 / いいね=ピンク♡ / リポスト=緑↻
const CHART_COLORS = { post: "#1185fe", like: "#db2777", repost: "#16a34a" };

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

// ===== Full scan：リポジトリ CAR を1回DL → DAG-CBOR を手書きパースして全期間集計 =====
// 上限なしで正確（streak/投稿/いいね等）。依存なし。重い投稿者はページングだと数百
// リクエストになるため、CAR 一発取得が圧倒的に速い（29MB を ~200ms でパース）。
async function fetchRepoCar(pds, did, onProgress) {
  const url = `${pds}/xrpc/com.atproto.sync.getRepo?did=${encodeURIComponent(did)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("getRepo HTTP " + res.status);
  const reader = res.body && res.body.getReader ? res.body.getReader() : null;
  if (!reader) return await res.arrayBuffer();
  const chunks = []; let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); received += value.length;
    if (onProgress) onProgress(received);
  }
  const out = new Uint8Array(received); let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out.buffer;
}

function _uvarint(b, p) { let x = 0, s = 0, i = p; for (;;) { const c = b[i++]; x += (c & 0x7f) * 2 ** s; if (!(c & 0x80)) break; s += 7; } return [x, i]; }
// CID をパースし [byte長, codec, digestHex(末尾32B=sha256)] を返す。
function _cidInfo(b, p) {
  let len, codec;
  if (b[p] === 0x12 && b[p + 1] === 0x20) { len = 34; codec = 0x70; }   // CIDv0
  else {
    let i = p, v; [v, i] = _uvarint(b, i); [codec, i] = _uvarint(b, i);
    let hf; [hf, i] = _uvarint(b, i); let sz; [sz, i] = _uvarint(b, i); i += sz; len = i - p;
  }
  let hx = ""; for (let k = p + len - 32; k < p + len; k++) { const x = b[k]; hx += (x < 16 ? "0" : "") + x.toString(16); }
  return [len, codec, hx];
}
// CID バイト列（tag42 の中身など）の末尾32B を hex に
function _digHex(a) { let hx = ""; for (let i = a.length - 32; i < a.length; i++) { const x = a[i]; hx += (x < 16 ? "0" : "") + x.toString(16); } return hx; }
// rkey(=TID) → ms。TID は生成時刻を埋め込んだ時刻ベースID。本文 createdAt より詐称に強い。
const _TID_AL = "234567abcdefghijklmnopqrstuvwxyz";
function _tidMs(rk) {
  if (!rk || rk.length !== 13) return null;
  let n = 0n;
  for (let i = 0; i < 13; i++) { const v = _TID_AL.indexOf(rk[i]); if (v < 0) return null; n = n * 32n + BigInt(v); }
  return Number(n >> 10n) / 1000;
}
const _td = new TextDecoder();
function _cbor(b, p) {
  const ib = b[p++], mt = ib >> 5, ai = ib & 0x1f; let len = 0;
  if (ai < 24) len = ai;
  else if (ai === 24) len = b[p++];
  else if (ai === 25) { len = (b[p] << 8) | b[p + 1]; p += 2; }
  else if (ai === 26) { len = (b[p] * 16777216 + (b[p + 1] << 16) + (b[p + 2] << 8) + b[p + 3]) >>> 0; p += 4; }
  else if (ai === 27) { const hi = b[p] * 16777216 + (b[p + 1] << 16) + (b[p + 2] << 8) + b[p + 3]; const lo = (b[p + 4] * 16777216 + (b[p + 5] << 16) + (b[p + 6] << 8) + b[p + 7]) >>> 0; len = hi * 4294967296 + lo; p += 8; }
  switch (mt) {
    case 0: return [len, p];
    case 1: return [-1 - len, p];
    case 2: return [b.subarray(p, p + len), p + len];                // bytes（MST の k/v=CID に必要）
    case 3: return [_td.decode(b.subarray(p, p + len)), p + len];     // text
    case 4: { const a = []; for (let k = 0; k < len; k++) { let v; [v, p] = _cbor(b, p); a.push(v); } return [a, p]; }
    case 5: { const o = {}; for (let k = 0; k < len; k++) { let kk, vv; [kk, p] = _cbor(b, p); [vv, p] = _cbor(b, p); o[kk] = vv; } return [o, p]; }
    case 6: { let v; [v, p] = _cbor(b, p); return [v, p]; }           // tag42(CID)：中身を読み進めるだけ
    case 7: return [null, p];                                         // simple/float（値は使わずバイトのみ消費）
  }
  return [null, p];
}
function peakFromHours(h) {
  let bi = 0, bv = -1;
  for (let i = 0; i < 24; i++) { const v = h[i] + h[(i + 1) % 24]; if (v > bv) { bv = v; bi = i; } }
  if (bv <= 0) return "—";
  const p = (n) => String(n).padStart(2, "0");
  return `${p(bi)}–${p((bi + 2) % 24)} UTC`;
}

// 時刻は rkey(TID) を第一ソースにする（createdAt は本文で自由に詐称できるため）。
// 念のための緩い下限：atproto ネットワーク以前（2021年より前）は明らかに無効。
const SANE_MIN = Date.parse("2021-01-01T00:00:00Z");

// CAR を全走査 → MST から各レコードの key(=collection/rkey) を復元し、rkey-TID を時刻に使う。
// これで createdAt 詐称（1923年など）に強くなる（rkey はクライアント自動生成で偽装しにくい）。
function parseCarFull(buf) {
  const b = new Uint8Array(buf); let i = 0;
  let h; [h, i] = _uvarint(b, i); i += h;            // CAR ヘッダをスキップ
  const nowMs = Date.now();
  const keyByDig = new Map();    // レコードCID digest(hex) -> 完全キー "collection/rkey"
  const postRec = new Map();     // 投稿CID digest -> {r:リプ, m:メディア, langs, ca:createdAt(ms)}
  const kinds = {};
  while (i < b.length) {
    let bl; [bl, i] = _uvarint(b, i); const end = i + bl;
    let cl, codec, bdig; [cl, codec, bdig] = _cidInfo(b, i); i += cl;
    if (codec === 0x71) {
      try {
        const [o] = _cbor(b, i);
        if (o && Array.isArray(o.e)) {
          // MST ノード：エントリのキーを前方圧縮から復元（同一ノード内で完結）
          let prev = "";
          for (const e of o.e) {
            const pfx = e.p | 0;
            const ksuf = e.k ? _td.decode(e.k) : "";
            const key = prev.slice(0, pfx) + ksuf;
            prev = key;
            if (e.v) keyByDig.set(_digHex(e.v), key);
          }
        } else if (o && o["$type"]) {
          const ty = o["$type"]; kinds[ty] = (kinds[ty] || 0) + 1;
          if (ty === "app.bsky.feed.post") {
            postRec.set(bdig, { r: o.reply ? 1 : 0, m: o.embed ? 1 : 0, langs: o.langs, ca: Date.parse(o.createdAt) });
          }
        }
      } catch {}
    }
    i = end;
  }
  // 時刻解決：rkey(TID) 優先、無ければ createdAt（緩い下限でガード）
  const tsOf = (key, caMs) => {
    let ms = null;
    if (key) ms = _tidMs(key.slice(key.indexOf("/") + 1));
    if (ms == null) ms = caMs;
    return (ms != null && isFinite(ms) && ms >= SANE_MIN && ms <= nowMs + 86400000) ? ms : null;
  };
  const postT = [], postR = [], postM = [], postH = [], likeT = [], repostT = [];
  let follows = 0, firstPost = Infinity, lastPost = 0; const langset = {};
  for (const [dig, r] of postRec) {
    const ms = tsOf(keyByDig.get(dig), r.ca);
    if (ms == null) continue;
    postT.push(Math.floor(ms / 1000)); postR.push(r.r); postM.push(r.m); postH.push(new Date(ms).getUTCHours());
    if (ms < firstPost) firstPost = ms; if (ms > lastPost) lastPost = ms;
    if (Array.isArray(r.langs)) for (const l of r.langs) langset[l] = (langset[l] || 0) + 1;
  }
  for (const key of keyByDig.values()) {
    const sl = key.indexOf("/"); if (sl < 0) continue;
    const coll = key.slice(0, sl);
    if (coll === "app.bsky.feed.like" || coll === "app.bsky.feed.repost") {
      const ms = tsOf(key, null);
      if (ms != null) (coll === "app.bsky.feed.like" ? likeT : repostT).push(Math.floor(ms / 1000));
    } else if (coll === "app.bsky.graph.follow") follows++;
  }
  const topLang = Object.entries(langset).sort((a, b) => b[1] - a[1])[0];
  return {
    postT, postR, postM, postH, likeT, repostT, follows,
    firstPost: isFinite(firstPost) ? Math.floor(firstPost / 1000) : null,
    lastPost: lastPost ? Math.floor(lastPost / 1000) : null,
    topLang: topLang ? topLang[0] : null, langs: langset, kinds,
    totalPosts: postT.length, totalLikes: likeT.length, totalReposts: repostT.length,
  };
}

// 選択期間 [startSec, endSec) の指標を再計算（CAR がメモリにあるので即時・ラグ無し）。
function computePeriodStats(p, startSec, endSec) {
  const dayCount = new Map(); const hours = new Array(24).fill(0);
  let posts = 0, replies = 0, media = 0;
  for (let k = 0; k < p.postT.length; k++) {
    const t = p.postT[k]; if (t < startSec || t >= endSec) continue;
    posts++; if (p.postR[k]) replies++; if (p.postM[k]) media++;
    const day = Math.floor(t / 86400); dayCount.set(day, (dayCount.get(day) || 0) + 1); hours[p.postH[k]]++;
  }
  let likes = 0; for (const t of p.likeT) if (t >= startSec && t < endSec) likes++;
  let reposts = 0; for (const t of p.repostT) if (t >= startSec && t < endSec) reposts++;
  const u = [...dayCount.keys()].sort((a, b) => a - b);
  let longest = u.length ? 1 : 0, cur = u.length ? 1 : 0;
  for (let k = 1; k < u.length; k++) { if (u[k] === u[k - 1] + 1) { cur++; if (cur > longest) longest = cur; } else cur = 1; }
  // 最も投稿した日（BUSIEST DAY）
  let busiestDay = null, busiestCount = 0;
  for (const [day, n] of dayCount) if (n > busiestCount) { busiestCount = n; busiestDay = day; }
  const periodDays = Math.max(1, (endSec - startSec) / 86400);
  return {
    posts, replies, media, likes, reposts, activeDays: u.length,
    streak: longest, peakUTC: peakFromHours(hours), velocity: posts / periodDays,
    busiestDay, busiestCount, startSec, endSec,
  };
}

// 週次集計（グラフ用）: firstPost週〜lastPost週まで、各週の投稿/いいね/リポスト数。
function weeklySeries(p) {
  const W = 604800; // 7日(秒)
  if (!p.firstPost || !p.lastPost) return { posts: [], likes: [], reposts: [], n: 0, weekSec: W, start: 0 };
  const start = Math.floor(p.firstPost / W) * W;
  const end = Math.floor(p.lastPost / W) * W;
  const n = Math.floor((end - start) / W) + 1;
  const posts = new Array(n).fill(0), likes = new Array(n).fill(0), reposts = new Array(n).fill(0);
  for (const t of p.postT) { const wi = Math.floor((t - start) / W); if (wi >= 0 && wi < n) posts[wi]++; }
  for (const t of p.likeT) { const wi = Math.floor((t - start) / W); if (wi >= 0 && wi < n) likes[wi]++; }
  for (const t of p.repostT) { const wi = Math.floor((t - start) / W); if (wi >= 0 && wi < n) reposts[wi]++; }
  return { posts, likes, reposts, n, weekSec: W, start };
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
// LICENSE CLASS = 在籍期間（テニュア）のみで決定。明確で、古いアカウントが
// 新しいアカウントに抜かれることは絶対に起きない。活動量・WoT 等は★/ENDORSEMENT で別途表現。
//  - 前半（招待制〜公開直後）は Bluesky 史にアンカーした固定ラベル
//  - それ以降は参加期間で。新人期は蝶の変態に対応し、Day1/Day7/Day30 の離脱クリフに連動
function computeRank(d) {
  const c = d.createdAt;
  if (!c) return "EGG";
  const INNOVATOR_END = Date.parse("2023-07-01T00:00:00Z") / 1000; // iOSベータ初期波
  const PUBLIC_LAUNCH = Date.parse("2024-02-06T00:00:00Z") / 1000; // 招待制廃止＝一般公開
  const YEAR_2025     = Date.parse("2025-01-01T00:00:00Z") / 1000;
  if (c < INNOVATOR_END) return "INNOVATOR";
  if (c < PUBLIC_LAUNCH) return "PIONEER";
  if (c < YEAR_2025)     return "EARLY ADOPTER";
  const ageDays = (Date.now() / 1000 - c) / 86400;
  if (ageDays >= 365) return "CITIZEN";
  if (ageDays >= 30)  return "EXPLORER";   // 羽化（Day30 突破）
  if (ageDays >= 7)   return "CHRYSALIS";  // さなぎ（〜Day30）
  if (ageDays >= 1)   return "CATERPILLAR"; // 幼虫（〜Day7：第1週の急減期）
  return "EGG";                            // 卵（〜Day1：最大離脱）
}

// ENDORSEMENT = 突出した特性で決まるアーキタイプ（横並びの「型」。上下ではない）。
function computeEndorsement(d) {
  const st = {};
  for (const s of computeStars(d)) st[s.label] = s.n;
  const v = st["Velocity"] || 1, s = st["Streak"] || 1, e = st["Engagement"] || 1,
        w = st["Web of Trust"] || 1, g = st["Generosity"] || 1;
  const max = Math.max(v, s, e, w, g);
  if (v >= 5 && s >= 5) return "TERMINALLY ONLINE";   // 廃人：投稿速度・連続ともMAX
  if ([v, s, e, w, g].every((x) => x >= 4)) return "ALL-ROUNDER"; // 全方位：全項目★4以上
  if (max <= 2) return "LURKER";                      // ほぼ非活動＝見る専
  if (max <= 3) return "CASUAL";                      // ★4以上の突出なし＝そこそこ
  // ★4以上の突出あり：最大の特性を優先順で（同点は配列順）
  const cand = [
    [v, "SPEEDSTER"], [s, "MARATHONER"], [g, "PATRON"], [e, "HEADLINER"], [w, "CONNECTOR"],
  ];
  cand.sort((a, b) => b[0] - a[0]);
  return cand[0][1];
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
    // Veteran：2024-02-06 の一般公開より前（招待制のアーリーアダプター期）は星5。
    // それ以降は在籍年数でグラデーション。
    { label: "Veteran", icon: "relay", n: (d.createdAt && d.createdAt < Date.parse("2024-02-06T00:00:00Z") / 1000) ? 5 : ageY >= 2 ? 4 : ageY >= 1 ? 3 : ageY >= 0.25 ? 2 : 1 },
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
function drawPill(c, text, x, y, { bg, fg, font, padX = 14, h = 34, r = 7, maxW = null }) {
  c.font = font;
  c.textAlign = "left";
  c.textBaseline = "middle";
  if (maxW) { // 長いラベルは枠内に収まるまでフォント縮小
    const m = font.match(/(\d+)px/);
    let size = m ? +m[1] : 21;
    while (size > 12 && c.measureText(text).width + padX * 2 > maxW) {
      size -= 1;
      c.font = font.replace(/\d+px/, size + "px");
    }
  }
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

  // 下段：ISSUED / CREATED / CLASS / ENDORSEMENT（HANDLE との間に余白を確保）
  // MILEAGE / PEAK はステータスパネル内のフッターに表示（下段の詰まりを回避）
  const THREE_YEARS = 3 * 365.25 * 24 * 3600;
  // ISSUED / CREATED / CLASS / ENDORSEMENT を「等間隔（同じ隙間）」で左から流す。
  // 各フィールド幅 = max(見出し幅, 値/ピル幅)。CLASS が短くても長くても隙間は一定で、
  // 無駄な余白が出ない。ピルは写真枠手前を上限に自動縮小（はみ出し不可）。
  const r1 = 596;
  const GAP = 46;
  const fields = [
    { label: "ISSUED",      kind: "date", text: fmtISO(Math.floor(Date.now() / 1000)) },
    { label: "CREATED",     kind: "date", text: d.createdAt ? fmtISO(d.createdAt) : "—" },
    { label: "CLASS",       kind: "pill", text: rank, bg: t.accent2 },
    { label: "ENDORSEMENT", kind: "pill", text: computeEndorsement(d), bg: t.accent },
  ];
  c.textAlign = "left";
  c.textBaseline = "alphabetic";
  let fx = lx;
  for (const f of fields) {
    // drawPill が baseline を middle にするので、ラベルは毎回 alphabetic に戻す
    c.textAlign = "left"; c.textBaseline = "alphabetic";
    c.fillStyle = t.sub; c.font = "700 19px 'Hiragino Sans',sans-serif";
    c.fillText(f.label, fx, r1);
    const lw = c.measureText(f.label).width;
    let vw;
    if (f.kind === "date") {
      c.fillStyle = t.ink; c.font = "400 22px 'Hiragino Sans',sans-serif";
      c.fillText(f.text, fx, r1 + 30);
      vw = c.measureText(f.text).width;
    } else {
      vw = drawPill(c, f.text, fx, r1 + 12, { bg: f.bg, fg: "#fff", font: "700 20px 'Hiragino Sans',sans-serif", h: 32, maxW: (phX - 16) - fx });
    }
    fx += Math.max(lw, vw) + GAP;
  }

  // 解析対象期間（カードの数値はこの期間の集計）。小さく控えめに、写真枠の手前まで。
  if (d.period && d.period.startSec) {
    c.textAlign = "left"; c.textBaseline = "alphabetic";
    c.fillStyle = t.sub; c.font = "600 15px 'Hiragino Sans',sans-serif";
    c.fillText("STATS PERIOD  " + fmtISO(d.period.startSec) + " – " + fmtISO(d.period.endSec), lx, 662);
  }

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

// ===== 裏面（ACTIVITY RECORD）：選択期間の統計＋週次グラフを免許証の裏風に描く =====
function pctOf(a, b) { return b ? Math.round(100 * a / b) + "%" : "—"; }
// 裏面の地紋：表（直交の織り地）とは違う【対角の織り地】＋別配置のギロシェ。表と同等にリッチ。
function drawBackBg(c, t, W, H) {
  const off = document.createElement("canvas"); off.width = W; off.height = H;
  const g = off.getContext("2d"); g.lineCap = "round"; g.lineJoin = "round";
  g.save();
  g.translate(W / 2, H / 2); g.rotate(Math.PI / 4);   // 45°回転 → 織り地が対角に
  const D = Math.ceil((W + H) / 1.3);
  let ri = 0;
  for (let i = -D; i <= D; i += 12.4) {
    g.strokeStyle = (ri++ % 2) ? t.line : t.accent; g.lineWidth = 1; g.beginPath();
    for (let x = -D; x <= D; x += 5) { const y2 = i + Math.sin(x / 44 + i * 0.04) * 7 + Math.sin(x / 128) * 5 + Math.cos(x / 320) * 3; x === -D ? g.moveTo(x, y2) : g.lineTo(x, y2); }
    g.stroke();
  }
  let rj = 0;
  for (let j = -D; j <= D; j += 31) {
    g.strokeStyle = (rj++ % 2) ? t.accent : t.line; g.lineWidth = 1; g.beginPath();
    for (let y = -D; y <= D; y += 6) { const x2 = j + Math.sin(y / 50) * 6 + Math.sin(y / 150) * 4; y === -D ? g.moveTo(x2, y) : g.lineTo(x2, y); }
    g.stroke();
  }
  g.restore();
  // ギロシェ（表とは違う配置）
  guilloche(g, W * 0.78, H * 0.26, 300, 90, 8, 28, t.accent, 1, 1);
  guilloche(g, W * 0.78, H * 0.26, 190, 64, 13, 24, t.accent2, 1, 1);
  guilloche(g, W * 0.24, H * 0.64, 260, 80, 11, 26, t.accent2, 1, 1);
  guilloche(g, W * 0.24, H * 0.64, 160, 56, 16, 22, t.accent, 1, 1);
  guilloche(g, W * 0.55, H * 0.96, 130, 44, 15, 20, t.accent, 1, 1);
  for (const [px, py] of [[110, 120], [W - 120, 120], [120, H - 110], [W - 120, H - 110]]) guilloche(g, px, py, 64, 24, 13, 18, t.accent2, 1, 1);
  g.globalCompositeOperation = "destination-out";
  const fade = g.createLinearGradient(0, 0, 0, H); fade.addColorStop(0, "rgba(0,0,0,0)"); fade.addColorStop(1, "rgba(0,0,0,0.5)");
  g.fillStyle = fade; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = "source-over";
  c.save(); c.globalAlpha = 0.20; c.drawImage(off, 0, 0); c.restore();
}
// Code128（コードセットB）パターン表（値0..106 → 6要素=バー/スペース幅。106=Stop）
const _C128 = ["212222","222122","222221","121223","121322","131222","122213","122312","132212","221213","221312","231212","112232","122132","122231","113222","123122","123221","223211","221132","221231","213212","223112","312131","311222","321122","321221","312212","322112","322211","212123","212321","232121","111323","131123","131321","112313","132113","132311","211313","231113","231311","112133","112331","132131","113123","113321","133121","313121","211331","231131","213113","213311","213131","311123","311321","331121","312113","312311","332111","314111","221411","431111","111224","111422","121124","121421","141122","141221","112214","112412","122114","122411","142112","142211","241211","221114","413111","241112","134111","111242","121142","121241","114212","124112","124211","411212","421112","421211","212141","214121","412121","111143","111341","131141","114113","114311","411113","411311","113141","114131","311141","411131","211412","211214","211232","2331112"];
// 文字列を Code128-B でエンコード → 描くパターン列を返す
function _code128B(text) {
  const codes = [104]; let sum = 104, pos = 1;   // Start B
  for (let i = 0; i < text.length; i++) {
    const v = text.charCodeAt(i) - 32;
    if (v < 0 || v > 95) continue;               // 非対応文字はスキップ
    codes.push(v); sum += v * pos; pos++;
  }
  codes.push(sum % 103);                          // チェックサム
  codes.push(106);                                // Stop
  return codes.map((v) => _C128[v]);
}
// 本物の Code128 バーコードを描く（quiet zone 込み）。スキャンすると text が読める。
// 幅はモジュール数に応じて自動：目標 mod px/モジュール、ただし maxW を超えないよう縮小。
// 長いハンドルでも maxW 内に必ず収まる（はみ出さない）。実際に描いた幅を返す。
function drawBarcode(c, text, x, y, h, color, { mod = 3, maxW = 520 } = {}) {
  const pats = _code128B(String(text || ""));
  const quiet = 10;                               // 両端の余白（モジュール）
  let total = quiet * 2; for (const p of pats) for (const ch of p) total += +ch;
  const mw = Math.min(mod, maxW / total);
  const w = total * mw;
  c.save(); c.fillStyle = color;
  let cx = x + quiet * mw;
  for (const p of pats) {
    for (let k = 0; k < p.length; k++) {
      const ww = (+p[k]) * mw;
      if (k % 2 === 0) c.fillRect(cx, y, ww, h);  // 偶数index=バー
      cx += ww;
    }
  }
  c.restore();
  return w;
}
function drawBackChart(c, d, t, x, y, w, h) {
  c.save();
  c.fillStyle = "#ffffff"; roundRect(c, x, y, w, h, 12); c.fill();   // 不透明（地紋を透かさない＝グラフを見やすく）
  c.globalAlpha = 0.6; c.strokeStyle = t.line; c.lineWidth = 1; roundRect(c, x, y, w, h, 12); c.stroke(); c.globalAlpha = 1;
  const s = weeklySeries((d && d.full) || {});
  if (!s.n) { c.restore(); return; }
  const padX = 16, padY = 30;
  const plotW = w - padX * 2, plotH = h - padY - 26;
  const ox = x + padX, oy = y + padY;
  const maxV = Math.max(1, ...s.posts, ...s.likes, ...s.reposts);
  const xOf = (wi) => ox + (s.n <= 1 ? plotW / 2 : (wi / (s.n - 1)) * plotW);
  const yOf = (v) => oy + plotH - (v / maxV) * plotH;
  if (d.period) {
    const a = Math.max(0, Math.floor((d.period.startSec - s.start) / s.weekSec));
    const b = Math.min(s.n - 1, Math.floor((d.period.endSec - s.start) / s.weekSec));
    c.fillStyle = "rgba(17,133,254,0.13)"; c.fillRect(xOf(a), oy, Math.max(2, xOf(b) - xOf(a)), plotH);
  }
  const line = (arr, col, lw) => { c.strokeStyle = col; c.lineWidth = lw; c.beginPath(); for (let wi = 0; wi < s.n; wi++) { const X = xOf(wi), Y = yOf(arr[wi]); wi ? c.lineTo(X, Y) : c.moveTo(X, Y); } c.stroke(); };
  line(s.likes, CHART_COLORS.like, 1.6); line(s.posts, CHART_COLORS.post, 2); line(s.reposts, CHART_COLORS.repost, 1.6);
  // 年ラベル
  c.fillStyle = t.sub; c.font = "600 15px 'Hiragino Sans',sans-serif"; c.textBaseline = "alphabetic"; c.textAlign = "center";
  let lastYr = null;
  for (let wi = 0; wi < s.n; wi++) { const yr = new Date((s.start + wi * s.weekSec) * 1000).getUTCFullYear(); if (yr !== lastYr) { lastYr = yr; c.fillText(String(yr), xOf(wi), y + h - 8); } }
  // 凡例
  c.textAlign = "left"; c.font = "600 15px 'Hiragino Sans',sans-serif"; c.textBaseline = "alphabetic";
  let lx = x + 16; for (const [col, lbl] of [[CHART_COLORS.post, "posts"], [CHART_COLORS.like, "likes"], [CHART_COLORS.repost, "reposts"]]) { c.fillStyle = col; c.fillRect(lx, y + 12, 12, 12); c.fillStyle = t.sub; c.fillText(lbl, lx + 16, y + 23); lx += 34 + c.measureText(lbl).width; }
  c.restore();
}
function renderBack(d, theme = "sky") {
  const cv = document.getElementById("back-canvas");
  if (!cv) return;
  const t = THEMES[theme] || THEMES.sky;
  const c = cv.getContext("2d");
  const W = cv.width, H = cv.height, PAD = 56;
  c.clearRect(0, 0, W, H); c.lineCap = "round"; c.lineJoin = "round";
  const bg = c.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, t.paper[0]); bg.addColorStop(0.5, t.paper[1]); bg.addColorStop(1, t.paper[2]);
  roundRect(c, 0, 0, W, H, 24); c.fillStyle = bg; c.fill();
  c.save(); roundRect(c, 0, 0, W, H, 24); c.clip();
  drawBackBg(c, t, W, H);   // 対角の織り地＋ギロシェ（表とは違うが同等にリッチ）
  const sheen = c.createLinearGradient(0, H, W, 0);
  sheen.addColorStop(0.30, "rgba(255,255,255,0)"); sheen.addColorStop(0.50, "rgba(170,200,255,0.12)"); sheen.addColorStop(0.70, "rgba(255,255,255,0)");
  c.fillStyle = sheen; c.fillRect(0, 0, W, H);
  c.restore();
  c.lineWidth = 5; c.strokeStyle = t.border; roundRect(c, 10, 10, W - 20, H - 20, 20); c.stroke();
  // 磁気ストライプ風
  c.fillStyle = "#171f2e"; c.fillRect(34, 58, W - 68, 92);
  c.fillStyle = "rgba(255,255,255,0.62)"; c.textBaseline = "middle"; c.textAlign = "left";
  c.font = "700 22px 'Hiragino Sans',sans-serif"; c.fillText("BLUESKY LICENSE · DATA STRIPE", PAD, 104);
  c.textAlign = "right"; c.fillText("at://" + (d.handle || d.did || ""), W - PAD, 104);
  // ヘッダ
  c.textBaseline = "alphabetic"; c.textAlign = "left";
  c.fillStyle = t.ink; c.font = "800 44px 'Hiragino Sans',sans-serif"; c.fillText("ACTIVITY RECORD", PAD, 214);
  c.fillStyle = t.sub; c.font = "600 25px 'Hiragino Sans',sans-serif"; c.fillText(d.name + "  @" + (d.handle || ""), PAD, 250);
  c.textAlign = "right"; c.fillStyle = t.sub; c.font = "600 22px 'Hiragino Sans',sans-serif"; c.fillText("NO. " + licenseNo(d), W - PAD, 214);
  // PERIOD
  const ps = d.period || {};
  const fmt = (s) => s ? fmtISO(s) : "—";
  c.textAlign = "left"; c.fillStyle = t.sub; c.font = "700 22px 'Hiragino Sans',sans-serif"; c.fillText("STATS PERIOD", PAD, 296);
  c.fillStyle = t.accent2; c.font = "800 30px 'SF Mono','Menlo','Consolas',monospace"; c.fillText(fmt(ps.startSec) + "  →  " + fmt(ps.endSec), PAD, 334);
  // 週次チャート
  drawBackChart(c, d, t, PAD, 358, W - PAD * 2, 228);
  // 統計グリッド 3×3
  const grid = [
    ["POSTS", (ps.posts || 0).toLocaleString() + "  (rep " + pctOf(ps.replies, ps.posts) + " / media " + pctOf(ps.media, ps.posts) + ")"],
    ["LONGEST STREAK", (ps.streak || 0) + " d"],
    ["ACTIVE DAYS", (ps.activeDays || 0).toLocaleString()],
    ["AVG PACE", (ps.velocity || 0).toFixed(1) + " /day"],
    ["LIKES GIVEN", (ps.likes || 0).toLocaleString()],
    ["REPOSTS", (ps.reposts || 0).toLocaleString()],
    ["BUSIEST DAY", ps.busiestDay ? fmtISO(ps.busiestDay * 86400) + "  ·  " + (ps.busiestCount || 0) : "—"],
    ["PEAK (UTC)", ps.peakUTC || "—"],
    ["TOP LANG", (d.full && d.full.topLang) || "—"],
  ];
  const gy0 = 650, rowH = 82, colW = (W - PAD * 2) / 3;
  for (let i = 0; i < grid.length; i++) {
    const gx = PAD + (i % 3) * colW, gy = gy0 + Math.floor(i / 3) * rowH;
    c.textAlign = "left"; c.fillStyle = t.sub; c.font = "700 18px 'Hiragino Sans',sans-serif"; c.fillText(grid[i][0], gx, gy);
    c.fillStyle = t.ink; c.font = "700 26px 'Hiragino Sans',sans-serif"; c.fillText(grid[i][1], gx, gy + 32);
    c.strokeStyle = t.gold2; c.globalAlpha = 0.22; c.lineWidth = 1; c.beginPath(); c.moveTo(gx, gy + 48); c.lineTo(gx + colW - 34, gy + 48); c.stroke(); c.globalAlpha = 1;
  }
  // バーコード（ハンドルを Code128 で実エンコード）。ラベル無し＝スキャンしてからのお楽しみ。
  // 幅は自動（長いハンドルでも maxW 内に収まる・短い handle は太く scannable）。
  drawBarcode(c, d.handle || d.did || "", PAD, H - 102, 46, t.ink, { mod: 3, maxW: 520 });
  drawHoloSeal(c, W - 104, H - 74, 40);
  // フッタ：短く「UNOFFICIAL FAN CARD」だけをセンタリング（バーコードと被らない）
  c.fillStyle = t.sub; c.textAlign = "center"; c.textBaseline = "alphabetic"; c.font = "700 22px 'Hiragino Sans',sans-serif";
  c.fillText("UNOFFICIAL FAN CARD", W / 2, H - 54);
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

// ===== 統合フロー：CAR取得 → 週次グラフ → 期間ドラッグ選択 → 期間でカード再計算 =====
let carData = null;             // parseCarFull の結果（期間再計算用）
let baseData = null;            // 期間非依存：profile / WoT / Engagement(直近) / createdAt 等
let baseAvatar = null, baseQr = null;

async function issueFor(actor) {
  const ja = LANG === "ja";
  hideDeepDetail();
  // 1) プロフィール + WoT + Engagement(直近概算) … 期間に依存しない部分（既存の fetchProfile）
  const data = await fetchProfile(actor);
  baseData = data;
  setStatus(L().stAvatar);
  [baseAvatar, baseQr] = await Promise.all([
    loadAvatar(data.picture),
    makeQR("https://bsky.app/profile/" + (data.handle || data.did)),
  ]);
  // 2) CAR（リポジトリ丸ごと）を取得 → 全期間の生データを保持
  setStatus(ja ? "リポジトリ(CAR)を取得中…" : "Downloading repository (CAR)…");
  const pds = await resolvePds(data.did);
  if (!pds) throw new Error(ja ? "PDS が見つかりません" : "PDS not found");
  const buf = await fetchRepoCar(pds, data.did, (bytes) => {
    setStatus((ja ? "リポジトリ取得中… " : "Downloading repo… ") + (bytes / 1048576).toFixed(1) + " MB");
  });
  setStatus(ja ? "解析中…" : "Analyzing…");
  carData = parseCarFull(buf);
  // 3) 週次グラフを描き、初期期間（全期間）でカードを描画（buildActivityChart 内で applyPeriod を呼ぶ）
  buildActivityChart(carData, applyPeriod);
}

// 選択期間でカード＆詳細を更新。final=true で canvas を再描画（ドラッグ中は false で軽量）。
function applyPeriod(startSec, endSec, startLabel, endLabel, final) {
  if (!carData || !baseData) return;
  const ps = computePeriodStats(carData, startSec, endSec);
  const d = Object.assign({}, baseData);
  d.posts = ps.posts; d.postsCapped = false;
  d.streak = ps.streak; d.streakCapped = false;
  d.likesGiven = ps.likes; d.likesCapped = false; d.pdsOk = true;
  d.peakUTC = ps.peakUTC; d.velocity = ps.velocity;
  d._avatar = baseAvatar; d._qr = baseQr;
  d.period = ps; d.full = carData; d.deep = true;
  renderPeriodDetail(ps, startLabel, endLabel);   // 即時（テキストのみ・軽い）
  if (final) {
    lastData = d;
    const theme = $("theme-select").value;
    renderCard(d, theme);                           // 表（final は一回限りのイベントなので直接描画）
    const back = document.getElementById("back-canvas");
    if (back) { back.hidden = false; renderBack(d, theme); }   // 裏（ACTIVITY RECORD）
    setStatus(L().stDone(d) + " · " + startLabel + "→" + endLabel, "ok");
  }
}

function hideDeepDetail() {
  const el = document.getElementById("deep-detail"); if (el) { el.hidden = true; el.innerHTML = ""; }
  const ch = document.getElementById("activity-chart"); if (ch) { ch.hidden = true; ch.innerHTML = ""; }
  const bk = document.getElementById("back-canvas"); if (bk) bk.hidden = true;
}

function renderPeriodDetail(ps, startLabel, endLabel) {
  const el = document.getElementById("deep-detail");
  if (!el) return;
  const ja = LANG === "ja";
  const f = (n) => (n || 0).toLocaleString();
  const pct = (a, b) => b ? Math.round(100 * a / b) + "%" : "—";
  const rows = ja ? [
    ["選択期間", startLabel + " 〜 " + endLabel],
    ["投稿", f(ps.posts) + "（リプ " + pct(ps.replies, ps.posts) + " / メディア " + pct(ps.media, ps.posts) + "）"],
    ["連続投稿（最長）", f(ps.streak) + " 日"],
    ["投稿した日数", f(ps.activeDays) + " 日"],
    ["平均ペース", ps.velocity.toFixed(1) + " /日"],
    ["いいね付与 / リポスト", f(ps.likes) + " / " + f(ps.reposts)],
    ["ピーク時間", ps.peakUTC],
  ] : [
    ["Selected period", startLabel + " – " + endLabel],
    ["Posts", f(ps.posts) + " (replies " + pct(ps.replies, ps.posts) + " / media " + pct(ps.media, ps.posts) + ")"],
    ["Longest streak", f(ps.streak) + " d"],
    ["Active days", f(ps.activeDays)],
    ["Avg pace", ps.velocity.toFixed(1) + " /day"],
    ["Likes given / Reposts", f(ps.likes) + " / " + f(ps.reposts)],
    ["Peak hours", ps.peakUTC],
  ];
  el.hidden = false;
  el.innerHTML = `<h3 class="dd-title">${ja ? "📊 選択期間の集計（CAR）" : "📊 Selected-period stats (CAR)"}</h3>`
    + `<table class="dd-table">` + rows.map((r) => `<tr><th>${r[0]}</th><td>${r[1]}</td></tr>`).join("") + `</table>`
    + `<p class="dd-note">${ja
      ? "上のグラフを<b>ドラッグ</b>して期間を選択。投稿・いいね・リポスト・連続・ピークはこの期間で再計算します。<br>※<b>開始日（CLASS/在籍期間）・Engagement（受け取った反応）・WoT</b> は期間と<b>別計算</b>です（開始日はアカウント作成日、Engagementは直近の概算）。"
      : "Drag the graph above to pick a period. Posts, likes, reposts, streak and peak are recomputed for it.<br>Note: <b>account start (CLASS/tenure), Engagement (reactions received), WoT</b> are computed <b>separately</b> (start = account-creation date; Engagement = recent approximation)."}</p>`;
}

// ===== 週次アクティビティ・グラフ＋ドラッグ期間選択 =====
function buildActivityChart(p, onChange) {
  const host = document.getElementById("activity-chart");
  if (!host) return;
  const s = weeklySeries(p);
  if (!s.n) { host.hidden = true; if (carData && baseData) { const end = Math.floor(Date.now() / 1000); applyPeriod(end - 86400, end, "—", "—", true); } return; }
  host.hidden = false;
  const ja = LANG === "ja";
  const VW = 680, VH = 150, padL = 6, padR = 6, padT = 10, padB = 16;
  const plotW = VW - padL - padR, plotH = VH - padT - padB;
  const maxV = Math.max(1, ...s.posts, ...s.likes, ...s.reposts);
  const xOf = (wi) => padL + (s.n <= 1 ? plotW / 2 : (wi / (s.n - 1)) * plotW);
  const yOf = (v) => padT + plotH - (v / maxV) * plotH;
  const pathOf = (arr) => arr.map((v, wi) => (wi ? "L" : "M") + xOf(wi).toFixed(1) + "," + yOf(v).toFixed(1)).join(" ");
  const dateOf = (wi, plus) => new Date((s.start + (wi + (plus ? 1 : 0)) * s.weekSec) * 1000).toISOString().slice(0, 10);

  let selA = 0, selB = s.n - 1;
  const brushHtml = () => {
    const ax = xOf(selA), bx = xOf(selB);
    const midY = padT + plotH / 2;
    const grab = (hx) =>
        `<line x1="${hx.toFixed(1)}" y1="${(padT - 2).toFixed(1)}" x2="${hx.toFixed(1)}" y2="${(padT + plotH).toFixed(1)}" stroke="#7b61ff" stroke-width="2.5"/>`
      + `<rect x="${(hx - 9).toFixed(1)}" y="${(midY - 26).toFixed(1)}" width="18" height="52" rx="6" fill="#7b61ff" stroke="#ffffff" stroke-width="1.5"/>`
      + `<line x1="${(hx - 3.5).toFixed(1)}" y1="${(midY - 9).toFixed(1)}" x2="${(hx - 3.5).toFixed(1)}" y2="${(midY + 9).toFixed(1)}" stroke="#fff" stroke-width="1.6"/>`
      + `<line x1="${(hx + 3.5).toFixed(1)}" y1="${(midY - 9).toFixed(1)}" x2="${(hx + 3.5).toFixed(1)}" y2="${(midY + 9).toFixed(1)}" stroke="#fff" stroke-width="1.6"/>`;
    return `<rect x="${padL}" y="${padT}" width="${(ax - padL).toFixed(1)}" height="${plotH}" fill="rgba(8,12,20,0.5)"/>`
      + `<rect x="${bx.toFixed(1)}" y="${padT}" width="${(VW - padR - bx).toFixed(1)}" height="${plotH}" fill="rgba(8,12,20,0.5)"/>`
      + `<rect x="${ax.toFixed(1)}" y="${padT}" width="${Math.max(1, bx - ax).toFixed(1)}" height="${plotH}" fill="rgba(123,97,255,0.10)"/>`
      + grab(ax) + grab(bx);
  };
  host.innerHTML = `
    <div class="chart-head">
      <span class="chart-legend"><i style="background:${CHART_COLORS.post}"></i>${ja ? "投稿" : "posts"} <i style="background:${CHART_COLORS.like}"></i>${ja ? "いいね" : "likes"} <i style="background:${CHART_COLORS.repost}"></i>${ja ? "リポスト" : "reposts"} <span class="chart-perweek">${ja ? "（週次）" : "(weekly)"}</span></span>
      <span class="chart-presets"><button data-d="0">${ja ? "全期間" : "All"}</button><button data-d="90">90d</button><button data-d="30">30d</button><button data-d="7">7d</button></span>
    </div>
    <svg id="chart-svg" viewBox="0 0 ${VW} ${VH}" preserveAspectRatio="none" style="touch-action:none;display:block;width:100%;height:130px;cursor:ew-resize">
      <path d="${pathOf(s.likes)}" fill="none" stroke="${CHART_COLORS.like}" stroke-width="1.4" opacity="0.9"/>
      <path d="${pathOf(s.posts)}" fill="none" stroke="${CHART_COLORS.post}" stroke-width="1.7"/>
      <path d="${pathOf(s.reposts)}" fill="none" stroke="${CHART_COLORS.repost}" stroke-width="1.4" opacity="0.9"/>
      <g id="chart-brush">${brushHtml()}</g>
    </svg>
    <div class="chart-hint">${ja ? "⇆ 両端の <b>つまみ</b> を左右にドラッグして期間を選択（中をドラッグで移動／プリセットも可）" : "⇆ Drag the <b>handles</b> on each edge to pick a period (drag the middle to move; or use presets)"}</div>
    <div class="chart-range" id="chart-range"></div>`;
  const svg = document.getElementById("chart-svg");
  const brushG = document.getElementById("chart-brush");
  const rangeEl = document.getElementById("chart-range");
  const emit = (final) => {
    const startSec = s.start + selA * s.weekSec;
    const endSec = s.start + (selB + 1) * s.weekSec;
    const sl = dateOf(selA, false), el = dateOf(selB, true);
    if (rangeEl) rangeEl.textContent = (ja ? "期間: " : "Period: ") + sl + " → " + el + "  (" + (selB - selA + 1) + (ja ? " 週)" : " wk)");
    onChange(startSec, endSec, sl, el, final);
  };
  const redraw = (final) => { brushG.innerHTML = brushHtml(); emit(final); };
  const wkAt = (clientX) => {
    const r = svg.getBoundingClientRect();
    const px = (clientX - r.left) / r.width * VW;
    return Math.max(0, Math.min(s.n - 1, Math.round((px - padL) / plotW * (s.n - 1))));
  };
  let mode = null, grab = 0, ga = 0, gb = 0;
  svg.addEventListener("pointerdown", (e) => {
    const wi = wkAt(e.clientX);
    const near = Math.max(1, Math.round(s.n * 0.04));
    const dA = Math.abs(wi - selA), dB = Math.abs(wi - selB);
    if (dA <= near && dA <= dB) mode = "L";
    else if (dB <= near) mode = "R";
    else if (wi > selA && wi < selB) { mode = "M"; grab = wi; ga = selA; gb = selB; }
    else { mode = "R"; selA = wi; selB = wi; }
    try { svg.setPointerCapture(e.pointerId); } catch {}
    redraw(false);
  });
  svg.addEventListener("pointermove", (e) => {
    if (!mode) return;
    const wi = wkAt(e.clientX);
    if (mode === "L") selA = Math.min(wi, selB);
    else if (mode === "R") selB = Math.max(wi, selA);
    else { const dd = wi - grab, span = gb - ga; let na = ga + dd, nb = gb + dd; if (na < 0) { na = 0; nb = span; } if (nb > s.n - 1) { nb = s.n - 1; na = nb - span; } selA = na; selB = nb; }
    redraw(false);
  });
  const end = () => { if (mode) { mode = null; emit(true); } };
  svg.addEventListener("pointerup", end);
  svg.addEventListener("pointercancel", end);
  host.querySelectorAll(".chart-presets button").forEach((b) => b.addEventListener("click", () => {
    const days = +b.getAttribute("data-d");
    if (!days) { selA = 0; selB = s.n - 1; }
    else { const ws = Math.max(0, s.n - Math.ceil(days / 7)); selA = ws; selB = s.n - 1; }
    redraw(true);
  }));
  emit(true);   // 初期 = 全期間でカード描画
}

$("manual-btn").addEventListener("click", async () => {
  const raw = $("npub-input").value;
  if (!raw.trim()) { setStatus(L().errEnter, "error"); return; }
  const btn = $("manual-btn");
  btn.disabled = true;
  try { await issueFor(normalizeActor(raw)); }
  catch (err) { console.error(err); setStatus(L().err(err?.message || err), "error"); }
  finally { btn.disabled = false; }
});
$("npub-input").addEventListener("keydown", (e) => { if (e.key === "Enter") $("manual-btn").click(); });

$("theme-select").addEventListener("change", () => {
  if (lastData) {
    const theme = $("theme-select").value;
    renderCard(lastData, theme);
    if (lastData.period) renderBack(lastData, theme);
  }
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
    const back = document.getElementById("back-canvas");
    let url;
    if (back && !back.hidden) {
      // 表＋裏を縦に並べた1枚の画像にする
      const gap = 40;
      const cmb = document.createElement("canvas");
      cmb.width = canvas.width;
      cmb.height = canvas.height * 2 + gap;
      const cx = cmb.getContext("2d");
      cx.drawImage(canvas, 0, 0);
      cx.drawImage(back, 0, canvas.height + gap);
      url = cmb.toDataURL("image/png");
    } else {
      url = canvas.toDataURL("image/png");
    }
    const a = document.createElement("a");
    a.href = url;
    a.download = "bluesky-license.png";
    a.click();
  } catch (err) {
    setStatus(L().errDownload(err.message), "error");
  }
});
