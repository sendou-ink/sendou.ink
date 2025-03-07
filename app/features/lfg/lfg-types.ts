import { type LFGType, LFG_TYPES } from "~/db/tables";
import { languagesUnified } from "~/modules/i18n/config";
import type { MainWeaponId } from "~/modules/in-game-lists";
import { assertUnreachable } from "~/utils/types";
import { TIERS, type TierName } from "../mmr/mmr-constants";

export type LFGFilter =
	| WeaponFilter
	| TypeFilter
	| TimezoneFilter
	| LanguageFilter
	| PlusTierFilter
	| MaxTierFilter
	| MinTierFilter;

type WeaponFilter = {
	_tag: "Weapon";
	weaponSplIds: MainWeaponId[];
};

type TypeFilter = {
	_tag: "Type";
	type: LFGType;
};

type TimezoneFilter = {
	_tag: "Timezone";
	maxHourDifference: number;
};

type LanguageFilter = {
	_tag: "Language";
	language: string;
};

type PlusTierFilter = {
	_tag: "PlusTier";
	tier: number;
};

type MaxTierFilter = {
	_tag: "MaxTier";
	tier: TierName;
};

type MinTierFilter = {
	_tag: "MinTier";
	tier: TierName;
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

export function filterToSmallStr(filter: LFGFilter): string {
	switch (filter._tag) {
		case "Weapon": {
			const weapons = filter.weaponSplIds.map((wid) => `${wid}`).join(",");
			return `w.${weapons}`;
		}
		case "Type":
			return `t.${typeToNum.get(filter.type)}`;
		case "Timezone":
			return `tz.${filter.maxHourDifference}`;
		case "Language":
			return `l.${filter.language}`;
		case "PlusTier":
			return `pt.${filter.tier}`;
		case "MaxTier":
			return `mx.${tierToNum.get(filter.tier)}`;
		case "MinTier":
			return `mn.${tierToNum.get(filter.tier)}`;
		default:
			assertUnreachable(filter);
	}
}

export function smallStrToFilter(s: string): LFGFilter | null {
	const [tag, val] = s.split(".");
	if (!tag || !val) return null;

	switch (tag) {
		case "w": {
			const weaponIds = val
				.split(",")
				.map((x) => Number.parseInt(x) as MainWeaponId)
				.filter((x) => x !== null && x !== undefined);
			if (weaponIds.length === 0) return null;
			return {
				_tag: "Weapon",
				weaponSplIds: weaponIds,
			};
		}
		case "t": {
			const filterType = numToType.get(val);
			if (!filterType) return null;
			return {
				_tag: "Type",
				type: filterType,
			};
		}
		case "tz": {
			const n = Number.parseInt(val);
			if (Number.isNaN(n)) return null;
			return {
				_tag: "Timezone",
				maxHourDifference: n,
			};
		}
		case "l": {
			if (!languagesUnified.some((lang) => lang.code === val)) return null;
			return {
				_tag: "Language",
				language: val,
			};
		}
		case "pt": {
			const n = Number.parseInt(val);
			if (Number.isNaN(n)) return null;
			return {
				_tag: "PlusTier",
				tier: n,
			};
		}
		case "mx": {
			const tier = numToTier.get(val);
			if (!tier) return null;
			return {
				_tag: "MaxTier",
				tier: tier,
			};
		}
		case "mn": {
			const tier = numToTier.get(val);
			if (!tier) return null;
			return {
				_tag: "MinTier",
				tier: tier,
			};
		}
	}
	return null;
}
