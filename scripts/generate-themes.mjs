// Generates the BB theme stylesheets and the palette module from the upstream
// `ayu` package (github.com/ayu-theme/ayu-colors).
//
//   npm run generate
//
// Everything under themes/ and generated/ is written by this script — edit the
// mapping here, never the output.
//
//
// How this maps, and why it is not a 1:1 copy of ayu's editor themes
// ------------------------------------------------------------------
// Ayu and BB stack their surfaces in opposite directions.
//
// Ayu names three surfaces: `surface.base` (window chrome — sidebar, status
// bar), `surface.lift` (the editor), and `ui.panel`/`ui.popup` on top. Base is
// the DARKEST of them; the editor sits lifted above it.
//
// BB has one anchor, `--canvas`, and derives everything else from it by mixing
// in `--ink`. Every derivation moves AWAY from canvas — including the sidebar,
// which is `color-mix(in oklch, var(--ink) 2.2%, var(--canvas))`, i.e. always a
// step lighter. `--background`, `--card` and `--popover` all default to plain
// `var(--canvas)`.
//
// So `--canvas` must be ayu's `surface.lift` (the big content surface), not
// `surface.base`. Anchoring on base and overriding `--background` separately
// splits background away from the card/popover/sidebar derivations, and the
// result is what it sounds like: sidebar, content and cards land within one or
// two levels of each other, the sidebar comes out LIGHTER than the content, and
// the whole app flattens into a single muddy tone.
//
// The surfaces ayu places below or above the editor are then set explicitly,
// because BB would otherwise derive them in the wrong direction.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as ayu from "ayu";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ayuVersion = JSON.parse(
  readFileSync(join(root, "node_modules", "ayu", "package.json"), "utf8"),
).version;

/** WCAG relative luminance of an opaque `#rrggbb`. */
function luminance(hex) {
  const channels = [1, 3, 5].map((offset) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a, b) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

/** Black or white — whichever is readable drawn on `hex` as a background. */
function onColor(hex) {
  return contrast("#ffffff", hex) >= contrast("#000000", hex) ? "#ffffff" : "#000000";
}

const ANSI = [
  "black", "red", "green", "yellow", "blue", "magenta", "cyan", "white",
  "brightBlack", "brightRed", "brightGreen", "brightYellow", "brightBlue",
  "brightMagenta", "brightCyan", "brightWhite",
];

function tokens(variant) {
  const { syntax, terminal, vcs, editor, ui, common } = variant;
  const uiFg = ui.fg.hex();
  const line = ui.line.hex();
  const accent = common.accent.tint.hex();

  const ansi = ANSI.flatMap((name, index) => {
    // Ayu 9 sets both black and brightBlack to near-black on its dark variants.
    // Bright black is what dim terminal output — diff context, git hints, most
    // shell prompts — is drawn in, so it has to stay visible on the surface.
    // Ayu's own UI grey is the colour it dims chrome text with; vscode-ayu makes
    // the same substitution.
    const hex =
      name === "brightBlack" && contrast(terminal[name].hex(), editor.bg.hex()) < 1.5
        ? uiFg
        : terminal[name].hex();
    return [
      [`--ansi-${index}`, hex],
      [`--ansi-bg-fg-${index}`, onColor(hex)],
    ];
  });

  return [
    ["/* anchors — canvas is ayu's surface.lift, the big content surface */"],
    ["--canvas", editor.bg.hex()],
    ["--ink", editor.fg.hex()],

    ["/* chrome — ayu puts this BELOW the content; BB would derive it above */"],
    ["--sidebar", ui.bg.hex()], // ayu surface.base
    ["--sidebar-border", line],
    ["--sidebar-accent", ui.selection.active.hex()],

    ["/* surfaces ayu lifts above the content */"],
    ["--card", ui.panel.bg.hex()],
    ["--popover", ui.popup.bg.hex()],
    ["--surface-raised", ui.panel.bg.hex()],
    ["--surface-raised-solid", ui.panel.bg.hex()],

    // BB builds every neutral fill by mixing `--ink` into `--canvas`. Ayu's ink
    // is a WARM grey (mirage #cccac2) and its surfaces are cool navy, so those
    // mixes come out tan: inline-code chips at #282225, table fills at #1a1e25,
    // against a #10141c app. Ayu keeps its chrome cool by washing surfaces with
    // ui.selection and dropping wells to surface.base instead, so these are set
    // from those rather than left to derive.
    ["/* neutral fills — ink is warm, so these cannot be left to derive */"],
    ["--secondary", ui.selection.normal.hex()],
    ["--accent", ui.selection.normal.hex()],
    ["--muted", ui.selection.active.hex()],
    ["--surface-recessed", ui.bg.hex()],
    ["--surface-recessed-solid", ui.bg.hex()],
    ["--surface-recessed-soft-solid", ui.bg.hex()],

    ["/* lines and overlays — ayu draws these far subtler than BB derives them */"],
    ["--border", line],
    ["--border-hairline", line],
    ["--border-seam", line],
    ["--input", `${uiFg}33`],
    ["--state-hover", ui.selection.normal.hex()],
    ["--state-active", ui.selection.active.hex()],
    // BB defaults this to solid `var(--primary)`; ayu selects rows with a
    // neutral wash and keeps the accent for focus.
    ["--surface-selected", ui.selection.active.hex()],

    ["/* accent */"],
    ["--primary", accent],
    ["--primary-foreground", common.accent.on.hex()],
    ["--file-accent", syntax.entity.hex()],

    ["/* semantic */"],
    ["--destructive", common.error.hex()],
    ["--destructive-foreground", "#ffffff"], // ayu surface.over
    ["--destructive-text", common.error.hex()],
    ["--warning", accent],
    ["--warning-text", accent],
    ["--attention", accent],
    ["--success", vcs.added.hex()],
    ["--diff-added", vcs.added.hex()],
    ["--diff-removed", vcs.removed.hex()],
    ["--pr-merged", syntax.constant.hex()],

    ["/* terminal */"],
    ...ansi,
  ];
}

// BB's own tiers sit close to `--ink` (78% / 71.5% / 68% lightness against ink
// at 81%) because `--muted-foreground` carries a lot of ordinary secondary text.
// Ayu's `ui.fg` is far dimmer than that — it is a tab-label colour, not a body
// tier — so these follow BB's documented anchor-derived recipe instead and pick
// up the palette's hue through `--ink` and `--canvas`.
const TEXT_TIERS = [
  ["--muted-foreground", "color-mix(in oklch, var(--ink) 78%, var(--canvas))"],
  ["--readback-foreground", "color-mix(in oklch, var(--ink) 71%, var(--canvas))"],
  ["--subtle-foreground", "color-mix(in oklch, var(--ink) 64%, var(--canvas))"],
];

/**
 * BB highlights code with sugar-high, whose tokens read their colour from
 * `--sh-*` custom properties — so ayu's syntax palette, the part of the theme
 * that actually carries its identity, is reachable from CSS after all.
 *
 * These are declared ON `.bb-code-highlight` by BB itself, not inherited from
 * `:root`, so an element-level declaration is required to override them; a
 * `:root` block would lose to BB's own rule. `.dark .bb-code-highlight` is
 * repeated to outrank BB's dark override at equal specificity (this stylesheet
 * is injected last, so equal specificity wins on order).
 *
 * `--sh-identifier`, `--sh-sign` and `--sh-space` are left alone: BB already
 * points them at `--foreground` / `--muted-foreground`, which are ayu's
 * `editor.fg` and a dimmed tier of it. sugar-high's `sign` covers all
 * punctuation rather than just operators, so painting it ayu's salmon
 * `syntax.operator` would tint every bracket and comma.
 */
function codeTokens(variant) {
  const { syntax } = variant;
  return [
    ["--sh-keyword", syntax.keyword.hex()], // if, return, const
    ["--sh-string", syntax.string.hex()],
    ["--sh-comment", syntax.comment.hex()],
    ["--sh-class", syntax.entity.hex()], // ayu: "class names, types, modules"
    ["--sh-entity", syntax.func.hex()], // ayu: "function names and calls"
    ["--sh-property", syntax.tag.hex()],
    ["--sh-jsxliterals", syntax.tag.hex()], // sugar-high uses this for JSX element names
  ];
}

function block(selector, entries) {
  const body = entries
    .map(([name, value], index) =>
      value === undefined
        ? `${index === 0 ? "" : "\n"}  ${name}`
        : `  ${name}: ${value};`,
    )
    .join("\n");
  return `${selector} {\n${body}\n}`;
}

/**
 * Each ayu variant is a whole theme, the way ayu ships them everywhere else, so
 * one stylesheet paints both of BB's modes: selecting Ayu Dark gives you Ayu
 * Dark whichever way the light/dark switch is set. `color-scheme` follows the
 * palette so native scrollbars and form controls match it.
 */
function stylesheet({ variant, scheme, note }) {
  return [
    `/* ${note} */`,
    "/* Generated by scripts/generate-themes.mjs — do not edit by hand. */",
    "",
    block(":root, .light, .dark", [
      ["color-scheme", scheme],
      ...tokens(ayu[variant]),
      ["/* text tiers */"],
      ...TEXT_TIERS,
    ]),
    "",
    "/* Syntax highlighting (sugar-high). Declared at element level because BB",
    "   sets these on .bb-code-highlight itself, not on :root. */",
    block(
      ".bb-code-highlight,\n.light .bb-code-highlight,\n.dark .bb-code-highlight",
      codeTokens(ayu[variant]),
    ),
    "",
  ].join("\n");
}

const THEMES = [
  { id: "ayu-light", variant: "light", scheme: "light", note: "Ayu Light." },
  { id: "ayu-dark", variant: "dark", scheme: "dark", note: "Ayu Dark." },
  { id: "ayu-mirage", variant: "mirage", scheme: "dark", note: "Ayu Mirage." },
];

mkdirSync(join(root, "themes"), { recursive: true });
for (const theme of THEMES) {
  writeFileSync(join(root, "themes", `${theme.id}.css`), stylesheet(theme));
  console.log(`themes/${theme.id}.css`);
}

// --- palette module ---------------------------------------------------------

/** Flatten a variant into dotted keys -> hex, for `bb ayu colors`. */
function flatten(node, path = [], out = {}) {
  for (const [key, value] of Object.entries(node)) {
    if (value && typeof value.hex === "function") out[[...path, key].join(".")] = value.hex();
    else if (value && typeof value === "object") flatten(value, [...path, key], out);
  }
  return out;
}

const palettes = Object.fromEntries(
  ["light", "dark", "mirage"].map((variant) => [variant, flatten(ayu[variant])]),
);

mkdirSync(join(root, "generated"), { recursive: true });
writeFileSync(
  join(root, "generated", "palettes.ts"),
  [
    "// Generated by scripts/generate-themes.mjs — do not edit by hand.",
    `// Source: ayu@${ayuVersion}`,
    "",
    'export const AYU_VARIANTS = ["light", "dark", "mirage"] as const;',
    "",
    "export type AyuVariant = (typeof AYU_VARIANTS)[number];",
    "",
    `export const AYU_PALETTES: Record<AyuVariant, Record<string, string>> = ${JSON.stringify(palettes, null, 2)};`,
    "",
  ].join("\n"),
);
console.log("generated/palettes.ts");
