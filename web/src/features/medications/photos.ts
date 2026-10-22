// Fotos der Wirkstoffe liegen in src/assets/medications/. Vite legt sie beim Bauen ab und liefert die Adresse;
// ein Foto, dessen Datei fehlt, wird nicht gezeigt (die Seite beginnt dann mit der Strukturformel).

const FILES = import.meta.glob("../../assets/medications/*.{jpg,jpeg,webp}", { eager: true, query: "?url", import: "default" }) as Record<string, string>;

export function photoUrl(file: string): string | null {
  for (const [path, url] of Object.entries(FILES)) if (path.endsWith(`/${file}`)) return url;
  return null;
}

export function photoFiles(): string[] {
  return Object.keys(FILES).map((p) => p.split("/").pop() as string);
}
