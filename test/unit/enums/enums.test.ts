import { describe, it, expect } from "vitest";
import { TeamSide, HitGroup, WeaponType } from "../../../src/enums/index.js";

describe("enums barrel", () => {
  describe("TeamSide", () => {
    it("should map symbolic names to Valve's numeric team IDs", () => {
      expect(TeamSide.Unassigned).toBe(0);
      expect(TeamSide.Spectator).toBe(1);
      expect(TeamSide.T).toBe(2);
      expect(TeamSide.CT).toBe(3);
    });

    it("should expose the type alias for use in annotations", () => {
      const t: TeamSide = TeamSide.CT;
      expect(t).toBe(3);
    });
  });

  describe("HitGroup", () => {
    it("should map symbolic names to Valve's HITGROUP_* values", () => {
      expect(HitGroup.Generic).toBe(0);
      expect(HitGroup.Head).toBe(1);
      expect(HitGroup.Chest).toBe(2);
      expect(HitGroup.Stomach).toBe(3);
      expect(HitGroup.LeftArm).toBe(4);
      expect(HitGroup.RightArm).toBe(5);
      expect(HitGroup.LeftLeg).toBe(6);
      expect(HitGroup.RightLeg).toBe(7);
      expect(HitGroup.Gear).toBe(10);
    });

    it("should not contain the unused IDs 8 or 9", () => {
      const values = Object.values(HitGroup);
      expect(values).not.toContain(8);
      expect(values).not.toContain(9);
    });
  });

  describe("WeaponType", () => {
    it("should expose all required category members", () => {
      const required = [
        "Knife",
        "Pistol",
        "SMG",
        "Rifle",
        "Shotgun",
        "MachineGun",
        "Sniper",
        "Grenade",
        "C4",
        "Equipment",
      ] as const;
      for (const name of required) {
        expect(WeaponType).toHaveProperty(name);
        expect(typeof WeaponType[name]).toBe("number");
      }
    });
  });
});
