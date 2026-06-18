# Bluesky License — driver's-license-style card maker

Read a Bluesky (AT Protocol) profile by **handle or DID** and generate a driver's-license-style card you can download as a PNG. Single-page, build-free vanilla HTML/CSS/JS.

## 🌐 Live demo

**https://kojira.github.io/bluesky-license/**

A sibling of [nostr-license](https://github.com/kojira/nostr-license). No backend, no login — everything runs in the browser against the public AT Protocol AppView.

## Usage

Open the live demo (or serve locally — ES modules need HTTP, not `file://`):

```bash
cd bluesky-license
python3 -m http.server 8899   # or: npx serve
# → http://localhost:8899/index.html
```

- **Issue**: enter a handle (`user.bsky.social` or a custom domain) or a `did:plc:...`, press Issue.
- Designs: Bluesky (blue) / Cyberpunk / Gold license.

## Data (all real, from `public.api.bsky.app`)

- `app.bsky.actor.getProfile` → display name, avatar, DID, handle, followers / following / posts counts, **account creation date (`createdAt`)**, verification.
- `app.bsky.feed.getAuthorFeed` → recent-post likes + reposts + replies, summed as an **Engagement** metric.

### On the card

- NAME (display name) + `@handle`, **DID**, **HANDLE** with green ✓ when verified
  (custom-domain handle, or Bluesky trusted-verifier / verified status).
- ISSUED (today) · CREATED (account creation) · VALID THRU (last seen + 3y) · LICENSE CLASS (rank).
- Stat panel (5 real metrics): Communication (posts) / Followers / Following / Engagement / Veteran (account age).
- Avatar photo, QR to `bsky.app/profile/<handle>`, holographic security-paper background.

This is a fan card for fun, not an official ID.
