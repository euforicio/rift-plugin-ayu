// Renders the README screenshots from the plugin's own generated theme files.
//
//   npm run screenshots
//
// No BB instance is involved and no BB data is read. The page below loads
// `themes/<id>.css` verbatim on top of a small base layer that reproduces the
// handful of token derivations BB performs but the plugin deliberately leaves
// alone (`--foreground`, `--ring`, the `--sh-*` defaults, …). Every colour that
// lands on screen is therefore a colour the plugin actually ships — the layout
// is a stand-in for BB's chrome, the palette is not a stand-in for anything.
//
// The code block is highlighted by sugar-high, the same library BB highlights
// chat code blocks with, so the `--sh-*` mapping is exercised for real rather
// than approximated by hand-written spans.
//
// Class names here must not collide with Tailwind utility names: `bb plugin
// build` runs its Tailwind scan over the whole repo except dist/ and
// node_modules/, so a bare `grow` or `hidden` in this file ships a dead rule in
// the plugin's own dist/app.css.
//
// Fonts: BB asks for Inter and falls back to the platform sans. This script
// pins the fallback to the system UI stack so a machine without Inter installed
// still produces a clean render.

import { chromium } from "playwright";
import { highlight } from "sugar-high";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(repoRoot, "assets/screenshots");

const VARIANTS = [
  {
    id: "ayu-light",
    variant: "light",
    name: "Ayu Light",
    note: "Warm off-white, amber accent",
    mode: "light",
  },
  {
    id: "ayu-dark",
    variant: "dark",
    name: "Ayu Dark",
    note: "Deep near-black, amber accent",
    mode: "dark",
  },
  {
    id: "ayu-mirage",
    variant: "mirage",
    name: "Ayu Mirage",
    note: "Muted blue-grey, warm amber accent",
    mode: "dark",
  },
];

const RAMP_ORDER = [
  "red", "pink", "orange", "peach", "yellow",
  "green", "teal", "indigo", "blue", "purple", "gray",
];
const RAMP_STEPS = ["l1", "l2", "l3", "l4", "l5"];

// --- inputs ------------------------------------------------------------------

/** The generated palettes, read straight out of the module the panel bundles. */
export async function readPalettes() {
  const source = await readFile(resolve(repoRoot, "generated/palettes.ts"), "utf8");
  const start = source.indexOf("{", source.indexOf("AYU_PALETTES"));
  const end = source.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("could not locate AYU_PALETTES");
  return JSON.parse(source.slice(start, end + 1));
}

export const readThemeCss = (id) => readFile(resolve(repoRoot, `themes/${id}.css`), "utf8");

// --- base layer --------------------------------------------------------------

// The tokens BB derives and the plugin's stylesheet never touches. Mirrors
// apps/app/src/components/ui/theme.css and markdown-code-highlight.css; the
// neutral anchors here exist only so the page renders if a theme fails to load.
const BASE_TOKENS = `
:root {
  --canvas: #ffffff;
  --ink: #303030;
  --primary: #444444;
  --attention: #d8a13a;

  --background: var(--canvas);
  --foreground: var(--ink);
  --card-foreground: var(--ink);
  --popover-foreground: var(--ink);
  --secondary-foreground: var(--ink);
  --accent-foreground: var(--ink);
  --sidebar-foreground: var(--ink);
  --sidebar-accent-foreground: var(--ink);
  --ring: var(--primary);
  --success-foreground: color-mix(in oklch, var(--success) 45%, var(--ink));
  --surface-selected-border: color-mix(in oklab, var(--primary) 35%, transparent);
  --surface-attention: color-mix(in oklab, var(--attention) 14%, transparent);
  --border-seam-vertical: var(--border-seam);

  --radius: 0.5rem;
  --font-sans: "Inter Variable", Inter, system-ui, -apple-system, "SF Pro Text", sans-serif;
  --font-mono: "Fira Code", ui-monospace, "SF Mono", Menlo, monospace;
}

/* sugar-high's own defaults. The plugin overrides the seven hue tokens and
   leaves identifier/sign/space to BB — which is what these lines supply. */
.bb-code-highlight {
  --sh-space: inherit;
  --sh-identifier: var(--foreground);
  --sh-sign: var(--muted-foreground);
  --sh-comment: var(--subtle-foreground);
  --sh-keyword: oklch(0.5 0.16 18);
  --sh-string: oklch(0.46 0.1 150);
  --sh-class: oklch(0.5 0.12 250);
  --sh-property: oklch(0.46 0.1 264);
  --sh-entity: oklch(0.47 0.13 292);
  --sh-jsxliterals: oklch(0.47 0.13 292);
}
.dark .bb-code-highlight {
  --sh-keyword: oklch(0.74 0.14 18);
  --sh-string: oklch(0.78 0.12 150);
  --sh-class: oklch(0.76 0.11 250);
  --sh-property: oklch(0.78 0.1 264);
  --sh-entity: oklch(0.78 0.12 292);
  --sh-jsxliterals: oklch(0.78 0.12 292);
}
`;

// --- page chrome -------------------------------------------------------------

const SHELL_CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: var(--font-sans);
  background: transparent;
  color: var(--foreground);
  -webkit-font-smoothing: antialiased;
}
/* Deliberately small canvases. GitHub renders README images at roughly 830px
   wide, so a 1400px-wide capture arrives at ~0.6 scale and the code block turns
   to mush; at these sizes the downscale is close to 1:1 and stays legible. */
.stage { padding: 24px; display: inline-block; }
.frame {
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--border);
  box-shadow: 0 18px 40px -18px rgb(0 0 0 / 0.45), 0 2px 8px -4px rgb(0 0 0 / 0.3);
}

/* ---- app shell ---- */
.app { display: flex; background: var(--background); }
.sidebar {
  width: 198px; flex: none; display: flex; flex-direction: column;
  background: var(--sidebar); border-right: 1px solid var(--sidebar-border);
  padding: 12px 10px; gap: 2px;
}
.brand {
  display: flex; align-items: center; gap: 8px;
  padding: 2px 6px 12px; color: var(--sidebar-foreground);
}
.brand .mark {
  width: 18px; height: 18px; border-radius: 5px;
  background: var(--primary); color: var(--primary-foreground);
  font-size: 11px; font-weight: 700; display: grid; place-items: center;
}
.brand .name { font-size: 13px; font-weight: 600; letter-spacing: -0.01em; }
.brand .fill { flex: 1; }
.brand .kbd {
  font-family: var(--font-mono); font-size: 10px; padding: 2px 5px;
  border-radius: 4px; border: 1px solid var(--border);
  color: var(--subtle-foreground); background: var(--surface-recessed);
}
.side-label {
  font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em;
  color: var(--subtle-foreground); padding: 8px 6px 4px;
}
.row {
  display: flex; align-items: center; gap: 7px;
  height: 28px; padding: 0 8px; border-radius: 6px;
  font-size: 12.5px; color: var(--sidebar-foreground);
}
.row.project { font-weight: 600; color: var(--foreground); }
.row.thread { padding-left: 20px; color: var(--muted-foreground); }
.row.hover { background: var(--state-hover); }
.row.active {
  background: var(--surface-selected); color: var(--foreground); font-weight: 500;
}
.row .chev { color: var(--subtle-foreground); font-size: 9px; width: 8px; }
.row .dot { width: 6px; height: 6px; border-radius: 50%; flex: none; background: var(--subtle-foreground); }
.row .dot.run { background: var(--primary); }
.row .dot.ok { background: var(--success); }
.row .dot.err { background: var(--destructive); }
.row .label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row .count {
  margin-left: auto; font-family: var(--font-mono); font-size: 10px;
  color: var(--subtle-foreground);
}

.content { flex: 1; min-width: 0; display: flex; flex-direction: column; background: var(--background); }
.topbar {
  height: 42px; flex: none; display: flex; align-items: center; gap: 8px;
  padding: 0 14px; border-bottom: 1px solid var(--border-seam);
}
.crumb { font-size: 12.5px; color: var(--muted-foreground); }
.crumb b { color: var(--foreground); font-weight: 600; }
.crumb .sep { color: var(--subtle-foreground); margin: 0 6px; }
.spacer { flex: 1; }
.chip {
  display: inline-flex; align-items: center; gap: 6px;
  height: 22px; padding: 0 9px; border-radius: 999px;
  font-size: 11px; border: 1px solid var(--border);
  color: var(--muted-foreground); background: var(--surface-raised);
}
.chip .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--success); }
.chip.accent {
  background: var(--primary); color: var(--primary-foreground);
  border-color: transparent; font-weight: 600;
}

/* Named .convo, not .thread: the sidebar rows are .row.thread and a bare
   .thread rule would capture them too. */
.convo { flex: 1; min-height: 0; padding: 16px 18px; display: flex; flex-direction: column; gap: 13px; }
.msg { display: flex; flex-direction: column; gap: 8px; }
.who {
  display: flex; align-items: center; gap: 7px;
  font-size: 11px; font-weight: 600; letter-spacing: 0.02em;
  color: var(--subtle-foreground); text-transform: uppercase;
}
.who .avatar {
  width: 16px; height: 16px; border-radius: 4px; display: grid; place-items: center;
  font-size: 9px; font-weight: 700; text-transform: none;
}
.who .avatar.user { background: var(--secondary); color: var(--secondary-foreground); }
.who .avatar.bot { background: var(--primary); color: var(--primary-foreground); }
.prose { font-size: 13.5px; line-height: 1.55; color: var(--foreground); }
.prose .dim { color: var(--muted-foreground); }
.prose code {
  font-family: var(--font-mono); font-size: 12px; padding: 1px 5px; border-radius: 4px;
  background: var(--surface-recessed); color: var(--file-accent);
}

.block {
  border: 1px solid var(--border); border-radius: 8px; overflow: hidden;
  background: var(--card);
}
.block-head {
  display: flex; align-items: center; gap: 8px; height: 30px; padding: 0 10px;
  border-bottom: 1px solid var(--border-hairline);
  background: var(--surface-raised);
  font-family: var(--font-mono); font-size: 11px; color: var(--muted-foreground);
}
.block-head .file { color: var(--file-accent); }
.block-head .tag {
  margin-left: auto; font-family: var(--font-sans); font-size: 10px;
  color: var(--subtle-foreground);
}
pre.code, pre.term, pre.diff {
  font-family: var(--font-mono); font-size: 12px; line-height: 1.65;
  padding: 10px 12px; overflow: hidden; white-space: pre;
}
pre.term { background: var(--surface-recessed-solid); }
.diff .add { display: block; background: color-mix(in oklab, var(--diff-added) 14%, transparent); color: var(--diff-added); }
.diff .del { display: block; background: color-mix(in oklab, var(--diff-removed) 14%, transparent); color: var(--diff-removed); }
.diff .ctx { display: block; color: var(--muted-foreground); }

.badges { display: flex; gap: 8px; flex-wrap: wrap; }
.badge {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 11px; height: 22px; padding: 0 9px; border-radius: 6px;
  border: 1px solid transparent;
}
.badge .sq { width: 7px; height: 7px; border-radius: 2px; }
.badge.ok { color: var(--success); border-color: color-mix(in oklab, var(--success) 35%, transparent); background: color-mix(in oklab, var(--success) 12%, transparent); }
.badge.warn { color: var(--warning-text); border-color: color-mix(in oklab, var(--warning) 35%, transparent); background: color-mix(in oklab, var(--warning) 12%, transparent); }
.badge.err { color: var(--destructive-text); border-color: var(--surface-destructive-border, color-mix(in oklab, var(--destructive) 30%, transparent)); background: color-mix(in oklab, var(--destructive) 12%, transparent); }
.badge.pr { color: var(--pr-merged); border-color: color-mix(in oklab, var(--pr-merged) 35%, transparent); background: color-mix(in oklab, var(--pr-merged) 12%, transparent); }

.composer {
  flex: none; margin: 0 18px 16px; border: 1px solid var(--input);
  border-radius: 10px; background: var(--card); padding: 10px 12px;
  display: flex; align-items: center; gap: 10px;
  box-shadow: var(--shadow-lift, 0 -4px 12px -6px rgb(0 0 0 / 0.18));
}
.composer .ph { flex: 1; font-size: 13px; color: var(--subtle-foreground); }
.composer .send {
  height: 26px; padding: 0 12px; border-radius: 6px; font-size: 12px; font-weight: 600;
  background: var(--primary); color: var(--primary-foreground);
  display: grid; place-items: center;
}

/* ---- settings panel (mirrors app.tsx) ---- */
.panel {
  background: var(--background); color: var(--foreground);
  padding: 26px 28px; display: flex; flex-direction: column; gap: 26px;
}
.panel h1 { font-size: 15px; font-weight: 600; }
.panel .sub { font-size: 12px; color: var(--muted-foreground); margin-top: 3px; }
.sec { display: flex; flex-direction: column; gap: 12px; }
.sec-head { display: flex; align-items: baseline; gap: 8px; }
.sec-head h2 { font-size: 13px; font-weight: 500; }
.sec-head .hint { font-size: 12px; color: var(--subtle-foreground); }
.rule { height: 1px; background: var(--border); }

.theme-row {
  display: flex; align-items: center; gap: 16px;
  border: 1px solid var(--border); border-radius: 8px; padding: 12px;
}
.theme-row.on {
  border-color: color-mix(in oklab, var(--primary) 40%, transparent);
  background: color-mix(in oklab, var(--primary) 5%, transparent);
}
.mini { display: flex; width: 112px; height: 64px; flex: none; border-radius: 6px; overflow: hidden; border: 1px solid var(--border); }
.mini .strip { width: 16px; display: flex; justify-content: center; padding-top: 6px; }
.mini .strip i { width: 6px; height: 6px; border-radius: 50%; display: block; }
.mini .lines { display: flex; flex-direction: column; gap: 6px; padding: 8px; }
.mini .lines .ln { display: flex; gap: 4px; }
.mini .lines .ln span { height: 4px; border-radius: 999px; display: block; }
.theme-meta { flex: 1; min-width: 128px; }
.theme-meta .top { display: flex; align-items: center; gap: 8px; }
.theme-meta .nm { font-size: 13px; font-weight: 500; }
.theme-meta .note { font-size: 12px; color: var(--muted-foreground); margin-top: 2px; }
.pill {
  font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 999px;
  background: var(--secondary); color: var(--secondary-foreground);
}
.btn {
  margin-left: auto; height: 28px; padding: 0 12px; border-radius: 6px;
  border: 1px solid var(--input); background: var(--card);
  font-size: 12px; font-weight: 500; color: var(--foreground);
  display: grid; place-items: center;
}

.tabs { display: inline-flex; gap: 2px; padding: 3px; border-radius: 7px; background: var(--muted); }
.tabs .tab { font-size: 12px; padding: 4px 12px; border-radius: 5px; color: var(--muted-foreground); }
.tabs .tab.on { background: var(--card); color: var(--foreground); font-weight: 500; box-shadow: 0 1px 2px rgb(0 0 0 / 0.12); }

.ramp { display: flex; align-items: center; gap: 12px; }
.ramp .hue { width: 56px; flex: none; font-size: 12px; color: var(--muted-foreground); }
.ramp .bar { display: flex; height: 34px; flex: 1; border-radius: 6px; overflow: hidden; }
.ramp .bar span { flex: 1; }

.grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); column-gap: 16px; row-gap: 4px; }
.sw { display: flex; align-items: center; gap: 8px; padding: 4px 6px; border-radius: 6px; min-width: 0; }
.sw i { width: 16px; height: 16px; flex: none; border-radius: 3px; border: 1px solid var(--border); }
.sw .k { flex: 1; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sw .v { font-family: var(--font-mono); font-size: 10px; color: var(--muted-foreground); }

/* ---- hero ---- */
.hero { display: flex; gap: 14px; padding: 0; }
.hero-card {
  width: 288px; border-radius: 12px; overflow: hidden;
  border: 1px solid rgb(255 255 255 / 0.08);
  box-shadow: 0 16px 34px -18px rgb(0 0 0 / 0.55);
  display: flex; flex-direction: column;
}
.hero-top { padding: 16px 18px 14px; display: flex; align-items: center; gap: 11px; }
.hero-top .nm { font-size: 15px; font-weight: 600; letter-spacing: -0.01em; }
.hero-top .accent { width: 11px; height: 11px; border-radius: 50%; flex: none; }
.hero-top .tag { margin-left: auto; font-family: var(--font-mono); font-size: 10.5px; opacity: 0.62; }
.hero-code { padding: 0 18px 16px; font-family: var(--font-mono); font-size: 12px; line-height: 1.7; }
.hero-ramp { display: flex; height: 34px; }
.hero-ramp span { flex: 1; }
`;

// --- content -----------------------------------------------------------------

const CODE_SAMPLE = `import { tokenBucket } from "./bucket";

// Buckets refill continuously, so a quiet client keeps its whole burst.
export function rateLimit(options: LimiterOptions) {
  const buckets = new Map<string, Bucket>();

  return async function guard(key: string) {
    const bucket = buckets.get(key) ?? tokenBucket(options);
    buckets.set(key, bucket);
    return bucket.take(1);
  };
}`;

const THREADS = [
  { project: "acme-api", items: [
    { label: "Rate limit middleware", state: "run", active: true },
    { label: "Fix flaky auth test", state: "ok" },
    { label: "Migrate to Postgres 16", state: "" },
  ]},
  { project: "docs-site", items: [
    { label: "Dark mode audit", state: "ok" },
    { label: "Rewrite install guide", state: "" },
  ]},
];

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function appHtml(theme) {
  const rows = THREADS.map((group) => {
    const head = `<div class="row project"><span class="chev">▾</span><span class="label">${group.project}</span></div>`;
    const kids = group.items.map((item) => `
      <div class="row thread${item.active ? " active" : ""}">
        <span class="dot ${item.state}"></span>
        <span class="label">${item.label}</span>
      </div>`).join("");
    return head + kids;
  }).join("");

  return `
<div class="frame app" style="width:1000px;height:760px">
  <aside class="sidebar">
    <div class="brand">
      <span class="mark">b</span><span class="name">bb</span>
      <span class="fill"></span><span class="kbd">⌘K</span>
    </div>
    <div class="side-label">Projects</div>
    ${rows}
  </aside>
  <div class="content">
    <header class="topbar">
      <div class="crumb">acme-api<span class="sep">/</span><b>Rate limit middleware</b></div>
      <span class="spacer"></span>
      <span class="chip"><i class="dot"></i>3 files changed</span>
      <span class="chip accent">${theme.name}</span>
    </header>
    <div class="convo">
      <div class="msg">
        <div class="who"><span class="avatar user">U</span>You</div>
        <div class="prose">Add a token-bucket rate limiter to the gateway and cover the burst case in <code>limiter.test.ts</code>.</div>
      </div>
      <div class="msg">
        <div class="who"><span class="avatar bot">b</span>Assistant</div>
        <div class="prose">Added <code>rateLimit()</code> in front of the router. Buckets are keyed per client and refill on read, so an idle client keeps its full burst.</div>
        <div class="block">
          <div class="block-head"><span class="file">src/limiter.ts</span><span class="tag">typescript</span></div>
          <pre class="code bb-code-highlight">${highlight(CODE_SAMPLE)}</pre>
        </div>
        <div class="block">
          <div class="block-head"><span>zsh</span><span class="tag">npm test</span></div>
          <pre class="term"><span style="color:var(--ansi-8)">$</span> npm test -- limiter
<span style="color:var(--ansi-2)"> PASS </span> <span style="color:var(--ansi-8)">test/</span>limiter.test.ts
  <span style="color:var(--ansi-2)">✓</span> refills continuously        <span style="color:var(--ansi-8)">4ms</span>
  <span style="color:var(--ansi-2)">✓</span> keeps a burst for idle keys <span style="color:var(--ansi-8)">2ms</span>
  <span style="color:var(--ansi-1)">✗</span> rejects past the burst      <span style="color:var(--ansi-8)">7ms</span>
<span style="color:var(--ansi-3)">›</span> 2 passed, <span style="color:var(--ansi-1)">1 failed</span>, <span style="color:var(--ansi-4)">3 total</span></pre>
        </div>
        <div class="badges">
          <span class="badge ok"><i class="sq" style="background:var(--success)"></i>build passing</span>
          <span class="badge warn"><i class="sq" style="background:var(--warning)"></i>1 lint warning</span>
          <span class="badge err"><i class="sq" style="background:var(--destructive)"></i>1 test failing</span>
          <span class="badge pr"><i class="sq" style="background:var(--pr-merged)"></i>#412 merged</span>
        </div>
      </div>
    </div>
    <div class="composer">
      <span class="ph">Reply to this thread…</span>
      <span class="send">Send</span>
    </div>
  </div>
</div>`;
}

function miniHtml(palette) {
  const lines = [
    [["syntax.keyword", 16], ["syntax.entity", 30], ["syntax.string", 22]],
    [["syntax.comment", 42]],
    [["syntax.tag", 12], ["syntax.func", 26], ["syntax.constant", 14]],
  ];
  const body = lines.map((segments) => `<div class="ln">${
    segments.map(([key, width]) =>
      `<span style="background:${palette[key]};width:${width}px"></span>`).join("")
  }</div>`).join("");
  return `
<div class="mini" style="background:${palette["editor.bg"]}">
  <div class="strip" style="background:${palette["ui.bg"]}">
    <i style="background:${palette["common.accent.tint"]}"></i>
  </div>
  <div class="lines">${body}</div>
</div>`;
}

function panelHtml(active, palettes) {
  const rows = VARIANTS.map((theme) => {
    const on = theme.variant === active.variant;
    return `
    <div class="theme-row${on ? " on" : ""}">
      ${miniHtml(palettes[theme.variant])}
      <div class="theme-meta">
        <div class="top"><span class="nm">${theme.name}</span>${on ? '<span class="pill">Active</span>' : ""}</div>
        <div class="note">${theme.note}</div>
      </div>
      ${on ? "" : '<span class="btn">Apply</span>'}
    </div>`;
  }).join("");

  return `
<div class="frame panel" style="width:820px">
  <div>
    <h1>Themes &amp; palette</h1>
    <div class="sub">Switch between the three ayu themes and copy any colour the palette publishes.</div>
  </div>
  <div class="sec">
    <div class="sec-head"><h2>Theme</h2><span class="hint">applies to every window, light and dark alike</span></div>
    <div style="display:flex;flex-direction:column;gap:8px">${rows}</div>
  </div>
</div>`;
}

function swatchGrid(palette, prefixes) {
  const cells = prefixes.flatMap((prefix) =>
    Object.entries(palette)
      .filter(([key]) => key.startsWith(`${prefix}.`))
      .map(([key, hex]) => `
        <div class="sw">
          <i style="background:${hex}"></i>
          <span class="k">${key.slice(prefix.length + 1)}</span>
          <span class="v">${hex}</span>
        </div>`),
  ).join("");
  return `<div class="grid">${cells}</div>`;
}

function paletteHtml(theme, palette) {
  const ramps = RAMP_ORDER.map((hue) => `
    <div class="ramp">
      <span class="hue">${hue}</span>
      <div class="bar">${
        RAMP_STEPS.map((step) => `<span style="background:${palette[`palette.${hue}.${step}`]}"></span>`).join("")
      }</div>
    </div>`).join("");

  const tabs = VARIANTS.map((v) =>
    `<span class="tab${v.variant === theme.variant ? " on" : ""}">${v.variant[0].toUpperCase()}${v.variant.slice(1)}</span>`,
  ).join("");

  return `
<div class="frame panel" style="width:820px">
  <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
    <div>
      <h1>Palette</h1>
      <div class="sub">Every colour ayu publishes for this variant. Click any swatch to copy its hex.</div>
    </div>
    <div class="tabs">${tabs}</div>
  </div>
  <div class="sec">
    <div class="sec-head"><h2>Ramps</h2><span class="hint">l1 → l5, darker to lighter</span></div>
    <div style="display:flex;flex-direction:column;gap:6px">${ramps}</div>
  </div>
  <div class="rule"></div>
  <div class="sec">
    <div class="sec-head"><h2>Syntax</h2></div>
    ${swatchGrid(palette, ["syntax"])}
  </div>
  <div class="sec">
    <div class="sec-head"><h2>Terminal</h2></div>
    ${swatchGrid(palette, ["terminal"])}
  </div>
  <div class="sec">
    <div class="sec-head"><h2>Interface</h2><span class="hint">editor, chrome, and vcs</span></div>
    ${swatchGrid(palette, ["vcs", "editor", "ui", "common"])}
  </div>
</div>`;
}

/** One hero card per theme — painted from palette values, not from tokens. */
function heroCardHtml(theme, palette) {
  const snippet = [
    [["const ", "syntax.keyword"], ["limiter ", "editor.fg"], ["= ", "syntax.operator"], ["rateLimit", "syntax.func"], ["({", "editor.fg"]],
    [["  burst", "syntax.tag"], [": ", "editor.fg"], ["40", "syntax.constant"], [",", "editor.fg"]],
    [["  key", "syntax.tag"], [": ", "editor.fg"], ['"client-ip"', "syntax.string"], [",", "editor.fg"]],
    [["});", "editor.fg"]],
    [["// idle clients keep the burst", "syntax.comment"]],
  ].map((line) => line
    .map(([text, key]) => `<span style="color:${palette[key]}">${esc(text)}</span>`)
    .join("")).join("\n");

  const ramp = ["red", "orange", "yellow", "green", "teal", "blue", "purple"]
    .map((hue) => `<span style="background:${palette[`palette.${hue}.l3`]}"></span>`).join("");

  return `
<div class="hero-card" style="background:${palette["editor.bg"]};color:${palette["editor.fg"]}">
  <div class="hero-top" style="background:${palette["ui.bg"]};border-bottom:1px solid ${palette["ui.line"]}">
    <span class="accent" style="background:${palette["common.accent.tint"]}"></span>
    <span class="nm">${theme.name}</span>
    <span class="tag">${palette["editor.bg"]}</span>
  </div>
  <pre class="hero-code">${snippet}</pre>
  <div class="hero-ramp">${ramp}</div>
</div>`;
}

function heroHtml(palettes) {
  return `<div class="hero">${
    VARIANTS.map((theme) => heroCardHtml(theme, palettes[theme.variant])).join("")
  }</div>`;
}

// --- rendering ---------------------------------------------------------------

export function page({ themeCss, mode, body }) {
  return `<!doctype html>
<html class="${mode}"><head><meta charset="utf-8">
<style>${BASE_TOKENS}</style>
<style>${themeCss}</style>
<style>${SHELL_CSS}</style>
</head><body><div class="stage">${body}</div></body></html>`;
}

async function shoot(browser, { name, themeCss, mode, body, selector = ".stage" }) {
  const context = await browser.newContext({ deviceScaleFactor: 2 });
  const target = await context.newPage();
  await target.setContent(page({ themeCss, mode, body }), { waitUntil: "load" });
  await target.evaluate(() => document.fonts.ready);

  // A fixed-height frame silently crops whatever does not fit, and a cropped
  // block reads as a rendering bug rather than as a screenshot. Fail instead.
  const overflow = await target.evaluate(() =>
    [...document.querySelectorAll(".convo, .content, .app")]
      .filter((el) => el.scrollHeight - el.clientHeight > 1)
      .map((el) => `${el.className} overflows by ${el.scrollHeight - el.clientHeight}px`),
  );
  if (overflow.length > 0) {
    throw new Error(`${name}: content does not fit — ${overflow.join("; ")}`);
  }

  const node = target.locator(selector);
  await node.screenshot({ path: resolve(outDir, `${name}.png`), omitBackground: true });
  await context.close();
  console.log(`  assets/screenshots/${name}.png`);
}

export async function main() {
  await mkdir(outDir, { recursive: true });
  const palettes = await readPalettes();
  const css = Object.fromEntries(
    await Promise.all(VARIANTS.map(async (t) => [t.variant, await readThemeCss(t.id)])),
  );

  const browser = await chromium.launch();
  try {
    console.log("rendering:");

    // The hero draws every card from palette values directly, so the page
    // itself just needs one theme loaded for the surrounding page background.
    await shoot(browser, {
      name: "hero",
      themeCss: css.dark,
      mode: "dark",
      body: heroHtml(palettes),
    });

    for (const theme of VARIANTS) {
      await shoot(browser, {
        name: `ui-${theme.variant}`,
        themeCss: css[theme.variant],
        mode: theme.mode,
        body: appHtml(theme),
      });
      await shoot(browser, {
        name: `palette-${theme.variant}`,
        themeCss: css[theme.variant],
        mode: theme.mode,
        body: paletteHtml(theme, palettes[theme.variant]),
      });
    }

    for (const theme of VARIANTS) {
      await shoot(browser, {
        name: `panel-${theme.variant}`,
        themeCss: css[theme.variant],
        mode: theme.mode,
        body: panelHtml(theme, palettes),
      });
    }
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) await main();
