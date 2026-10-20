import { describe, expect, it } from "vitest";
import { amountOf } from "../src/lib/dose";

describe("amountOf", () => {
  it("liest Stückzahlen und Brüche", () => {
    expect(amountOf("1 Hub", "Hübe")).toBe(1);
    expect(amountOf("2 Hübe", "Hübe")).toBe(2);
    expect(amountOf("½ Tablette", "Tabletten")).toBe(0.5);
    expect(amountOf("1¼", "Tabletten")).toBe(1.25);
    expect(amountOf("¾ Beutel", "Beutel")).toBe(0.75);
    expect(amountOf("1,5 ml", "ml")).toBe(1.5);
  });
  it("ignoriert Wirkstoffmengen und Text ohne Zahl", () => {
    expect(amountOf("20 mg", "Tabletten")).toBeNull();
    expect(amountOf("25/125 µg", "Hübe")).toBeNull();
    expect(amountOf("nach Bedarf", "Tabletten")).toBeNull();
    expect(amountOf("", "Hübe")).toBeNull();
  });
});
