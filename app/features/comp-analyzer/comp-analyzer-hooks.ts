import { MAX_AP } from "~/features/build-analyzer/analyzer-constants";
import { useSearchParamStateEncoder } from "~/hooks/useSearchParamState";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { mainWeaponIds } from "~/modules/in-game-lists/weapon-ids";
import { MAX_WEAPONS } from "./comp-analyzer-constants";
import type { CategorizationType } from "./comp-analyzer-types";

const CATEGORIZATION_TYPES: CategorizationType[] = [
	"category",
	"sub",
	"special",
];

export function useCategorization() {
	return useSearchParamStateEncoder<CategorizationType>({
		defaultValue: "category",
		name: "categorization",
		revive: (value) => {
			if (CATEGORIZATION_TYPES.includes(value as CategorizationType)) {
				return value as CategorizationType;
			}
			return "category";
		},
		encode: (val) => val,
	});
}

export function useSelectedWeapons() {
	return useSearchParamStateEncoder<MainWeaponId[]>({
		defaultValue: [],
		name: "weapons",
		revive: (value) => {
			const ids = value
				.split(",")
				.map(Number)
				.filter((id): id is MainWeaponId =>
					mainWeaponIds.includes(id as MainWeaponId),
				);

			return ids.slice(0, MAX_WEAPONS);
		},
		encode: (val) => val.join(","),
	});
}

export function useTargetSubDefenseAp() {
	return useSearchParamStateEncoder<number>({
		defaultValue: 0,
		name: "subDef",
		revive: (value) => {
			const num = Number(value);
			if (Number.isNaN(num) || num < 0 || num > MAX_AP) {
				return 0;
			}
			return num;
		},
		encode: (val) => String(val),
	});
}

export function useTargetResAp() {
	return useSearchParamStateEncoder<number>({
		defaultValue: 0,
		name: "res",
		revive: (value) => {
			const num = Number(value);
			if (Number.isNaN(num) || num < 0 || num > MAX_AP) {
				return 0;
			}
			return num;
		},
		encode: (val) => String(val),
	});
}
