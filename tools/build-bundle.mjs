// Baut aus der vorbereiteten Akte (data-private/akte.json) und dem Behandlungsplan (data-private/regimens.json)
// eine Import-Datei mit eingebetteten Originaldateien. Die Datei bleibt außerhalb des Repositorys und wird
// in der App unter Einstellungen → Akte importieren eingelesen.
//
// Aufruf: node tools/build-bundle.mjs [Ausgabedatei]
// Fotos werden auf höchstens 2400 px verkleinert, wenn das Paket „sharp“ verfügbar ist.

import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename } from "node:path";

const root = new URL("../", import.meta.url);
const dir = new URL("data-private/", root);
const out = process.argv[2] || new URL("spotty-akte.json", dir).pathname;

const require = createRequire(import.meta.url);
let sharp = null;
for (const p of ["sharp", "/opt/npm-tools/node_modules/sharp"]) {
  try {
    sharp = require(p);
    break;
  } catch {
    /* nächster Versuch */
  }
}

const akte = JSON.parse(readFileSync(new URL("akte.json", dir), "utf8"));
const regimensPath = new URL("regimens.json", dir);
const extraPath = new URL("profile-extra.json", dir);
if (existsSync(regimensPath)) akte.regimens = JSON.parse(readFileSync(regimensPath, "utf8"));
if (existsSync(extraPath)) akte.profile = { ...(akte.profile || {}), ...JSON.parse(readFileSync(extraPath, "utf8")) };

async function embed(path, mime) {
  if (!path || !existsSync(path)) {
    console.warn(`  fehlt: ${path}`);
    return null;
  }
  let buf = readFileSync(path);
  let type = mime || (/\.pdf$/i.test(path) ? "application/pdf" : "image/jpeg");
  if (sharp && type.startsWith("image/")) {
    buf = await sharp(buf).rotate().resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85, mozjpeg: true }).toBuffer();
    type = "image/jpeg";
  }
  return { data: buf.toString("base64"), mime: type, bytes: buf.length };
}

let files = 0;
let bytes = 0;
for (const d of akte.documents || []) {
  const list = [];
  for (const f of d.files || []) {
    const e = await embed(f.source_path, f.mime);
    if (!e) continue;
    const name = e.mime === "image/jpeg" ? (f.name || basename(f.source_path)).replace(/\.(jpe?g|png|heic|webp)$/i, ".jpg") : f.name || basename(f.source_path);
    list.push({ name, mime: e.mime, data: e.data });
    files++;
    bytes += e.bytes;
  }
  d.files = list;
}
for (const p of akte.photos || []) {
  const e = await embed(p.source_path, p.mime);
  delete p.source_path;
  if (!e) continue;
  p.mime = e.mime;
  p.data = e.data;
  files++;
  bytes += e.bytes;
}

akte.format = "spotty-akte";
akte.version = 1;
akte.created = new Date().toISOString();
writeFileSync(out, JSON.stringify(akte));
const size = statSync(out).size;
console.log(
  `Geschrieben: ${out}\n` +
    `  ${akte.documents?.length || 0} Dokumente, ${files} Dateien (${(bytes / 1048576).toFixed(1)} MB), ` +
    `${akte.labs?.length || 0} Laborwerte, ${akte.events?.length || 0} Chronik, ${akte.questions?.length || 0} Fragen, ` +
    `${akte.entries?.length || 0} Einträge, ${akte.photos?.length || 0} Fotos, ${akte.regimens?.length || 0} Planpunkte\n` +
    `  Dateigröße ${(size / 1048576).toFixed(1)} MB${sharp ? "" : " (ohne Verkleinerung, sharp fehlt)"}`,
);
