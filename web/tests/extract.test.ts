import { describe, expect, it } from "vitest";
import { fieldsToData } from "@shared/extractSchemas.ts";

describe("fieldsToData", () => {
  it("wandelt Paare in das Datenobjekt", () => {
    expect(
      fieldsToData([
        { k: "ml", v: "20" },
        { k: "art", v: "Wasser" },
        { k: "weg", v: "spritze" },
      ]),
    ).toEqual({ ml: 20, art: "Wasser", weg: "spritze" });
  });
  it("liest Komma-Zahlen, Listen und behält unklare Angaben im Text", () => {
    const d = fieldsToData([
      { k: "kg", v: "17,8" },
      { k: "auff", v: "Schleim, frisches Blut" },
      { k: "bpm", v: "ca. 44" },
      { k: "text", v: "nach dem Gassi" },
      { k: "unbekannt", v: "x" },
    ]);
    expect(d).toEqual({ kg: 17.8, auff: ["Schleim", "frisches Blut"], bpm: 44, text: "nach dem Gassi · bpm: ca. 44" });
  });
  it("verträgt fehlende oder kaputte Eingaben", () => {
    expect(fieldsToData(undefined)).toEqual({});
    expect(fieldsToData([{ k: "ml", v: "" }, null, { k: "ml" }])).toEqual({});
  });
});
