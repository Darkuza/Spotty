import { useEffect, useState } from "react";
import { fileUrl } from "../lib/files";
import type { Bucket } from "../lib/backend";

export function useFileUrl(bucket: Bucket, path: string | null | undefined): { url: string | null; error: string | null } {
  const [state, setState] = useState<{ url: string | null; error: string | null }>({ url: null, error: null });
  useEffect(() => {
    let alive = true;
    if (!path) {
      setState({ url: null, error: null });
      return;
    }
    fileUrl(bucket, path)
      .then((url) => alive && setState({ url, error: null }))
      .catch((e) => alive && setState({ url: null, error: e instanceof Error ? e.message : "Nicht verfügbar" }));
    return () => {
      alive = false;
    };
  }, [bucket, path]);
  return state;
}

export function StorageImage({ bucket, path, alt, className }: { bucket: Bucket; path: string; alt: string; className?: string }) {
  const { url, error } = useFileUrl(bucket, path);
  if (error) return <span className="hint">Bild nicht verfügbar</span>;
  if (!url) return <span className="hint">Lädt …</span>;
  return <img src={url} alt={alt} className={className} loading="lazy" decoding="async" />;
}
