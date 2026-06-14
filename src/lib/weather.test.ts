import { describe, it, expect } from "vitest";
import { wmoDescription, wmoIconType } from "./weather";

describe("wmoDescription", () => {
  it("code 0 → 快晴", () => expect(wmoDescription(0)).toBe("快晴"));
  it("code 1 → 晴れ", () => expect(wmoDescription(1)).toBe("晴れ"));
  it("code 2 → 晴れ", () => expect(wmoDescription(2)).toBe("晴れ"));
  it("code 3 → 曇り", () => expect(wmoDescription(3)).toBe("曇り"));
  it("code 45 → 霧", () => expect(wmoDescription(45)).toBe("霧"));
  it("code 51 → 霧雨", () => expect(wmoDescription(51)).toBe("霧雨"));
  it("code 61 → 雨", () => expect(wmoDescription(61)).toBe("雨"));
  it("code 71 → 雪", () => expect(wmoDescription(71)).toBe("雪"));
  it("code 80 → にわか雨", () => expect(wmoDescription(80)).toBe("にわか雨"));
  it("code 95 → 雷雨", () => expect(wmoDescription(95)).toBe("雷雨"));
  it("code 99 → 雷雨", () => expect(wmoDescription(99)).toBe("雷雨"));
});

describe("wmoIconType", () => {
  it("code 0 → sunny", () => expect(wmoIconType(0)).toBe("sunny"));
  it("code 1 → partly-cloudy", () => expect(wmoIconType(1)).toBe("partly-cloudy"));
  it("code 2 → partly-cloudy", () => expect(wmoIconType(2)).toBe("partly-cloudy"));
  it("code 3 → cloudy", () => expect(wmoIconType(3)).toBe("cloudy"));
  it("code 45 → foggy", () => expect(wmoIconType(45)).toBe("foggy"));
  it("code 61 → rainy", () => expect(wmoIconType(61)).toBe("rainy"));
  it("code 71 → snowy", () => expect(wmoIconType(71)).toBe("snowy"));
  it("code 80 → rainy", () => expect(wmoIconType(80)).toBe("rainy"));
  it("code 95 → stormy", () => expect(wmoIconType(95)).toBe("stormy"));
});
