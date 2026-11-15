import type { LoaderFunctionArgs } from "react-router";
import * as BroadcastRepository from "~/features/broadcast/BroadcastRepository.server";
import { broadcastParamsSchema } from "~/features/broadcast/broadcast-schemas";
import type { BroadcastChannel } from "~/features/broadcast/broadcast-types";
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
	const broadcast = await BroadcastRepository.findByChannel({
		tournamentId,
		channel,
	});
	const broadcastChatRoomId = broadcast?.chatRoomId;
	const featuredMatchId = state.match?.id ?? null;
	const featuredMatch = featuredMatchId
		? await TournamentMatchRepository.findMatchById(featuredMatchId)
		: null;

	return {
		state,
		channel,
		program: await ownProgram({
			userId: user.id,
			channel,
			broadcastId: broadcast?.id,
		}),
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

/** The user's OBS URL for the channel and what it shows, `null` before the user generated it. */
async function ownProgram({
	userId,
	channel,
	broadcastId,
}: {
	userId: number;
	channel: BroadcastChannel;
	broadcastId: number | undefined;
}) {
	const program = await BroadcastRepository.findProgram({ userId, channel });
	if (!program) return null;

	const isShowingThis =
		program.broadcastId !== null && program.broadcastId === broadcastId;

	return {
		programKey: program.programKey,
		isShowingThis,
		/** Tournament of the channel's other broadcast the URL shows. */
		showingTournamentName: isShowingThis ? null : program.tournamentName,
	};
}

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
