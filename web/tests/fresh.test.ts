import { describe, expect, it } from "vitest";
import { isFreshFor } from "../src/lib/fresh";

const since = Date.parse("2030-04-12T08:00:00Z");

describe("isFreshFor", () => {
  it("nimmt den Eingang am Server, wenn vorhanden", () => {
    // offline um 07:00 angelegt, um 09:00 nachgereicht
    expect(isFreshFor({ created_by: "b", created_at: "2030-04-12T07:00:00Z", inserted_at: "2030-04-12T09:00:00Z" }, "a", since)).toBe(true);
    expect(isFreshFor({ created_by: "b", created_at: "2030-04-12T09:00:00Z", inserted_at: "2030-04-12T07:30:00Z" }, "a", since)).toBe(false);
  });
  it("fällt auf created_at zurück", () => {
    expect(isFreshFor({ created_by: "b", created_at: "2030-04-12T08:30:00Z" }, "a", since)).toBe(true);
    expect(isFreshFor({ created_by: "b", created_at: "2030-04-12T07:30:00Z", inserted_at: null }, "a", since)).toBe(false);
  });
  it("zählt eigene, importierte und namenlose Zeilen nicht", () => {
    expect(isFreshFor({ created_by: "a", created_at: "2030-04-12T09:00:00Z" }, "a", since)).toBe(false);
    expect(isFreshFor({ created_by: "b", created_at: "2030-04-12T09:00:00Z", source: "import" }, "a", since)).toBe(false);
    expect(isFreshFor({ created_by: null, created_at: "2030-04-12T09:00:00Z" }, "a", since)).toBe(false);
  });
});
