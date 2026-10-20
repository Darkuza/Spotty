// Vollbild-Ansicht eines Protokollfotos mit Vergrößern, Auslesen durch Claude und Löschen.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Photo } from "@shared/types.ts";
import { useFileUrl } from "../../ui/StorageImage";
import { fmtDayShort } from "@shared/dates.ts";

export function PhotoViewer({ photo, by, onClose, onExtract, onDelete, extracting }: { photo: Photo; by: string; onClose: () => void; onExtract: () => void; onDelete: () => void; extracting: boolean }) {
  const { url, error } = useFileUrl("photos", photo.path);
  const [zoom, setZoom] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return createPortal(
    <div className={`viewer${zoom ? " zoom" : ""}`} role="dialog" aria-modal="true" aria-label="Protokollfoto">
      <div className="bar">
        <span className="grow">
          {fmtDayShort(photo.day)} · {photo.time}
          {by ? ` · ${by}` : ""}
        </span>
        <button onClick={() => setZoom((z) => !z)}>{zoom ? "Einpassen" : "Vergrößern"}</button>
        <button onClick={onClose}>Schließen</button>
      </div>
      <div className="stage" onDoubleClick={() => setZoom((z) => !z)}>
        {url ? <img src={url} alt={`Protokoll vom ${fmtDayShort(photo.day)}`} /> : <p style={{ padding: 24 }}>{error || "Lädt …"}</p>}
      </div>
      <div className="bar" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 10px)" }}>
        <button onClick={onExtract} disabled={extracting} style={{ flex: 2 }}>
          {extracting ? "Claude liest …" : photo.extraction ? "Erneut mit Claude auslesen" : "Mit Claude auslesen"}
        </button>
        {url ? (
          <a href={url} target="_blank" rel="noreferrer">
            Original
          </a>
        ) : null}
        <button onClick={onDelete}>Löschen</button>
      </div>
    </div>,
    document.body,
  );
}
