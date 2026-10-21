// Gefüllte Symbole für Kategorien und Messwerte (24 × 24, Farbe über currentColor).
// Bauteile, getrennt durch „|“:
//   M…            Fläche (evenodd)
//   C x,y,r       Kreis      E x,y,rx,ry,deg  Ellipse      R x,y,w,h,r  Rechteck
//   O x,y,r       Kreislinie S M…  Linie (Strich)            T x,y,size,text  Schrift
// Vorsilbe „~“: halbe Deckkraft; Vorsilbe „-“: wird aus den übrigen Teilen ausgestanzt.

import { useId } from "react";

const G: Record<string, string> = {
  heart: "M12 20.9c-.4 0-.8-.1-1.1-.4C6.6 17 2.6 13.7 2.6 9.1 2.6 6.3 4.8 4 7.6 4c1.8 0 3.4.9 4.4 2.3C13 4.9 14.6 4 16.4 4c2.8 0 5 2.3 5 5.1 0 4.6-4 7.9-8.3 11.4-.3.3-.7.4-1.1.4z",
  grid: "R2.6,2.6,8.6,8.6,2.4|R12.8,2.6,8.6,8.6,2.4|R2.6,12.8,8.6,8.6,2.4|R12.8,12.8,8.6,8.6,2.4",
  lungs:
    "M9.3 7.3c-3.4.5-6.4 5-6.4 9.7 0 2.4 1.2 3.9 3.3 3.9 2.4 0 3.7-1.5 3.7-4.2V8.4c0-.7-.2-1.2-.6-1.1z|M14.7 7.3c3.4.5 6.4 5 6.4 9.7 0 2.4-1.2 3.9-3.3 3.9-2.4 0-3.7-1.5-3.7-4.2V8.4c0-.7.2-1.2.6-1.1z|SM12 3.2v6.6M12 9.8l-2.3 2M12 9.8l2.3 2",
  drop: "M12 2.6c.3 0 .6.2.8.5 2.9 3.9 5.9 7.6 5.9 11.4a6.7 6.7 0 0 1-13.4 0c0-3.8 3-7.5 5.9-11.4.2-.3.5-.5.7-.5z",
  bowl: "~M6.4 10.4a5.6 3.4 0 0 1 11.2 0z|M2.7 11.3h18.6c.5 0 .8.4.7.9-.8 4.3-4.8 7.3-10 7.3S2.8 16.5 2 12.2c-.1-.5.2-.9.7-.9z",
  capsule: "M14.47 14.47L8.67 20.27A3.5 3.5 0 0 1 3.73 15.33L9.53 9.53z|~M9.53 9.53L15.33 3.73A3.5 3.5 0 0 1 20.27 8.67L14.47 14.47z",
  hydrant: "M7.7 7.6a4.3 3.4 0 0 1 8.6 0z|R10.9,2.6,2.2,2.6,.7|R7.4,8.3,9.2,10.2,1.4|R3.9,10.6,3.9,3.6,1|R16.2,10.6,3.9,3.6,1|R5.8,18.6,12.4,2.8,1.1|-C12,13.4,1.6",
  poop: "E12,17.6,8.3,3.4,0|E12,12.7,6.2,3,0|E12,8.3,4,2.6,0|M11.4 2.6c1.5.6 2.4 1.8 2.3 3.4l-3.4.3c-.3-1.5.1-2.8 1.1-3.7z",
  paw: "M12 11.6c2.7 0 5.4 3 5.4 5.6 0 1.9-1.4 3-3 3-1 0-1.6-.4-2.4-.4s-1.4.4-2.4.4c-1.6 0-3-1.1-3-3 0-2.6 2.7-5.6 5.4-5.6z|E5.9,10.2,1.9,2.4,-22|E9.5,6.2,2,2.6,-8|E14.5,6.2,2,2.6,8|E18.1,10.2,1.9,2.4,22",
  moon: "M20.6 13.6A8.7 8.7 0 1 1 10.4 3.4a6.9 6.9 0 0 0 10.2 10.2z|~C17.6,4.6,.9|~C20.2,8.1,.6",
  smile: "C12,12,9.4|-C8.9,9.9,1.35|-C15.1,9.9,1.35|-M7.7 13.4c.9 2.2 2.4 3.4 4.3 3.4s3.4-1.2 4.3-3.4c.2-.4-.1-.8-.5-.8H8.2c-.4 0-.7.4-.5.8z",
  scale: "R3.4,3.4,17.2,17.2,3.2|-M12 6.6c-2.5 0-4.6 1.3-5.5 3.2l2.8 1.4c.5-.9 1.5-1.5 2.7-1.5s2.2.6 2.7 1.5l2.8-1.4c-.9-1.9-3-3.2-5.5-3.2z|-SM12 11.4l1.2-2.2",
  pulse: "SM2.6 12.4h3.8l2-4.8 3.6 10 2.6-7.2 1.5 2h5.3",
  o2: "C12,12,9.4|-T12,15.3,8.6,O₂",
  cough: "C14.6,12,4.4|~C20.4,8.6,1.6|~C20.8,15,1.3|SM2.8 12h5.2M4.4 7.6l3.6 1.8M4.4 16.4l3.6-1.8",
  vomit: "SM3.8 8.8c2.7 0 2.7 2 5.4 2s2.7-2 5.4-2 2.7 2 5.4 2|SM3.8 15.2c2.7 0 2.7 2 5.4 2s2.7-2 5.4-2 2.7 2 5.4 2",
  symptom: "O10.4,10.4,6.4|SM15.3 15.3l5 5|R9.5,6.8,1.8,4.6,.9|C10.4,13.4,1.1",
  notes: "M7 4h1.6a2 2 0 0 1 2-1.4h2.8a2 2 0 0 1 2 1.4H17a2.5 2.5 0 0 1 2.5 2.5v12.6A2.5 2.5 0 0 1 17 21.6H7a2.5 2.5 0 0 1-2.5-2.5V6.5A2.5 2.5 0 0 1 7 4z|-R7.8,9.4,8.4,1.7,.85|-R7.8,13.1,8.4,1.7,.85|-R7.8,16.8,5.2,1.7,.85",
  doc: "M7 2.6h6.6c.4 0 .8.2 1.1.5l4.3 4.3c.3.3.5.7.5 1.1V19a2.5 2.5 0 0 1-2.5 2.5H7A2.5 2.5 0 0 1 4.5 19V5.1A2.5 2.5 0 0 1 7 2.6z|-R7.9,11.6,8.2,1.7,.85|-R7.9,15.3,8.2,1.7,.85|-R7.9,7.9,4.2,1.7,.85",
  flask: "~M9 2.6h6v1.7h-.9v4.6l5.2 8.7c.9 1.6-.2 3.6-2.1 3.6H6.8c-1.9 0-3-2-2.1-3.6l5.2-8.7V4.3H9z|M6.73 14h10.54l2.03 3.6c.9 1.6-.2 3.6-2.1 3.6H6.8c-1.9 0-3-2-2.1-3.6z",
  bandage: "M3.4 13.6l10.2-10.2a3.4 3.4 0 0 1 4.8 0l2.2 2.2a3.4 3.4 0 0 1 0 4.8L10.4 20.6a3.4 3.4 0 0 1-4.8 0l-2.2-2.2a3.4 3.4 0 0 1 0-4.8z|-M12 9.6l2.4 2.4-2.4 2.4-2.4-2.4z|-C7.2,14.6,.7|-C9.4,16.8,.7|-C14.6,7.2,.7|-C16.8,9.4,.7",
  shield: "M12 2.6l7.6 3v5.7c0 4.8-3.2 8.7-7.6 10.3-4.4-1.6-7.6-5.5-7.6-10.3V5.6z|-R11,7,2,6.4,1|-C12,16,1.2",
  question: "M12 3c5.1 0 9.2 3.4 9.2 7.7s-4.1 7.7-9.2 7.7c-1 0-1.9-.1-2.8-.4L4.7 20.4l1.1-3.9C3.9 15.1 2.8 13 2.8 10.7 2.8 6.4 6.9 3 12 3z|-SM9.8 8.8a2.2 2.2 0 1 1 3.1 2c-.6.3-.9.8-.9 1.4v.3|-C12,14.9,1.05",
  clock: "C12,12,9.4|-SM12 6.8v5.4l3.4 2.1",
  people: "C9,8,3.4|M2.6 19.4c.4-3.6 3-5.9 6.4-5.9s6 2.3 6.4 5.9c.1.6-.4 1.1-1 1.1H3.6c-.6 0-1.1-.5-1-1.1z|~C16.7,8.6,2.8|~M16.4 13.4c2.8.2 4.7 2.1 5 5 .1.5-.3.9-.8.9h-3.5c-.2-2.3-1.1-4.3-2.6-5.7.6-.1 1.2-.2 1.9-.2z",
  phone: "M6.6 3.2c.5-.1 1 .2 1.2.6l1.8 3.9c.2.5.1 1-.3 1.4L7.6 10.6c1.3 2.6 3.2 4.5 5.8 5.8l1.5-1.7c.4-.4.9-.5 1.4-.3l3.9 1.8c.5.2.7.7.6 1.2l-.6 2.6c-.1.6-.6 1-1.2 1C10.4 21 3 13.6 3 5.4c0-.6.4-1.1 1-1.2z",
  chat: "M12 3.2c5.1 0 9.2 3.4 9.2 7.7s-4.1 7.7-9.2 7.7c-1 0-2-.1-2.9-.4L4.8 20.6l1.1-4C4 15.2 2.8 13.2 2.8 10.9 2.8 6.6 6.9 3.2 12 3.2z|-C8.2,10.9,1.25|-C12,10.9,1.25|-C15.8,10.9,1.25",
  camera: "M8.6 4.4h6.8l1.4 2.1H19a2.5 2.5 0 0 1 2.5 2.5v9a2.5 2.5 0 0 1-2.5 2.5H5A2.5 2.5 0 0 1 2.5 18V9A2.5 2.5 0 0 1 5 6.5h2.2z|-C12,13.2,4|C12,13.2,2.4",
  eye: "M12 5c5.6 0 9.3 5 9.9 6.4.1.4.1.8 0 1.2C21.3 14 17.6 19 12 19S2.7 14 2.1 12.6a1.5 1.5 0 0 1 0-1.2C2.7 10 6.4 5 12 5z|-C12,12,4.1|C12,12,2.3",
  wind: "SM3 9h11a3 3 0 1 0-3-3|SM3 15h15a3 3 0 1 1-3 3|SM3 12h7",
  trend: "SM3.4 16.6l5.2-5.2 3.6 3.6 7.6-7.6|SM14.6 7.4h5.2v5.2",
  sparkle: "M11 2.6c.5 4.7 3 7.2 7.6 7.7-4.6.5-7.1 3-7.6 7.7-.5-4.7-3-7.2-7.6-7.7 4.6-.5 7.1-3 7.6-7.7z|~M18.4 14.6c.2 1.9 1.2 2.9 3 3.1-1.8.2-2.8 1.2-3 3.1-.2-1.9-1.2-2.9-3-3.1 1.8-.2 2.8-1.2 3-3.1z",
  checklist: "R3.4,3.4,17.2,17.2,4.2|-SM7.8 12.3l2.9 2.9 5.6-6",
  book: "M2.8 5.3c2.8-.7 5.8-.2 8.3 1.5v13.3c-2.5-1.5-5.5-2-8.3-1.3zM21.2 5.3c-2.8-.7-5.8-.2-8.3 1.5v13.3c2.5-1.5 5.5-2 8.3-1.3z",
  calendar: "M6 4.6h1V3.2h2.2v1.4h5.6V3.2H17v1.4h1A2.5 2.5 0 0 1 20.5 7.1v11.4A2.5 2.5 0 0 1 18 21H6a2.5 2.5 0 0 1-2.5-2.5V7.1A2.5 2.5 0 0 1 6 4.6z|-SM8.2 14.1l2.6 2.6 5-5.2|-R3.5,8.4,17,1.3,0",
  plus: "C12,12,10|-R11,6.6,2,10.8,1|-R6.6,11,10.8,2,1",
  pin: "C12,12,10|-M9.6 5.2h4.8l-.5 4.4 2.3 2.3v1.4H7.8v-1.4l2.3-2.3z|-M11.3 13.6h1.4l-.3 5h-.8z",
  person: "C12,8,4|M4.4 20c.6-4.2 3.6-6.8 7.6-6.8s7 2.6 7.6 6.8c.1.6-.4 1.1-1 1.1H5.4c-.6 0-1.1-.5-1-1.1z",
  bell: "M12 2.8c3.3 0 5.6 2.6 5.6 5.9v3.7l1.8 3.1c.4.7-.1 1.5-.9 1.5H5.5c-.8 0-1.3-.8-.9-1.5l1.8-3.1V8.7c0-3.3 2.3-5.9 5.6-5.9z|M9.6 18.4h4.8a2.4 2.4 0 0 1-4.8 0z",
  gear: "M10.4 2.6h3.2l.5 2.4 1.7.7 2-1.4 2.3 2.3-1.4 2 .7 1.7 2.4.5v3.2l-2.4.5-.7 1.7 1.4 2-2.3 2.3-2-1.4-1.7.7-.5 2.4h-3.2l-.5-2.4-1.7-.7-2 1.4-2.3-2.3 1.4-2-.7-1.7-2.4-.5v-3.2l2.4-.5.7-1.7-1.4-2 2.3-2.3 2 1.4 1.7-.7z|-C12,12,3.2",
  download: "R3.4,3.4,17.2,17.2,4.2|-SM12 7v8M8.6 11.8L12 15.2l3.4-3.4",
  upload: "R3.4,3.4,17.2,17.2,4.2|-SM12 16.6V8.6M8.6 11.8L12 8.4l3.4 3.4",
  lock: "R4.6,10.2,14.8,11,2.6|SM8 10.2V7.6a4 4 0 0 1 8 0v2.6",
  info: "C12,12,9.4|-R11,10.6,2,6.6,1|-C12,7.8,1.2",
  alert: "M10.3 3.9c.8-1.3 2.6-1.3 3.4 0l7.6 13.2c.8 1.3-.2 3-1.7 3H4.4c-1.5 0-2.5-1.7-1.7-3z|-R11,8.4,2,6.6,1|-C12,17,1.15",
};

export function Glyph({ name, size = 24, className }: { name: string; size?: number; className?: string }) {
  const id = useId().replace(/:/g, "");
  const spec = G[name] || G.notes;
  const parts = spec.split("|");
  const cut = parts.filter((p) => p.startsWith("-")).map((p) => p.slice(1));
  const shown = parts.filter((p) => !p.startsWith("-"));
  const draw = (raw: string, key: number, maskMode = false) => {
    const half = raw.startsWith("~");
    const p = half ? raw.slice(1) : raw;
    const fill = maskMode ? "#000" : "currentColor";
    const op = half && !maskMode ? 0.5 : undefined;
    if (p.startsWith("C") || p.startsWith("O")) {
      const [cx, cy, r] = p.slice(1).split(",").map(Number);
      return p.startsWith("O") ? <circle key={key} cx={cx} cy={cy} r={r} fill="none" stroke={fill} strokeWidth={2.4} opacity={op} /> : <circle key={key} cx={cx} cy={cy} r={r} fill={fill} opacity={op} />;
    }
    if (p.startsWith("E")) {
      const [cx, cy, rx, ry, deg] = p.slice(1).split(",").map(Number);
      return <ellipse key={key} cx={cx} cy={cy} rx={rx} ry={ry} transform={deg ? `rotate(${deg} ${cx} ${cy})` : undefined} fill={fill} opacity={op} />;
    }
    if (p.startsWith("R")) {
      const [x, y, w, h, r] = p.slice(1).split(",").map(Number);
      return <rect key={key} x={x} y={y} width={w} height={h} rx={r} fill={fill} opacity={op} />;
    }
    if (p.startsWith("T")) {
      const [x, y, s, ...text] = p.slice(1).split(",");
      return (
        <text key={key} x={Number(x)} y={Number(y)} fontSize={Number(s)} fontWeight={700} textAnchor="middle" fill={fill} opacity={op} fontFamily="-apple-system, system-ui, sans-serif">
          {text.join(",")}
        </text>
      );
    }
    if (p.startsWith("S")) return <path key={key} d={p.slice(1)} fill="none" stroke={fill} strokeWidth={maskMode ? 2.2 : 2.3} strokeLinecap="round" strokeLinejoin="round" opacity={op} />;
    return <path key={key} d={p} fill={fill} fillRule="evenodd" opacity={op} />;
  };
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {cut.length ? (
        <defs>
          <mask id={`g${id}`} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
            <rect x="0" y="0" width="24" height="24" fill="#fff" />
            {cut.map((p, i) => draw(p, i, true))}
          </mask>
        </defs>
      ) : null}
      <g mask={cut.length ? `url(#g${id})` : undefined}>{shown.map((p, i) => draw(p, i))}</g>
    </svg>
  );
}

export const GLYPHS = Object.keys(G);
