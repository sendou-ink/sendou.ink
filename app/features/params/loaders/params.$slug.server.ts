import type { LoaderFunctionArgs } from "react-router";
import { mainWeaponParams } from "~/features/build-analyzer/core/utils";
import { i18next } from "~/modules/i18n/i18next.server";
import type {
	MainWeaponId,
	SpecialWeaponId,
	SubWeaponId,
} from "~/modules/in-game-lists/types";
import {
	specialWeaponIds,
	subWeaponIds,
	weaponIdToBaseWeaponId,
	weaponIdToType,
} from "~/modules/in-game-lists/weapon-ids";
import {
	specialWeaponNameSlugToId,
	subWeaponNameSlugToId,
	weaponNameSlugToId,
} from "~/utils/unslugify.server";
import { mySlugify } from "~/utils/urls";
import {
	buildKitPatchHistories,
	buildWeaponPatchHistory,
	damageMultipliersForWeapon,
	getCategoryWeaponIds,
	getWeaponKitSiblingIds,
	parseWeaponParams,
} from "../core/weapon-params";
import specialWeaponParamsData from "../data/all-version-special-params.json";
import subWeaponParamsData from "../data/all-version-sub-params.json";
import weaponParamsData from "../data/all-version-weapon-params.json";
import damageRateHistoryData from "../data/damage-rate-history.json";
import type {
	DamageMultiplierWithHistory,
	ParsedWeaponParams,
	SpecialPointWithHistory,
	WeaponParamKind,
} from "../weapon-params-types";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
	const t = await i18next.getFixedT(request, ["weapons"], {
		lng: "en",
	});

	const mainWeaponId = weaponNameSlugToId(params.slug);
	if (typeof mainWeaponId === "number") {
		if (weaponIdToType(mainWeaponId) === "ALT_SKIN") {
			throw new Response(null, { status: 404 });
		}
		return mainWeaponData(
			mainWeaponId,
			t(`weapons:MAIN_${mainWeaponId}`),
			mySlugify(t(`weapons:MAIN_${mainWeaponId}`, { lng: "en" })),
		);
	}

	const subWeaponId = subWeaponNameSlugToId(params.slug);
	if (typeof subWeaponId === "number") {
		return subWeaponData(
			subWeaponId,
			t(`weapons:SUB_${subWeaponId}`),
			mySlugify(t(`weapons:SUB_${subWeaponId}`, { lng: "en" })),
		);
	}

	const specialWeaponId = specialWeaponNameSlugToId(params.slug);
	if (typeof specialWeaponId === "number") {
		return specialWeaponData(
			specialWeaponId,
			t(`weapons:SPECIAL_${specialWeaponId}`),
			mySlugify(t(`weapons:SPECIAL_${specialWeaponId}`, { lng: "en" })),
		);
	}

	throw new Response(null, { status: 404 });
};

function damageMultipliersByWeapon(
	weaponIds: number[],
	kind: WeaponParamKind,
): Record<string, DamageMultiplierWithHistory[]> {
	const rows = damageRateHistoryData.rows as Parameters<
		typeof damageMultipliersForWeapon
	>[0];

	const result: Record<string, DamageMultiplierWithHistory[]> = {};
	for (const id of weaponIds) {
		const multipliers = damageMultipliersForWeapon(rows, id, kind);
		if (multipliers.length > 0) {
			result[String(id)] = multipliers;
		}
	}

	return result;
}

function mainWeaponData(
	weaponId: MainWeaponId,
	weaponName: string,
	slug: string,
) {
	const categoryWeaponIds = getCategoryWeaponIds(weaponId);

	const kits = getWeaponKitSiblingIds(weaponId).map((id) => {
		const { subWeaponId, specialWeaponId } = mainWeaponParams(id);
		return { weaponId: id, subWeaponId, specialWeaponId };
	});

	const weaponParams: Record<string, ParsedWeaponParams> = {};
	for (const id of categoryWeaponIds) {
		const baseId = weaponIdToBaseWeaponId(id);
		const rawParams = (
			weaponParamsData.weapons as Record<
				string,
				Record<string, Record<string, unknown>>
			>
		)[String(baseId)];
		if (rawParams) {
			weaponParams[String(id)] = parseWeaponParams(
				id,
				rawParams,
				weaponParamsData.metadata.versions,
			);
		}
	}

	const allSpecialPoints = (
		weaponParamsData as {
			specialPoints?: Record<
				string,
				{ history: Array<{ version: string; value: number }> }
			>;
		}
	).specialPoints;

	const specialPoints: Record<string, SpecialPointWithHistory[]> = {};
	for (const id of categoryWeaponIds) {
		specialPoints[String(id)] = getWeaponKitSiblingIds(id).map((kitId) => ({
			weaponId: kitId,
			current: mainWeaponParams(kitId).SpecialPoint,
			history: allSpecialPoints?.[String(kitId)]?.history ?? [],
		}));
	}

	const damageMultipliers = damageMultipliersByWeapon(
		categoryWeaponIds,
		"main",
	);

	const versions = weaponParamsData.metadata.versions;
	const patchHistory = buildWeaponPatchHistory(
		weaponParams[String(weaponId)],
		versions,
		specialPoints[String(weaponId)] ?? [],
		damageMultipliers[String(weaponId)] ?? [],
	);

	const subParams: Record<string, ParsedWeaponParams> = {};
	for (const { subWeaponId } of kits) {
		if (subParams[String(subWeaponId)]) continue;
		const rawParams = (
			subWeaponParamsData.weapons as Record<
				string,
				Record<string, Record<string, unknown>>
			>
		)[String(subWeaponId)];
		if (rawParams) {
			subParams[String(subWeaponId)] = parseWeaponParams(
				subWeaponId,
				rawParams,
				subWeaponParamsData.metadata.versions,
			);
		}
	}

	const specialParams: Record<string, ParsedWeaponParams> = {};
	for (const { specialWeaponId } of kits) {
		if (specialParams[String(specialWeaponId)]) continue;
		const rawParams = (
			specialWeaponParamsData.weapons as Record<
				string,
				Record<string, Record<string, unknown>>
			>
		)[String(specialWeaponId)];
		if (rawParams) {
			specialParams[String(specialWeaponId)] = parseWeaponParams(
				specialWeaponId,
				rawParams,
				specialWeaponParamsData.metadata.versions,
			);
		}
	}

	const specialPointsByKit: Record<string, SpecialPointWithHistory> = {};
	for (const { weaponId: kitId } of kits) {
		specialPointsByKit[String(kitId)] = {
			weaponId: kitId,
			current: mainWeaponParams(kitId).SpecialPoint,
			history: allSpecialPoints?.[String(kitId)]?.history ?? [],
		};
	}

	const kitPatchHistories = buildKitPatchHistories({
		mainParsed: weaponParams[String(weaponId)],
		versions,
		kits,
		specialPointsByKit,
		mainDamageMultipliers: damageMultipliers[String(weaponId)] ?? [],
		subParams,
		subDamageMultipliers: damageMultipliersByWeapon(
			kits.map((kit) => kit.subWeaponId),
			"sub",
		),
		specialParams,
		specialDamageMultipliers: damageMultipliersByWeapon(
			kits.map((kit) => kit.specialWeaponId),
			"special",
		),
	});

	return {
		kind: "main" as WeaponParamKind,
		weaponId,
		weaponName,
		slug,
		categoryWeaponIds,
		kits,
		weaponParams,
		specialPoints,
		damageMultipliers,
		patchHistory,
		kitPatchHistories,
		versions,
	};
}

function subWeaponData(
	weaponId: SubWeaponId,
	weaponName: string,
	slug: string,
) {
	const versions = subWeaponParamsData.metadata.versions;

	const weaponParams: Record<string, ParsedWeaponParams> = {};
	for (const id of subWeaponIds) {
		const rawParams = (
			subWeaponParamsData.weapons as Record<
				string,
				Record<string, Record<string, unknown>>
			>
		)[String(id)];
		if (rawParams) {
			weaponParams[String(id)] = parseWeaponParams(id, rawParams, versions);
		}
	}

	const damageMultipliers = damageMultipliersByWeapon([...subWeaponIds], "sub");

	const patchHistory = buildWeaponPatchHistory(
		weaponParams[String(weaponId)],
		versions,
		[],
		damageMultipliers[String(weaponId)] ?? [],
	);

	return {
		kind: "sub" as WeaponParamKind,
		weaponId,
		weaponName,
		slug,
		categoryWeaponIds: [...subWeaponIds],
		kits: undefined,
		weaponParams,
		specialPoints: undefined,
		damageMultipliers,
		patchHistory,
		kitPatchHistories: undefined,
		versions,
	};
}

function specialWeaponData(
	weaponId: SpecialWeaponId,
	weaponName: string,
	slug: string,
) {
	const versions = specialWeaponParamsData.metadata.versions;

	const weaponParams: Record<string, ParsedWeaponParams> = {};
	for (const id of specialWeaponIds) {
		const rawParams = (
			specialWeaponParamsData.weapons as Record<
				string,
				Record<string, Record<string, unknown>>
			>
		)[String(id)];
		if (rawParams) {
			weaponParams[String(id)] = parseWeaponParams(id, rawParams, versions);
		}
	}

	const damageMultipliers = damageMultipliersByWeapon(
		[...specialWeaponIds],
		"special",
	);

	const patchHistory = buildWeaponPatchHistory(
		weaponParams[String(weaponId)],
		versions,
		[],
		damageMultipliers[String(weaponId)] ?? [],
	);

	return {
		kind: "special" as WeaponParamKind,
		weaponId,
		weaponName,
		slug,
		categoryWeaponIds: [...specialWeaponIds],
		kits: undefined,
		weaponParams,
		specialPoints: undefined,
		damageMultipliers,
		patchHistory,
		kitPatchHistories: undefined,
		versions,
	};
}
