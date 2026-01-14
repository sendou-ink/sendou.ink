import type { LoaderFunctionArgs } from "react-router";
import * as ArtRepository from "~/features/art/ArtRepository.server";
import { i18next } from "~/modules/i18n/i18next.server";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import {
	weaponIdToBaseWeaponId,
	weaponIdToType,
} from "~/modules/in-game-lists/weapon-ids";
import { weaponNameSlugToId } from "~/utils/unslugify.server";
import { mySlugify } from "~/utils/urls";
import { getCategoryWeaponIds, parseWeaponParams } from "../core/weapon-params";
import weaponParamsData from "../data/weapon-params.json";
import type { ParsedWeaponParams } from "../weapon-params-types";

const WEAPON_ART_LIMIT = 5;

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

	const categoryWeaponIds = getCategoryWeaponIds(weaponId as MainWeaponId);

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

	const artPieces = await ArtRepository.findShowcaseArtsByTagName(
		slug,
		WEAPON_ART_LIMIT,
	);

	return {
		weaponId,
		weaponName,
		slug,
		categoryWeaponIds,
		weaponParams,
		versions: weaponParamsData.metadata.versions,
		artPieces,
	};
};
