// Generates src/theme.css — the MD3 color scheme for Somni.
// Seeds: sleep blue #7a9fd4 (primary, from the prototype palette),
// feed pink #d84868 (tertiary, used for feeding accents).
// Output uses light-dark(), so runtime scheme switching is just
// setting `color-scheme` on <html> (see src/lib/theme.ts).
import { writeFileSync } from "node:fs";
import {
  DynamicScheme,
  Hct,
  TonalPalette,
  Variant,
  argbFromHex,
} from "@ktibow/material-color-utilities-nightly";
import { colors, genCSS } from "m3-svelte/etc/colors";

const SOURCE = "#7a9fd4";
const TERTIARY = "#d84868";

const mkScheme = (isDark) =>
  new DynamicScheme({
    sourceColorHct: Hct.fromInt(argbFromHex(SOURCE)),
    tertiaryPalette: TonalPalette.fromInt(argbFromHex(TERTIARY)),
    variant: Variant.TONAL_SPOT,
    contrastLevel: 0,
    isDark,
  });

const css = genCSS(mkScheme(false), mkScheme(true), colors);
writeFileSync(new URL("../src/theme.css", import.meta.url), css + "\n");
console.log("Wrote src/theme.css");
