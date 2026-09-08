// bb-plugin-ayu — the Ayu settings panel.
//
// Rendered on the plugin's Settings page (Settings → Ayu): switch between the
// three ayu themes and explore every colour the palette publishes. Palette
// data is bundled from generated/palettes.ts; only the active-theme read and
// the theme switch cross rpc.
import { useEffect, useMemo, useState } from "react";
import {
  definePluginApp,
  useRealtime,
  useRealtimeConnectionState,
  useRpc,
} from "@riftlabs/plugin-sdk/app";
import { toast } from "sonner";
import type { rpcContract } from "./server";
import { AYU_PALETTES, type AyuVariant } from "./generated/palettes";
import { AYU_THEMES, type AyuThemeMeta } from "./themes-meta";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

const PLUGIN_ID = "ayu";
const qualify = (id: string) => `plugin:${PLUGIN_ID}:${id}`;

// --- palette shaping ---------------------------------------------------------

const RAMP_ORDER = [
  "red", "pink", "orange", "peach", "yellow",
  "green", "teal", "indigo", "blue", "purple", "gray",
];
const RAMP_STEPS = ["l1", "l2", "l3", "l4", "l5"];

interface Swatch {
  name: string;
  hex: string;
}

function pick(variant: AyuVariant, prefix: string): Swatch[] {
  return Object.entries(AYU_PALETTES[variant])
    .filter(([key]) => key.startsWith(`${prefix}.`))
    .map(([key, hex]) => ({ name: key.slice(prefix.length + 1), hex }));
}

/** Perceived lightness of `#rrggbb[aa]`, for picking a readable overlay. */
function isLightColor(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b > 145;
}

async function copyHex(hex: string) {
  try {
    await navigator.clipboard.writeText(hex);
    toast.success(`Copied ${hex}`);
  } catch {
    toast.error("Clipboard is unavailable in this window");
  }
}

// --- active-theme state ------------------------------------------------------

function useActiveTheme() {
  const rpc = useRpc<typeof rpcContract>();
  const [themeId, setThemeId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const connection = useRealtimeConnectionState();

  useEffect(() => {
    let cancelled = false;
    void rpc
      .call("activeTheme")
      .then((result) => {
        if (!cancelled) setThemeId(result.themeId);
      })
      .catch(() => {
        // The panel still works read-only when the backend is unreachable.
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
    // Refetch on every reconnect: theme-changed signals are not replayed.
  }, [connection]); // eslint-disable-line react-hooks/exhaustive-deps

  useRealtime("theme-changed", (payload) => {
    const next = (payload as { themeId?: string }).themeId;
    if (typeof next === "string") setThemeId(next);
  });

  return { themeId, setThemeId, loaded };
}

// --- theme switcher ----------------------------------------------------------

/**
 * A miniature editor drawn from the theme's own palette: chrome stripe,
 * lifted content surface, syntax-coloured "code" lines, accent dot. The
 * preview IS the data — no icons, no screenshots.
 */
function ThemePreview({ theme }: { theme: AyuThemeMeta }) {
  const palette = AYU_PALETTES[theme.variant];
  const lines: Array<Array<{ color: string; width: number }>> = [
    [
      { color: palette["syntax.keyword"], width: 16 },
      { color: palette["syntax.entity"], width: 30 },
      { color: palette["syntax.string"], width: 22 },
    ],
    [
      { color: palette["syntax.comment"], width: 42 },
    ],
    [
      { color: palette["syntax.tag"], width: 12 },
      { color: palette["syntax.func"], width: 26 },
      { color: palette["syntax.constant"], width: 14 },
    ],
  ];
  return (
    <div
      aria-hidden
      className="flex h-16 w-28 shrink-0 overflow-hidden rounded-md border border-border"
      style={{ backgroundColor: palette["editor.bg"] }}
    >
      <div
        className="flex w-4 flex-col items-center pt-1.5"
        style={{ backgroundColor: palette["ui.bg"] }}
      >
        <span
          className="size-1.5 rounded-full"
          style={{ backgroundColor: palette["common.accent.tint"] }}
        />
      </div>
      <div className="flex flex-col gap-1.5 p-2">
        {lines.map((segments, row) => (
          <div key={row} className="flex gap-1">
            {segments.map((segment, index) => (
              <span
                key={index}
                className="h-1 rounded-full"
                style={{ backgroundColor: segment.color, width: segment.width }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function ThemeRow({
  theme,
  active,
  busy,
  onApply,
}: {
  theme: AyuThemeMeta;
  active: boolean;
  busy: boolean;
  onApply: () => void;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border p-3 transition-colors",
        active ? "border-primary/40 bg-primary/5" : "border-border",
      )}
    >
      <ThemePreview theme={theme} />
      <div className="min-w-32 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{theme.name}</span>
          {active && <Badge variant="secondary">Active</Badge>}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{theme.note}</p>
      </div>
      {!active && (
        <Button
          size="sm"
          variant="outline"
          className="ml-auto"
          disabled={busy}
          onClick={onApply}
        >
          Apply
        </Button>
      )}
    </div>
  );
}

// --- swatches ----------------------------------------------------------------

function RampRow({ hue, variant }: { hue: string; variant: AyuVariant }) {
  const palette = AYU_PALETTES[variant];
  return (
    <div className="flex items-center gap-3">
      <span className="w-14 shrink-0 text-xs text-muted-foreground">{hue}</span>
      <div className="flex h-9 flex-1 overflow-hidden rounded-md">
        {RAMP_STEPS.map((step) => {
          const hex = palette[`palette.${hue}.${step}`];
          if (!hex) return null;
          return (
            <button
              key={step}
              type="button"
              onClick={() => void copyHex(hex)}
              title={`${hue}.${step} ${hex}`}
              className="group relative flex-1 outline-none transition-[flex-grow] duration-200 ease-out hover:flex-[1.6] focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring"
              style={{ backgroundColor: hex }}
            >
              <span
                className={cn(
                  "pointer-events-none absolute inset-0 hidden items-center justify-center font-mono text-[10px] group-hover:flex group-focus-visible:flex",
                  isLightColor(hex) ? "text-black/70" : "text-white/80",
                )}
              >
                {hex}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SwatchGrid({ swatches }: { swatches: Swatch[] }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
      {swatches.map((swatch) => (
        <button
          key={swatch.name}
          type="button"
          onClick={() => void copyHex(swatch.hex)}
          className="flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-left outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span
            className="size-4 shrink-0 rounded-sm border border-border"
            style={{ backgroundColor: swatch.hex }}
          />
          <span className="min-w-0 flex-1 truncate text-xs text-foreground">
            {swatch.name}
          </span>
          <span className="font-mono text-[10px] text-muted-foreground">
            {swatch.hex}
          </span>
        </button>
      ))}
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2">
        <h2 className="text-sm font-medium text-foreground">{title}</h2>
        {hint && <span className="text-xs text-subtle-foreground">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

// --- the panel ---------------------------------------------------------------

function AyuPanel() {
  const rpc = useRpc<typeof rpcContract>();
  const { themeId, setThemeId, loaded } = useActiveTheme();
  const [busy, setBusy] = useState(false);

  const activeMeta = useMemo(
    () => AYU_THEMES.find((theme) => qualify(theme.id) === themeId) ?? null,
    [themeId],
  );

  const [variant, setVariant] = useState<AyuVariant>("dark");
  const [variantTouched, setVariantTouched] = useState(false);
  useEffect(() => {
    // Follow the active ayu theme until the user picks a tab themselves.
    if (!variantTouched && activeMeta) setVariant(activeMeta.variant);
  }, [activeMeta, variantTouched]);

  async function applyTheme(theme: AyuThemeMeta) {
    setBusy(true);
    try {
      const result = await rpc.call("setTheme", { themeId: qualify(theme.id) });
      setThemeId(result.themeId);
      toast.success(`${theme.name} applied`);
    } catch {
      toast.error(`Couldn't apply ${theme.name} — is the plugin running?`);
    } finally {
      setBusy(false);
    }
  }

  const syntax = useMemo(() => pick(variant, "syntax"), [variant]);
  const terminal = useMemo(() => pick(variant, "terminal"), [variant]);
  const vcs = useMemo(() => pick(variant, "vcs"), [variant]);
  const interfaceSwatches = useMemo(
    () => [...pick(variant, "editor"), ...pick(variant, "ui"), ...pick(variant, "common")],
    [variant],
  );

  return (
    <div className="flex w-full max-w-3xl flex-col gap-8">
        <Section
          title="Theme"
          hint="applies to every window, light and dark alike"
        >
          <div className="flex flex-col gap-2">
            {loaded
              ? AYU_THEMES.map((theme) => (
                  <ThemeRow
                    key={theme.id}
                    theme={theme}
                    active={qualify(theme.id) === themeId}
                    busy={busy}
                    onApply={() => void applyTheme(theme)}
                  />
                ))
              : AYU_THEMES.map((theme) => (
                  <Skeleton key={theme.id} className="h-[88px] rounded-lg" />
                ))}
          </div>
          {loaded && !activeMeta && (
            <p className="text-xs text-muted-foreground">
              Another theme is active right now — applying one of these switches
              the whole app to ayu.
            </p>
          )}
        </Section>

        <Separator />

        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-medium text-foreground">Palette</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Every colour ayu publishes for this variant. Click any swatch to
                copy its hex.
              </p>
            </div>
            <Tabs
              value={variant}
              onValueChange={(next) => {
                setVariant(next as AyuVariant);
                setVariantTouched(true);
              }}
            >
              <TabsList>
                <TabsTrigger value="light">Light</TabsTrigger>
                <TabsTrigger value="dark">Dark</TabsTrigger>
                <TabsTrigger value="mirage">Mirage</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <Section title="Ramps" hint="l1 → l5, darker to lighter">
            <div className="flex flex-col gap-1.5">
              {RAMP_ORDER.map((hue) => (
                <RampRow key={hue} hue={hue} variant={variant} />
              ))}
            </div>
          </Section>

          <Section title="Syntax">
            <SwatchGrid swatches={syntax} />
          </Section>

          <Section title="Terminal">
            <SwatchGrid swatches={terminal} />
          </Section>

          <Section title="Interface" hint="editor, chrome, and vcs">
            <SwatchGrid swatches={[...vcs, ...interfaceSwatches]} />
          </Section>
        </div>
    </div>
  );
}

export default definePluginApp((app) => {
  // Deliberately no navPanel: the panel lives on the plugin's Settings page
  // (Settings → Ayu) instead of taking a row in the app sidebar.
  app.slots.settingsSection({
    id: "palette",
    title: "Themes & palette",
    description:
      "Switch between the three ayu themes and copy any colour the palette publishes.",
    component: AyuPanel,
  });
});
