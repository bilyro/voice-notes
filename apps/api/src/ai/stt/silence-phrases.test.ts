import { describe, expect, it } from "vitest";
import type { Segment } from "@vn/shared";
import { onlySilencePhrases } from "./silence-phrases.js";

const seg = (...texts: string[]): Segment[] => texts.map((text, i) => ({ startMs: i * 5000, endMs: i * 5000 + 4000, speaker: null, text }));

describe("onlySilencePhrases", () => {
  it("catches what Whisper invents for silence, in any case and punctuation", () => {
    expect(onlySilencePhrases(seg("Thank you."))).toBe(true);
    expect(onlySilencePhrases(seg("Thanks for watching!", " ", "THANK YOU"))).toBe(true);
    expect(onlySilencePhrases(seg("Дякую."))).toBe(true);
    expect(onlySilencePhrases(seg("¡Gracias por ver!"))).toBe(true);
    expect(onlySilencePhrases([])).toBe(true);
  });

  it("treats a transcript that only repeats the spelling hint as silence (Task 1.37)", () => {
    const hint = "Yarema Tkachuk, Ksenia Vovchuk, Lysenko hall";
    expect(onlySilencePhrases(seg("Yarema Tkachuk, Ksenia Vovchuk, Lysenko hall."), hint)).toBe(true);
    expect(onlySilencePhrases(seg("Ksenia Vovchuk"), hint)).toBe(true);
    expect(onlySilencePhrases(seg("Yarema Tkachuk will meet Ksenia on Monday."), hint)).toBe(false);
    expect(onlySilencePhrases(seg("Yarema Tkachuk"), "")).toBe(false);
  });

  it("keeps anything that was really said", () => {
    expect(onlySilencePhrases(seg("Thank you for coming, let's start with the budget."))).toBe(false);
    expect(onlySilencePhrases(seg("Thank you.", "Dana will book the gym by Friday."))).toBe(false);
    expect(onlySilencePhrases(seg("Дякую, Олено, за звіт."))).toBe(false);
    expect(onlySilencePhrases(seg("Gracias a todos por venir."))).toBe(false);
  });
});
