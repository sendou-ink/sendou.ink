import { describe, expect, test } from "vitest";
import { applySpecialEffects } from "./specialEffects";

describe("applySpecialEffects()", () => {
	test("Adds an effect to empty build", () => {
		const aps = applySpecialEffects({
			effects: ["CB"],
			abilityPoints: new Map(),
			ldeIntensity: 0,
		});

		expect(aps.size).toBe(6);
		expect(aps.get("ISM")).toBe(10);
	});

	test("Adds an effect to build while keeping existing abilities untouched", () => {
		const aps = applySpecialEffects({
			effects: ["CB"],
			abilityPoints: new Map([["SPU", 10]]),
			ldeIntensity: 0,
		});

		expect(aps.size).toBe(7);
		expect(aps.get("SPU")).toBe(10);
	});

	test("Does not boost ability beyond 57", () => {
		const aps = applySpecialEffects({
			effects: ["CB"],
			abilityPoints: new Map([["ISM", 57]]),
			ldeIntensity: 0,
		});

		expect(aps.get("ISM")).toBe(57);
	});

	test("Tacticooler doesn't boost swim speed beyond 29", () => {
		const aps = applySpecialEffects({
			effects: ["TACTICOOLER"],
			abilityPoints: new Map([["SSU", 28]]),
			ldeIntensity: 0,
		});

		expect(aps.get("SSU")).toBe(29);
	});

	test("Tacticooler limit swim speed at 29 if more in build", () => {
		const aps = applySpecialEffects({
			effects: ["TACTICOOLER"],
			abilityPoints: new Map([["SSU", 30]]),
			ldeIntensity: 0,
		});

		expect(aps.get("SSU")).toBe(30);
	});

	test("Applies many effects", () => {
		const aps = applySpecialEffects({
			effects: ["DR", "CB"],
			abilityPoints: new Map([["SSU", 1]]),
			ldeIntensity: 0,
		});

		expect(aps.get("SSU")).toBe(41);
	});

	test("Applies LDE", () => {
		const aps = applySpecialEffects({
			effects: ["LDE"],
			abilityPoints: new Map([["ISM", 1]]),
			ldeIntensity: 1,
		});

		expect(aps.get("ISM")).toBe(1);
	});

	test("Applies LDE (intensity != aps given)", () => {
		const aps = applySpecialEffects({
			effects: ["LDE"],
			abilityPoints: new Map([["ISM", 1]]),
			ldeIntensity: 15,
		});

		expect(aps.get("ISM")).toBe(13);
	});
});
