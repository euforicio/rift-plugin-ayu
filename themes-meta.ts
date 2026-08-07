// Plain data shared by server.ts and app.tsx. Keep this module free of any
// runtime imports: the frontend bundles it, the backend requires it, and the
// rpc contract type is the only thing that may cross between those two worlds.
import type { AyuVariant } from "./generated/palettes";

export interface AyuThemeMeta {
  /** Manifest theme id; BB namespaces it as `plugin:ayu:<id>`. */
  id: string;
  name: string;
  variant: AyuVariant;
  note: string;
}

export const AYU_THEMES: readonly AyuThemeMeta[] = [
  {
    id: "ayu-light",
    name: "Ayu Light",
    variant: "light",
    note: "Warm off-white, amber accent",
  },
  {
    id: "ayu-dark",
    name: "Ayu Dark",
    variant: "dark",
    note: "Deep near-black, amber accent",
  },
  {
    id: "ayu-mirage",
    name: "Ayu Mirage",
    variant: "mirage",
    note: "Muted blue-grey, warm amber accent",
  },
];
