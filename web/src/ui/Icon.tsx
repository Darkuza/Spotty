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
  pulse: "M3 12h4l2-5 4 10 2-5h6",
  drop: "M12 3.5c-3 4-5.5 7-5.5 10a5.5 5.5 0 0 0 11 0c0-3-2.5-6-5.5-10z",
  bowl: "M3.5 11h17a8.5 8 0 0 1-17 0z|M7 19.5h10",
  stool: "M7 18.5h10a3 3 0 0 0 0-6h-1a3 3 0 0 0-3-3h-2a2.5 2.5 0 0 0-2.5 2.5V12A3.2 3.2 0 0 0 7 18.5z",
  urine: "M12 5c-2.5 3.5-4 5.5-4 8a4 4 0 0 0 8 0c0-2.5-1.5-4.5-4-8z|M6 20.5h12",
  route: "C6,18,2|C18,6,2|M6 16v-3.5A4.5 4.5 0 0 1 10.5 8H16",
  cough: "M3 12h2.5l1.5-3 2 6 2-9 2 12 2-8 1.5 2H21",
  nausea: "M4 9c2.7 0 2.7 2 5.3 2S12 9 14.7 9s2.6 2 5.3 2|M4 15c2.7 0 2.7 2 5.3 2s2.7-2 5.4-2 2.6 2 5.3 2",
  scale: "R4,4,16,16,4|M8.5 10a4 4 0 0 1 7 0M12 10l1.5-1.5",
  eye: "M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z|C12,12,2.5",
  wind: "M4 9h10a3 3 0 1 0-3-3M4 15h14a3 3 0 1 1-3 3",
  search: "C10.5,10.5,6|M15 15l5 5",
  share: "M12 3.5v11M8 7.5l4-4 4 4|M7 10.5H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1",
  doc: "M7 3.5h7l4 4v12a1.5 1.5 0 0 1-1.5 1.5h-9.5A1.5 1.5 0 0 1 5.5 19.5v-14.5A1.5 1.5 0 0 1 7 3.5z|M14 3.5v4h4M9 13h6M9 16.5h4",
  flask: "M9.5 3.5v6L5 18a2 2 0 0 0 1.8 2.9h10.4A2 2 0 0 0 19 18l-4.5-8.5v-6M8 3.5h8M7.5 14.5h9",
  flag: "M6 4v16M6 7h11l-2 3 2 3H6",
  question: "C12,12,8.5|M9.6 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.6M12 16.8v.3",
  medical: "M12 4v16M5.1 8l13.8 8M18.9 8L5.1 16",
  calendar: "R4,5,16,15,2.5|M4 9.5h16M8.5 3.5v3M15.5 3.5v3",
  receipt: "M6.5 3.5h11v17l-2.75-1.6-2.75 1.6-2.75-1.6-2.75 1.6z|M9.5 8.5h5M9.5 12h5",
  scan: "R3.5,5,17,14,2.5|C12,12,3.5",
  info: "C12,12,8.5|M12 11v5M12 7.8v.4",
  down: "M6 9.5l6 6 6-6",
  up: "M6 14.5l6-6 6 6",
  updown: "M7.5 9.5l4.5-4.5 4.5 4.5M7.5 14.5l4.5 4.5 4.5-4.5",
  expand: "M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16",
  compose: "M12 20h8|M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z",
  history: "M3.5 12a8.5 8.5 0 1 0 2.5-6M3.5 4.5V9H8|M12 8v4l3 2",
  minus: "M5 12h14",
  users: "C9,8.5,3|M3.5 19c.9-3 3-4.5 5.5-4.5s4.6 1.5 5.5 4.5|M16 5.5a3 3 0 0 1 0 6M17.5 14.6c1.6.6 2.6 2 3 4.4",
  book: "M4.5 5h5a2.5 2.5 0 0 1 2.5 2.5V20a2 2 0 0 0-2-2h-5.5zM19.5 5h-5A2.5 2.5 0 0 0 12 7.5V20a2 2 0 0 1 2-2h5.5z",
  sun: "C12,12,4|M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4",
  later: "C12,12,8.5|M12 7.5V12l3 2|M18.5 3.5l2 2",
  skip: "C12,12,8.5|M8.5 12h7",
  grid: "R4,4,7,7,2|R13,4,7,7,2|R4,13,7,7,2|R13,13,7,7,2",
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
