import { type LoaderFunctionArgs, json } from "@remix-run/node";
import { cors } from "remix-utils/cors";
import { z } from "zod";
import * as QMatchRepository from "~/features/sendouq-match/QMatchRepository.server";
import i18next from "~/modules/i18n/i18next.server";
import invariant from "~/utils/invariant";
import { notFoundIfFalsy, parseParams } from "~/utils/remix.server";
import { id } from "~/utils/zod";
import {
	handleOptionsRequest,
	requireBearerAuth,
} from "../api-public-utils.server";
import type { GetSendouqMatchResponse, MapListMap } from "../schema";

const paramsSchema = z.object({
	matchId: id,
});

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
	await handleOptionsRequest(request);
	requireBearerAuth(request);

	const { matchId } = parseParams({
		params,
		schema: paramsSchema,
	});

	const match = notFoundIfFalsy(await QMatchRepository.findById(matchId));

	const [groupAlpha, groupBravo] = await Promise.all([
		QMatchRepository.findGroupById({
			groupId: match.alphaGroupId,
		}),
		QMatchRepository.findGroupById({
			groupId: match.bravoGroupId,
		}),
	]);

	invariant(groupAlpha, "Group alpha not found");
	invariant(groupBravo, "Group bravo not found");

	const t = await i18next.getFixedT("en", ["game-misc"]);

	const userIdToRank = (userId: number) => {
		const memento = match.memento;
		if (!memento) return null;

		const userMemento = memento.users[userId];

		return userMemento.skill && userMemento.skill !== "CALCULATING"
			? userMemento.skill.tier
			: null;
	};

	const score = match.mapList.reduce(
		(acc, cur) => {
			if (!cur.winnerGroupId) return acc;

			if (cur.winnerGroupId === match.alphaGroupId) {
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
			points: null,
		})),
		teamAlpha: {
			score: score[0],
			players: groupAlpha.members.map((member) => ({
				userId: member.id,
				rank: userIdToRank(member.id),
			})),
		},
		teamBravo: {
			score: score[1],
			players: groupBravo.members.map((member) => ({
				userId: member.id,
				rank: userIdToRank(member.id),
			})),
		},
	};

	return await cors(request, json(result));
};
