import type { RangeVariantKey } from "~/features/build-analyzer/analyzer-types";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { useSearchParam } from "~/modules/search-params/hooks";
import { compAnalyzerSearchParams } from "./comp-analyzer-search-params";

export function useCategorization() {
	return useSearchParam(compAnalyzerSearchParams, "categorization");
}

export function useSelectedWeapons() {
	return useSearchParam(compAnalyzerSearchParams, "weapons");
}

export function useSingleWeaponCombos() {
	return useSearchParam(compAnalyzerSearchParams, "singleCombos");
}

export function useTargetSubDefenseAp() {
	return useSearchParam(compAnalyzerSearchParams, "subDef");
}

export function useTargetResAp() {
	return useSearchParam(compAnalyzerSearchParams, "res");
}

/** Ways of shooting turned on in the range chart, per weapon */
export function useRangeVariants() {
	const [entries, setEntries] = useSearchParam(
		compAnalyzerSearchParams,
		"rangeVariants",
	);

	const enabledVariantKeys = (weaponId: MainWeaponId) =>
		entries.flatMap((entry) => {
			const [entryWeaponId, key] = entry.split("-");
			return Number(entryWeaponId) === weaponId ? [key as RangeVariantKey] : [];
		});

	const setEnabledVariantKeys = (
		weaponId: MainWeaponId,
		keys: RangeVariantKey[],
	) => {
		setEntries([
			...entries.filter((entry) => !entry.startsWith(`${weaponId}-`)),
			...keys.map((key) => `${weaponId}-${key}`),
		]);
	};

	return { enabledVariantKeys, setEnabledVariantKeys };
}

/** Weapons left out of the range chart */
export function useHiddenRanges() {
	const [hiddenWeaponIds, setHiddenWeaponIds] = useSearchParam(
		compAnalyzerSearchParams,
		"hiddenRanges",
	);

	const [selectedWeaponIds] = useSelectedWeapons();

	const toggleHidden = (weaponId: MainWeaponId) => {
		const stillSelected = hiddenWeaponIds.filter(
			(id) => id !== weaponId && selectedWeaponIds.includes(id),
		);
		setHiddenWeaponIds(
			hiddenWeaponIds.includes(weaponId)
				? stillSelected
				: [...stillSelected, weaponId],
		);
	};

	return { hiddenWeaponIds, toggleHidden };
}

export function useSpecialRanges() {
	return useSearchParam(compAnalyzerSearchParams, "specialRanges");
}
