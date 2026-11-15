import { describe, it, expect } from "vitest";
import { weaponNameForItemDefIndex } from "../../../src/enums/ItemDefinition.js";

describe("weaponNameForItemDefIndex", () => {
  it("names weapons the way game events do", () => {
    expect(weaponNameForItemDefIndex(7)).toBe("ak47");
    expect(weaponNameForItemDefIndex(9)).toBe("awp");
    expect(weaponNameForItemDefIndex(49)).toBe("c4");
  });

  it("separates weapons that share a ServerClass", () => {
    expect(weaponNameForItemDefIndex(16)).toBe("m4a1");
    expect(weaponNameForItemDefIndex(60)).toBe("m4a1_silencer");
    expect(weaponNameForItemDefIndex(32)).toBe("hkp2000");
    expect(weaponNameForItemDefIndex(61)).toBe("usp_silencer");
  });

  it("maps every knife finish to 'knife'", () => {
    expect(weaponNameForItemDefIndex(42)).toBe("knife");
    expect(weaponNameForItemDefIndex(507)).toBe("knife");
    expect(weaponNameForItemDefIndex(525)).toBe("knife");
  });

  it("returns undefined for 0 and unknown indices", () => {
    expect(weaponNameForItemDefIndex(0)).toBeUndefined();
    expect(weaponNameForItemDefIndex(9999)).toBeUndefined();
  });
});
