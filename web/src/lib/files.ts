// Dateien: Fotos verkleinern, hochladen, signierte Adressen zwischenspeichern.

import { backend } from "./config";
import type { Bucket } from "./backend";

const urlCache = new Map<string, { url: string; exp: number }>();

export async function fileUrl(bucket: Bucket, path: string): Promise<string> {
  const key = `${bucket}/${path}`;
  const hit = urlCache.get(key);
  if (hit && hit.exp > Date.now()) return hit.url;
  const url = await backend.signedUrl(bucket, path);
  urlCache.set(key, { url, exp: Date.now() + 50 * 60 * 1000 });
  return url;
}

export interface Shrunk {
  blob: Blob;
  width: number;
  height: number;
  type: string;
}

/** Verkleinert ein Foto auf höchstens `max` Pixel Kantenlänge (JPEG). Handschrift bleibt bei 2400 px gut lesbar. */
export function shrinkImage(file: Blob, max = 2400, quality = 0.86): Promise<Shrunk> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const scale = Math.min(1, max / Math.max(w, h));
      const cw = Math.max(1, Math.round(w * scale));
      const ch = Math.max(1, Math.round(h * scale));
      const canvas = document.createElement("canvas");
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("Bild konnte nicht verarbeitet werden."));
        return;
      }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, cw, ch);
      ctx.drawImage(img, 0, 0, cw, ch);
      URL.revokeObjectURL(url);
      canvas.toBlob(
        (b) => {
          if (b) resolve({ blob: b, width: cw, height: ch, type: "image/jpeg" });
          else reject(new Error("Bild konnte nicht gespeichert werden."));
        },
        "image/jpeg",
        quality,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      const t = (file as File).type || "";
      if (/^image\/(jpeg|png|webp)$/.test(t)) resolve({ blob: file, width: 0, height: 0, type: t });
      else reject(new Error("Dieses Bildformat kann der Browser nicht öffnen. Bitte als JPEG aufnehmen."));
    };
    img.src = url;
  });
}

export function extOf(type: string, name = ""): string {
  if (type === "application/pdf" || /\.pdf$/i.test(name)) return "pdf";
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return "jpg";
}

export function safeName(name: string): string {
  return (
    name
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .replace(/_+/g, "_")
      .slice(-80) || "datei"
  );
}

export function fmtBytes(n: number | null | undefined): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

export function downloadText(filename: string, text: string, type = "text/plain;charset=utf-8") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
