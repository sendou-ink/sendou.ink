import type { LoaderFunctionArgs } from "react-router";
import { mainWeaponParams } from "~/features/build-analyzer/core/utils";
import { i18next } from "~/modules/i18n/i18next.server";
import {
	weaponIdToBaseWeaponId,
	weaponIdToType,
} from "~/modules/in-game-lists/weapon-ids";
import { weaponNameSlugToId } from "~/utils/unslugify.server";
import { mySlugify } from "~/utils/urls";
import {
	getCategoryWeaponIds,
	getWeaponKitSiblingIds,
	parseWeaponParams,
} from "../core/weapon-params";
import weaponParamsData from "../data/all-version-weapon-params.json";
import type { ParsedWeaponParams } from "../weapon-params-types";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
	const t = await i18next.getFixedT(request, ["weapons"], {
		lng: "en",
	});
	const weaponId = weaponNameSlugToId(params.slug);

	if (typeof weaponId !== "number" || weaponIdToType(weaponId) === "ALT_SKIN") {
		throw new Response(null, { status: 404 });
	}

	const weaponName = t(`weapons:MAIN_${weaponId}`);
	const slug = mySlugify(t(`weapons:MAIN_${weaponId}`, { lng: "en" }));

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

	return {
		weaponId,
		weaponName,
		slug,
		categoryWeaponIds,
		kits,
		weaponParams,
		versions: weaponParamsData.metadata.versions,
	};
};
