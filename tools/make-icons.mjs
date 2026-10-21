// Erzeugt die App-Symbole aus einer SVG-Vorlage (einmalig, Ergebnis liegt in web/public).
// Aufruf: node tools/make-icons.mjs   (braucht das Paket "sharp")

import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let sharp;
try {
  sharp = require("sharp");
} catch {
  sharp = require("/opt/npm-tools/node_modules/sharp");
}

// Rosa Verlauf wie die Kategorie „Herz und Lunge“ in der App, Pulslinie und Punkt in Weiß
const GRADIENT = `<defs><linearGradient id="bg" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="#ff6382"/><stop offset="1" stop-color="#ff2d55"/></linearGradient></defs>`;
const glyph = (stroke = "#ffffff", spot = "#ffffff") => `
  <path d="M84 282 H170 L218 176 L290 388 L340 282 H428" fill="none" stroke="${stroke}" stroke-width="36" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="388" cy="168" r="38" fill="${spot}"/>`;

const svg = ({ size = 512, radius = 112, bg = "url(#bg)", scale = 1, stroke, spot } = {}) => {
  const t = (512 * (1 - scale)) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  ${bg ? `${GRADIENT}<rect width="512" height="512" rx="${radius}" fill="${bg}"/>` : ""}
  <g transform="translate(${t} ${t}) scale(${scale})">${glyph(stroke, spot)}</g>
</svg>`;
};

const out = new URL("../web/public/", import.meta.url);
writeFileSync(new URL("favicon.svg", out), svg({ size: 64 }));

async function png(name, size, opts) {
  const buf = Buffer.from(svg({ ...opts, size: 512 }));
  await sharp(buf, { density: 144 }).resize(size, size).png({ compressionLevel: 9 }).toFile(new URL(name, out).pathname);
}

await png("icon-192.png", 192, { radius: 112 });
await png("icon-512.png", 512, { radius: 112 });
await png("icon-maskable-512.png", 512, { radius: 0, scale: 0.72 });
await png("apple-touch-icon.png", 180, { radius: 0, scale: 0.86 });
await png("badge-72.png", 72, { bg: null, stroke: "#ffffff", spot: "#ffffff" });
console.log("Symbole geschrieben nach web/public");
