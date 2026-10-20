// Protokollfotos: verkleinern, hochladen, löschen, mit Claude auslesen.

import { backend } from "./config";
import { newId } from "./store";
import { shrinkImage } from "./files";
import { deletePhotoRow, savePhoto } from "./data";
import { berlinNow } from "@shared/dates.ts";
import type { Photo } from "@shared/types.ts";

export async function uploadProtocolPhoto(file: File, day: string): Promise<Photo> {
  const s = await shrinkImage(file, 2600, 0.86);
  const id = newId();
  const ext = s.type === "image/png" ? "png" : s.type === "image/webp" ? "webp" : "jpg";
  const path = `${day}/${id}.${ext}`;
  await backend.upload("photos", path, s.blob, s.type);
  const photo: Photo = { id, day, time: berlinNow().hm, path, width: s.width || null, height: s.height || null, bytes: s.blob.size };
  savePhoto(photo);
  return photo;
}

export async function removeProtocolPhoto(p: Photo): Promise<void> {
  deletePhotoRow(p.id);
  try {
    await backend.removeFiles("photos", [p.path]);
  } catch {
    /* Datei bleibt liegen, der Eintrag ist entfernt */
  }
}

export interface ProtocolExtraction {
  datum?: string | null;
  eintraege: { time: string; type: string; data: Record<string, unknown>; original: string; unsicher: boolean }[];
  medikamente: { time: string; name: string; menge?: string; original: string }[];
  hinweise: string;
}

export async function extractProtocol(p: Photo): Promise<ProtocolExtraction> {
  const res = await backend.invoke<{ ok: boolean; result: ProtocolExtraction }>("extract", { kind: "protokoll", bucket: "photos", path: p.path, day: p.day });
  return res.result;
}
