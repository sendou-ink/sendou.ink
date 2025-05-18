import { MAX_AP } from "~/constants";
import type { AbilityPoints } from "../analyzer-types";

export const SPECIAL_EFFECTS = [
	{
		type: "DR",
		values: [
			{
				type: "SSU",
				ap: 30,
			},
			{
				type: "RSU",
				ap: 30,
			},
			{
				type: "RES",
				ap: 30,
			},
		],
	},
	{
		type: "OG",
		values: [
			{
				type: "SSU",
				ap: 30,
			},
			{
				type: "RSU",
				ap: 30,
			},
			{
				type: "RES",
				ap: 30,
			},
			{
				type: "IA",
				ap: 30,
			},
		],
	},
	{
		type: "LDE",
		values: lastDitchEffortValues,
	},
	{
		type: "CB",
		values: [
			{
				type: "ISM",
				ap: 10,
			},
			{
				type: "ISS",
				ap: 10,
			},
			{
				type: "IRU",
				ap: 10,
			},
			{
				type: "RSU",
				ap: 10,
			},
			{
				type: "SSU",
				ap: 10,
			},
			{
				type: "SCU",
				ap: 10,
			},
		],
	},
	{
		type: "TACTICOOLER",
		values: [
			{
				type: "SSU",
				ap: 29,
				boostsBeyond: false,
			},
			{
				type: "RSU",
				ap: 29,
				boostsBeyond: false,
			},
			{
				type: "RES",
				ap: MAX_AP,
			},
			{
				type: "QR",
				ap: MAX_AP,
			},
			{
				type: "QSJ",
				ap: MAX_AP,
			},
			{
				type: "SS",
				ap: MAX_AP,
			},
			{
				type: "IA",
				ap: MAX_AP,
			},
		],
	},
] as const;

export function lastDitchEffortIntensityToAp(intensity: number) {
	return Math.floor((18 / 21) * intensity);
}

function lastDitchEffortValues(intensity: number) {
	const ap = lastDitchEffortIntensityToAp(intensity);

	return [
		{
			type: "ISM",
			ap,
		},
		{
			type: "ISS",
			ap,
		},
		{
			type: "IRU",
			ap,
		},
	] as const;
}

export function applySpecialEffects({
	abilityPoints,
	effects,
	ldeIntensity,
}: {
	abilityPoints: AbilityPoints;
	effects: Array<(typeof SPECIAL_EFFECTS)[number]["type"]>;
	ldeIntensity: number;
}): AbilityPoints {
	const result: AbilityPoints = new Map(abilityPoints);

	for (const effectObj of SPECIAL_EFFECTS) {
		if (!effects.includes(effectObj.type)) continue;

		const valuesArr = effectObjToValuesArr({ effectObj, ldeIntensity });

		for (const value of valuesArr) {
			const boostsBeyond = "boostsBeyond" in value ? value.boostsBeyond : true;
			const currentAP = result.get(value.type) ?? 0;
			const newAPUnlimited = boostsBeyond
				? currentAP + value.ap
				: Math.max(currentAP, value.ap);
			const newAP = Math.min(newAPUnlimited, MAX_AP);

			result.set(value.type, newAP);
		}
	}

	return result;
}

function effectObjToValuesArr({
	effectObj,
	ldeIntensity,
}: {
	effectObj: (typeof SPECIAL_EFFECTS)[number];
	ldeIntensity: number;
}) {
	if (typeof effectObj.values === "function") {
		return effectObj.values(ldeIntensity);
	}

	return effectObj.values;
}
