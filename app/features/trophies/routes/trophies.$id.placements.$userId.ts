import type { LoaderFunctionArgs } from "react-router";
import * as v from "valibot";
import * as XRankPlacementRepository from "~/features/top-search/XRankPlacementRepository.server";
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
		await TrophyRepository.findCodeById(trophyId),
	);
	if (!xpVariant) {
		throw new Response(null, { status: 404 });
	}

	const placements = await XRankPlacementRepository.findPlacementsByUserId(
		userId,
		{ weaponIds: XpTrophy.categoryWeaponIds(xpVariant.category) },
	);

	return { placements: placements ?? [] };
};
