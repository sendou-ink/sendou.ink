import type { LoaderFunctionArgs } from "react-router";
import * as v from "valibot";
import * as SendouQMatch from "~/features/sendouq-match/core/SendouQMatch";
import * as SQMatchRepository from "~/features/sendouq-match/SQMatchRepository.server";
import { getFixedTForLanguage } from "~/modules/i18n/i18next.server";
import { notFoundIfNullish, parseParams } from "~/utils/remix.server";
import { id } from "~/utils/schema";
import type { GetSendouqMatchResponse, MapListMap } from "../schema";

const paramsSchema = v.object({
	matchId: id,
});

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { matchId } = parseParams({
		params,
		schema: paramsSchema,
	});

	const match = notFoundIfNullish(await SQMatchRepository.findById(matchId));

	const t = await getFixedTForLanguage("en", ["game-misc"]);

	const userIdToRank = (member: (typeof match.groupAlpha.members)[number]) => {
		const tier = SendouQMatch.memberTier(member);

		return tier && tier !== "CALCULATING" ? tier : null;
	};

	const score = match.mapList.reduce(
		(acc, cur) => {
			if (!cur.winnerGroupId) return acc;

			if (cur.winnerGroupId === match.groupAlpha.id) {
				return [acc[0] + 1, acc[1]];
			}

			return [acc[0], acc[1] + 1];
		},
		[0, 0],
	);

	const result: GetSendouqMatchResponse = {
		mapList: match.mapList.map((map) => ({
			map: {
				mode: map.mode,
				stage: {
					id: map.stageId,
					name: t(`game-misc:STAGE_${map.stageId}`),
				},
			},
			winnerTeamId: map.winnerGroupId,
			source: Number.isNaN(Number(map.source))
				? (map.source as MapListMap["source"])
				: Number(map.source),
			participatedUserIds: null,
			ko: null,
		})),
		teamAlpha: {
			id: match.groupAlpha.id,
			score: score[0],
			players: match.groupAlpha.members.map((member) => ({
				userId: member.id,
				rank: userIdToRank(member),
			})),
		},
		teamBravo: {
			id: match.groupBravo.id,
			score: score[1],
			players: match.groupBravo.members.map((member) => ({
				userId: member.id,
				rank: userIdToRank(member),
			})),
		},
	};

	return Response.json(result);
};
