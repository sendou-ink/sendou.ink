import type { LoaderFunctionArgs } from "react-router";
import * as v from "valibot";
import { refine } from "~/db/entity-query";
import * as XRankPlacementRepository from "~/features/top-search/XRankPlacementRepository.server";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import type { SerializeFrom } from "~/utils/remix";
import { parseParams } from "~/utils/remix.server";
import { id } from "~/utils/schema";
import * as XpTrophy from "../core/XpTrophy";
import * as TrophyRepository from "../TrophyRepository.server";

export type TrophyPlacementsLoaderData = SerializeFrom<typeof loader>;

const paramsSchema = v.object({ id, userId: id });

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { id: trophyId, userId } = parseParams({
		params,
		schema: paramsSchema,
	});

	const xpVariant = XpTrophy.parseCode(
		(await TrophyRepository.findById(trophyId))?.code,
	);
	if (!xpVariant) {
		throw new Response(null, { status: 404 });
	}

	return {
		placements: await claimedPlacementsWithWeapons(
			userId,
			XpTrophy.categoryWeaponIds(xpVariant.category),
		).execute(),
	};
};

function claimedPlacementsWithWeapons(
	userId: number,
	weaponIds: readonly MainWeaponId[],
) {
	return XRankPlacementRepository.placements()
		.claimedBy(userId)
		.with(
			refine("XRankPlacement", (qb) =>
				qb.where("XRankPlacement.weaponSplId", "in", [...weaponIds]),
			),
		)
		.highestPowerFirst();
}
