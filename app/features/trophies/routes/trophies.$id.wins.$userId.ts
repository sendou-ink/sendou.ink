import type { LoaderFunctionArgs } from "react-router";
import * as R from "remeda";
import { z } from "zod";
import * as UserCardRepository from "~/features/user-card/UserCardRepository.server";
import type { SerializeFrom } from "~/utils/remix";
import { parseParams } from "~/utils/remix.server";
import { id } from "~/utils/zod";
import * as TrophyRepository from "../TrophyRepository.server";

export type TrophyWinsLoaderData = SerializeFrom<typeof loader>;

const paramsSchema = z.object({ id, userId: id });

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { id: trophyId, userId } = parseParams({
		params,
		schema: paramsSchema,
	});

	const wins = await TrophyRepository.findWinsByOwner({ trophyId, userId });

	const { userCards } = await UserCardRepository.userCards({
		userIds: R.unique(wins.flatMap((win) => win.members.map((m) => m.id))),
	});

	return { wins, userCards };
};
