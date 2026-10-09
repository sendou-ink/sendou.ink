import type { LoaderFunctionArgs } from "react-router";
import * as v from "valibot";
import { requireUser } from "~/features/auth/core/user.server";
import type { SerializeFrom } from "~/utils/remix";
import {
	forbidden,
	notFoundIfNullish,
	parseParams,
} from "~/utils/remix.server";
import { id } from "~/utils/schema";
import * as TrophyBackfill from "../core/TrophyBackfill.server";
import * as TrophyRepository from "../TrophyRepository.server";
import { canBackfillTrophies } from "../trophies-utils";

export type TrophyBackfillLoaderData = SerializeFrom<typeof loader>;

export const loader = async ({ params }: LoaderFunctionArgs) => {
	if (!canBackfillTrophies(requireUser())) {
		forbidden();
	}

	const { id: trophyId, seriesId } = parseParams({
		params,
		schema: v.object({ id, seriesId: id }),
	});

	const trophy = notFoundIfNullish(await TrophyRepository.findById(trophyId));

	const tournaments = trophy.organizationId
		? await TrophyBackfill.backfillableTournaments({
				organizationId: trophy.organizationId,
				seriesId,
			})
		: null;

	return {
		trophyId,
		seriesId,
		tournaments: notFoundIfNullish(tournaments),
	};
};
