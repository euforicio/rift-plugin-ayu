// bb-plugin-ayu — the three ayu themes for BB.
//
// The themes are declarative (`bb.themes` in package.json points at the
// generated stylesheets); this factory adds what CSS cannot:
//
//   - rpc for the panel: read the active palette, activate an ayu theme
//     through `bb.sdk.theme` (same server API the Settings page uses)
//   - a realtime signal so every open panel tracks theme changes live
//   - the `bb ayu` CLI, exposing the same resolved palette the stylesheets
//     were generated from
//
// Palette data itself never crosses rpc: `generated/palettes.ts` is a plain
// module, so the frontend bundles it directly.
import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { AYU_PALETTES, AYU_VARIANTS, type AyuVariant } from "./generated/palettes";
import { AYU_THEMES } from "./themes-meta";

export const rpcContract = defineRpcContract({
  activeTheme: {
    input: z.null(),
    output: z.object({ themeId: z.string() }),
  },
  setTheme: {
    input: z.object({ themeId: z.string() }).strict(),
    output: z.object({ themeId: z.string() }),
  },
});

function isVariant(value: string): value is AyuVariant {
  return (AYU_VARIANTS as readonly string[]).includes(value);
}

const USAGE = [
  "Usage:",
  "  bb ayu themes [--json]                     The three ayu themes and how to activate each",
  "  bb ayu colors [variant] [filter] [--json]  Resolved ayu colours",
  "",
  `Variants: ${AYU_VARIANTS.join(", ")}. A filter matches dotted keys, e.g. \`syntax\`.`,
].join("\n");

export default function plugin(bb: BbPluginApi) {
  const qualify = (id: string) => `plugin:${bb.pluginId}:${id}`;

  bb.rpc.register(rpcContract, {
    async activeTheme() {
      const active = await bb.sdk.theme.get();
      return { themeId: active.themeId };
    },
    async setTheme({ themeId }) {
      if (!AYU_THEMES.some((theme) => qualify(theme.id) === themeId)) {
        throw new Error(`Not an ayu theme: ${themeId}`);
      }
      const applied = await bb.sdk.theme.set(themeId);
      bb.realtime.publish("theme-changed", { themeId: applied.themeId });
      return { themeId: applied.themeId };
    },
  });

  bb.cli.register({
    name: "ayu",
    summary: "The ayu colour palette and the themes this plugin contributes",
    commands: [
      {
        name: "themes",
        summary: "List the three ayu themes and the command that activates each",
        usage: "bb ayu themes [--json]",
      },
      {
        name: "colors",
        summary:
          "Print resolved ayu colours (light, dark, or mirage) as dotted key/hex pairs",
        usage: "bb ayu colors [light|dark|mirage] [filter] [--json]",
      },
    ],
    run(argv) {
      const json = argv.includes("--json");
      const args = argv.filter((arg) => arg !== "--json");
      const [command, ...rest] = args;

      if (!command || command === "help" || command === "--help") {
        return { exitCode: 0, stdout: USAGE };
      }

      if (command === "themes") {
        const rows = AYU_THEMES.map((theme) => ({
          id: theme.id,
          name: theme.name,
          note: theme.note,
          themeId: qualify(theme.id),
        }));
        if (json) {
          return { exitCode: 0, stdout: JSON.stringify(rows, null, 2) };
        }
        const lines = rows.map(
          (row) =>
            `  ${row.name.padEnd(12)} ${row.note.padEnd(36)} bb theme set ${row.themeId}`,
        );
        return { exitCode: 0, stdout: ["Themes:", ...lines].join("\n") };
      }

      if (command === "colors") {
        const [first, second] = rest;
        // Both arguments are optional, so a lone `bb ayu colors syntax` reads
        // as a filter on the default variant rather than an unknown variant.
        const variant = first && isVariant(first) ? first : "dark";
        const filter = first && isVariant(first) ? second : first;

        if (first && !isVariant(first) && second) {
          return {
            exitCode: 1,
            stderr: `Unknown variant "${first}". Expected one of: ${AYU_VARIANTS.join(", ")}.`,
          };
        }

        const entries = Object.entries(AYU_PALETTES[variant]).filter(
          ([key]) => !filter || key.includes(filter),
        );
        if (entries.length === 0) {
          return { exitCode: 1, stderr: `No ${variant} colours match "${filter}".` };
        }
        if (json) {
          return {
            exitCode: 0,
            stdout: JSON.stringify(Object.fromEntries(entries), null, 2),
          };
        }
        const width = Math.max(...entries.map(([key]) => key.length));
        return {
          exitCode: 0,
          stdout: entries.map(([key, hex]) => `${key.padEnd(width)}  ${hex}`).join("\n"),
        };
      }

      return { exitCode: 1, stderr: `Unknown command "${command}".\n\n${USAGE}` };
    },
  });

  bb.log.info(`contributing ${AYU_THEMES.length} themes`);
}
