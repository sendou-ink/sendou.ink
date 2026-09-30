import type { LoaderFunctionArgs } from "react-router";
import { mainWeaponParams } from "~/features/build-analyzer/core/utils";
import { getFixedTForLanguage } from "~/modules/i18n/i18next.server";
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
import * as WeaponParams from "../core/WeaponParams";
import specialWeaponParamsData from "../data/all-version-special-params.json";
import subWeaponParamsData from "../data/all-version-sub-params.json";
import weaponParamsData from "../data/all-version-weapon-params.json";
import damageRateHistoryData from "../data/damage-rate-history.json";
import type {
	DamageMultiplierWithHistory,
	IncomingDamageMultiplierWithHistory,
	SpecialPointWithHistory,
	WeaponParamKind,
} from "../weapon-params-types";

const mainParamsData = weaponParamsData as WeaponParams.AllVersionParams;
const subParamsData = subWeaponParamsData as WeaponParams.AllVersionParams;
const specialParamsData =
	specialWeaponParamsData as WeaponParams.AllVersionParams;

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const t = await getFixedTForLanguage("en", ["weapons"]);

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
		typeof WeaponParams.damageMultipliersForWeapon
	>[0];

	const result: Record<string, DamageMultiplierWithHistory[]> = {};
	for (const id of weaponIds) {
		const multipliers = WeaponParams.damageMultipliersForWeapon(rows, id, kind);
		if (multipliers.length > 0) {
			result[String(id)] = multipliers;
		}
	}

	return result;
}

function incomingDamageMultipliersByWeapon(
	weaponIds: number[],
	kind: "sub" | "special",
): Record<string, IncomingDamageMultiplierWithHistory[]> {
	const rows = damageRateHistoryData.rows as Parameters<
		typeof WeaponParams.incomingDamageMultipliersForWeapon
	>[0];

	const result: Record<string, IncomingDamageMultiplierWithHistory[]> = {};
	for (const id of weaponIds) {
		const multipliers = WeaponParams.incomingDamageMultipliersForWeapon(
			rows,
			id,
			kind,
		);
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
	const categoryWeaponIds = WeaponParams.categoryWeaponIds(weaponId);

	const kits = WeaponParams.kitSiblingIds(weaponId).map((id) => {
		const { subWeaponId, specialWeaponId } = mainWeaponParams(id);
		return { weaponId: id, subWeaponId, specialWeaponId };
	});

	const versions = mainParamsData.metadata.versions;

	const weaponParams = WeaponParams.parseMany(
		categoryWeaponIds,
		mainParamsData,
		weaponIdToBaseWeaponId,
	);

	const allSpecialPoints = mainParamsData.specialPoints;

	const specialPoints: Record<string, SpecialPointWithHistory[]> = {};
	for (const id of categoryWeaponIds) {
		specialPoints[String(id)] = WeaponParams.kitSiblingIds(id).map((kitId) => ({
			weaponId: kitId,
			current: mainWeaponParams(kitId).SpecialPoint,
			history: allSpecialPoints?.[String(kitId)]?.history ?? [],
		}));
	}

	const damageMultipliers = damageMultipliersByWeapon(
		categoryWeaponIds,
		"main",
	);

	const patchHistory = WeaponParams.patchHistory(
		weaponParams[String(weaponId)],
		versions,
		specialPoints[String(weaponId)] ?? [],
		damageMultipliers[String(weaponId)] ?? [],
	);

	const subParams = WeaponParams.parseMany(
		kits.map((kit) => kit.subWeaponId),
		subParamsData,
	);

	const specialParams = WeaponParams.parseMany(
		kits.map((kit) => kit.specialWeaponId),
		specialParamsData,
	);

	const specialPointsByKit: Record<string, SpecialPointWithHistory> = {};
	for (const { weaponId: kitId } of kits) {
		specialPointsByKit[String(kitId)] = {
			weaponId: kitId,
			current: mainWeaponParams(kitId).SpecialPoint,
			history: allSpecialPoints?.[String(kitId)]?.history ?? [],
		};
	}

	const kitPatchHistories = WeaponParams.kitPatchHistories({
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
		subIncomingDamageMultipliers: incomingDamageMultipliersByWeapon(
			kits.map((kit) => kit.subWeaponId),
			"sub",
		),
		specialParams,
		specialDamageMultipliers: damageMultipliersByWeapon(
			kits.map((kit) => kit.specialWeaponId),
			"special",
		),
		specialIncomingDamageMultipliers: incomingDamageMultipliersByWeapon(
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
	const versions = subParamsData.metadata.versions;

	const weaponParams = WeaponParams.parseMany(subWeaponIds, subParamsData);

	const damageMultipliers = damageMultipliersByWeapon([...subWeaponIds], "sub");

	const incomingDamageMultipliers = incomingDamageMultipliersByWeapon(
		[...subWeaponIds],
		"sub",
	);

	const patchHistory = WeaponParams.patchHistory(
		weaponParams[String(weaponId)],
		versions,
		[],
		damageMultipliers[String(weaponId)] ?? [],
		incomingDamageMultipliers[String(weaponId)] ?? [],
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
	const versions = specialParamsData.metadata.versions;

	const weaponParams = WeaponParams.parseMany(
		specialWeaponIds,
		specialParamsData,
	);

	const damageMultipliers = damageMultipliersByWeapon(
		[...specialWeaponIds],
		"special",
	);

	const incomingDamageMultipliers = incomingDamageMultipliersByWeapon(
		[...specialWeaponIds],
		"special",
	);

	const patchHistory = WeaponParams.patchHistory(
		weaponParams[String(weaponId)],
		versions,
		[],
		damageMultipliers[String(weaponId)] ?? [],
		incomingDamageMultipliers[String(weaponId)] ?? [],
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
