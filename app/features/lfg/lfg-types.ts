import { LFG_TYPES, type LFGType } from "~/db/tables";
import { languagesUnified } from "~/modules/i18n/config";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { TIERS, type TierName } from "../mmr/mmr-constants";

export type LFGFiltersState = {
	weapon: MainWeaponId[];
	type: LFGType | null;
	timezone: number | null;
	language: string | null;
	plusTier: number | null;
	minTier: TierName | null;
	maxTier: TierName | null;
};

export const DEFAULT_LFG_FILTERS: LFGFiltersState = {
	weapon: [],
	type: null,
	timezone: null,
	language: null,
	plusTier: null,
	minTier: null,
	maxTier: null,
};

const typeToNum = new Map(LFG_TYPES.map((tier, index) => [tier, `${index}`]));

const numToType = new Map(
	Array.from(typeToNum).map(([type, num]) => [`${num}`, type]),
);

const tierToNum = new Map(
	TIERS.map((tier, index) => {
		return [tier.name, `${index}`];
	}),
);

const numToTier = new Map(
	Array.from(tierToNum).map(([tier, num]) => [`${num}`, tier]),
);

export function encodeFiltersState(filters: LFGFiltersState): string {
	const parts: string[] = [];

	if (filters.weapon.length > 0) {
		parts.push(`w.${filters.weapon.join(",")}`);
	}
	if (filters.type !== null) {
		parts.push(`t.${typeToNum.get(filters.type)}`);
	}
	if (filters.timezone !== null) {
		parts.push(`tz.${filters.timezone}`);
	}
	if (filters.language !== null) {
		parts.push(`l.${filters.language}`);
	}
	if (filters.plusTier !== null) {
		parts.push(`pt.${filters.plusTier}`);
	}
	if (filters.minTier !== null) {
		parts.push(`mn.${tierToNum.get(filters.minTier)}`);
	}
	if (filters.maxTier !== null) {
		parts.push(`mx.${tierToNum.get(filters.maxTier)}`);
	}

	return parts.join("-");
}

export function countActiveFilters(filters: LFGFiltersState): number {
	let count = 0;
	if (filters.weapon.length > 0) count++;
	if (filters.type !== null) count++;
	if (filters.timezone !== null) count++;
	if (filters.language !== null) count++;
	if (filters.plusTier !== null) count++;
	if (filters.minTier !== null) count++;
	if (filters.maxTier !== null) count++;
	return count;
}

export function decodeFiltersState(queryString: string): LFGFiltersState {
	const result: LFGFiltersState = { ...DEFAULT_LFG_FILTERS };

	if (queryString === "") {
		return result;
	}

	for (const part of queryString.split("-")) {
		const [tag, val] = part.split(".");
		if (!tag || !val) continue;

		switch (tag) {
			case "w": {
				const weaponIds = val
					.split(",")
					.map((x) => Number.parseInt(x, 10) as MainWeaponId)
					.filter((x) => !Number.isNaN(x));
				if (weaponIds.length > 0) {
					result.weapon = weaponIds;
				}
				break;
			}
			case "t": {
				const filterType = numToType.get(val);
				if (filterType) {
					result.type = filterType;
				}
				break;
			}
			case "tz": {
				const n = Number.parseInt(val, 10);
				if (!Number.isNaN(n)) {
					result.timezone = n;
				}
				break;
			}
			case "l": {
				if (languagesUnified.some((lang) => lang.code === val)) {
					result.language = val;
				}
				break;
			}
			case "pt": {
				const n = Number.parseInt(val, 10);
				if (!Number.isNaN(n)) {
					result.plusTier = n;
				}
				break;
			}
			case "mx": {
				const tier = numToTier.get(val);
				if (tier) {
					result.maxTier = tier;
				}
				break;
			}
			case "mn": {
				const tier = numToTier.get(val);
				if (tier) {
					result.minTier = tier;
				}
				break;
			}
		}
	}

	return result;
}
