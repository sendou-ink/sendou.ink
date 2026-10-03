import type { LoaderFunctionArgs } from "react-router";
import { notFoundIfNullish, parseParams } from "~/utils/remix.server";
import { idObject } from "~/utils/schema";
import * as XpTrophy from "../core/XpTrophy";
import * as TrophyRepository from "../TrophyRepository.server";

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { id } = parseParams({
		params,
		schema: idObject,
	});

	const trophy = notFoundIfNullish(await trophyDetails(id).executeTakeFirst());
	const tournaments = await TrophyRepository.findTournamentsByTrophyId(id);

	const xpVariant = XpTrophy.parseCode(trophy.code);

	return {
		trophy,
		tournaments,
		xpWeapons: xpVariant
			? await TrophyRepository.findXpWeaponCountsById({
					trophyId: id,
					weaponIds: XpTrophy.categoryWeaponIds(xpVariant.category),
					milestone: xpVariant.milestone,
				})
			: null,
	};
};

function trophyDetails(id: number) {
	return TrophyRepository.trophies()
		.where({ id })
		.withColumns(["code"])
		.withCreator()
		.withManager()
		.withOrganization()
		.withOwners();
}
