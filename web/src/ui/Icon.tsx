// Schlichte Strich-Symbole (24 × 24), Farbe über currentColor.

const PATHS: Record<string, string> = {
  today: "M12 7v5l3 2|C12,12,9",
  log: "R5,3,14,18,2|M9 8h6M9 12h6M9 16h3.5",
  stats: "M4 19.5h16|M6 15.5l4-4.5 3 3 5-6.5",
  records: "M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z|M3.5 10.5h17",
  claude: "M5.5 5h13A2.5 2.5 0 0 1 21 7.5v7a2.5 2.5 0 0 1-2.5 2.5H11l-5 3.5V17h-.5A2.5 2.5 0 0 1 3 14.5v-7A2.5 2.5 0 0 1 5.5 5z|M8 10h8M8 13h5",
  settings: "M4 7h9M17 7h3M4 17h3M11 17h9|C15,7,2|C9,17,2",
  alert: "M12 4.5l8.5 15h-17z|M12 10v4.2M12 16.8v.4",
  check: "M5 12.5l4.5 4.5L19 7.5",
  left: "M14.5 5.5L8 12l6.5 6.5",
  right: "M9.5 5.5L16 12l-6.5 6.5",
  close: "M6.5 6.5l11 11M17.5 6.5l-11 11",
  plus: "M12 5v14M5 12h14",
  camera: "M4 8.5a2 2 0 0 1 2-2h2l1.5-2h5L16 6.5h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z|C12,13,3.5",
  trash: "M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12",
  edit: "M5 19h3.5L18 9.5 14.5 6 5 15.5zM13 7.5l3.5 3.5",
  send: "M12 19V6M6.5 11.5L12 6l5.5 5.5",
  phone: "M7 4.5h3l1.5 4-2 1.5a10 10 0 0 0 4.5 4.5l1.5-2 4 1.5v3a2 2 0 0 1-2 2A15 15 0 0 1 5 6.5a2 2 0 0 1 2-2z",
  copy: "R8,8,11,11,2|M5 15V6a1 1 0 0 1 1-1h9",
  download: "M12 4.5v10M7.5 10.5L12 15l4.5-4.5M5 19.5h14",
  upload: "M12 15V5M7.5 9.5L12 5l4.5 4.5M5 19.5h14",
  file: "M7 3.5h7l4 4v13H7z|M14 3.5v4h4",
  refresh: "M19 12a7 7 0 1 1-2-4.9M19 5v4h-4",
  lungs: "M12 4v7M12 11l-3 2M12 11l3 2M8.5 7.5C6 8 4 11 4 15c0 2 1 3.5 3 3.5s2.5-1.5 2.5-3.5V9M15.5 7.5C18 8 20 11 20 15c0 2-1 3.5-3 3.5s-2.5-1.5-2.5-3.5V9",
  heart: "M12 19s-7-4.4-7-9.5A3.8 3.8 0 0 1 12 7a3.8 3.8 0 0 1 7 2.5C19 14.6 12 19 12 19z",
  user: "C12,8.5,3.5|M5 19.5c1.2-3.2 3.8-5 7-5s5.8 1.8 7 5",
  bell: "M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5h-14zM10 20.5h4",
  dot: "C12,12,3",
  pill: "M8.5 15.5l7-7a3.5 3.5 0 0 1 5 5l-7 7a3.5 3.5 0 0 1-5-5zM12 12l3.5 3.5",
  external: "M14 5h5v5M19 5l-8 8M17 14v5H5V7h5",
};

export function Icon({ name, size = 22, stroke = 1.8, className }: { name: keyof typeof PATHS | string; size?: number; stroke?: number; className?: string }) {
  const spec = PATHS[name] || PATHS.dot;
  const parts = spec.split("|");
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {parts.map((p, i) => {
        if (p.startsWith("C")) {
          const [cx, cy, r] = p.slice(1).split(",").map(Number);
          return <circle key={i} cx={cx} cy={cy} r={r} />;
        }
        if (p.startsWith("R")) {
          const [x, y, w, h, rx] = p.slice(1).split(",").map(Number);
          return <rect key={i} x={x} y={y} width={w} height={h} rx={rx} />;
        }
        return <path key={i} d={p} />;
      })}
    </svg>
  );
}
