import type { LoaderFunctionArgs } from "react-router";
import * as BroadcastRepository from "~/features/broadcast/BroadcastRepository.server";
import { broadcastParamsSchema } from "~/features/broadcast/broadcast-schemas";
import { requireBroadcastProducer } from "~/features/broadcast/broadcast-utils.server";
import * as BroadcastHub from "~/features/broadcast/core/BroadcastHub.server";
import * as RouteChatRooms from "~/features/chat/RouteChatRooms.server";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import { tournamentFromParams } from "~/features/tournament-bracket/core/Tournament.server";
import * as TournamentMatchRepository from "~/features/tournament-match/TournamentMatchRepository.server";
import { resolveJoinInfo } from "~/features/tournament-match/tournament-match-utils";
import { notFoundIfNullish, parseParams } from "~/utils/remix.server";
import { CAST_LAYOUT } from "../broadcast-cast-layout.server";

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { tournament, tournamentId, user } = await tournamentFromParams(
		params,
		{ for: "view" },
	);
	requireBroadcastProducer(tournament, user);
	const { channel: slug } = parseParams({
		params,
		schema: broadcastParamsSchema,
	});

	const { state, channel } = notFoundIfNullish(
		await BroadcastHub.buildState({ tournamentId, slug, layout: CAST_LAYOUT }),
	);
	const broadcastChatRoomId = (
		await BroadcastRepository.findByChannel({ tournamentId, channel })
	)?.chatRoomId;
	const featuredMatchId = state.match?.id ?? null;
	const featuredMatch = featuredMatchId
		? await TournamentMatchRepository.findMatchById(featuredMatchId)
		: null;

	return {
		state,
		channel,
		featuredMatchId,
		joinInfo: featuredMatch
			? featuredMatchJoinInfo({ tournament, match: featuredMatch })
			: null,
		chatRooms: await RouteChatRooms.resolve(
			user,
			[broadcastChatRoomId, featuredMatch?.chatRoomId]
				.filter((roomId) => typeof roomId === "number")
				.map((roomId) => ({ roomId, autoOpen: true })),
		),
	};
};

function featuredMatchJoinInfo({
	tournament,
	match,
}: {
	tournament: Tournament;
	match: NonNullable<
		Awaited<ReturnType<typeof TournamentMatchRepository.findMatchById>>
	>;
}) {
	if (match.winnerSide) return null;

	const teamOne = match.opponentOne?.id
		? tournament.teamById(match.opponentOne.id)
		: null;
	const teamTwo = match.opponentTwo?.id
		? tournament.teamById(match.opponentTwo.id)
		: null;
	if (!teamOne || !teamTwo) return null;

	const bracketIdx = tournament.matchIdToBracketIdx(match.id);
	const bracket =
		typeof bracketIdx === "number" ? tournament.bracketByIdx(bracketIdx) : null;

	return resolveJoinInfo({
		tournament,
		teams: [teamOne, teamTwo],
		bracketContext: {
			bracketIdx,
			bracketType: bracket?.type ?? null,
			groupNumber:
				bracket?.data.group.find((group) => group.id === match.groupId)
					?.number ?? null,
			hasRoundRobin: tournament.bracketsMeta.some(
				(meta) => meta.type === "round_robin",
			),
		},
	});
}
