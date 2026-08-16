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
