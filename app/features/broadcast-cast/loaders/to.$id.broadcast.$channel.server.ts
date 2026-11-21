import type { LoaderFunctionArgs } from "react-router";
import type { CastAccount } from "~/db/tables-json";
import * as BroadcastRepository from "~/features/broadcast/BroadcastRepository.server";
import { broadcastParamsSchema } from "~/features/broadcast/broadcast-schemas";
import type { BroadcastChannel } from "~/features/broadcast/broadcast-types";
import { requireBroadcastProducer } from "~/features/broadcast/broadcast-utils.server";
import * as BroadcastHub from "~/features/broadcast/core/BroadcastHub.server";
import * as RouteChatRooms from "~/features/chat/RouteChatRooms.server";
import * as LiveStream from "~/features/live-streams/core/LiveStream";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import { tournamentFromParams } from "~/features/tournament-bracket/core/Tournament.server";
import * as TournamentMatchRepository from "~/features/tournament-match/TournamentMatchRepository.server";
import { resolveJoinInfo } from "~/features/tournament-match/tournament-match-utils";
import { notFoundIfNullish, parseParams } from "~/utils/remix.server";
import { CAST_LAYOUT } from "../broadcast-cast-layout.server";
import type { BroadcastBracketSide } from "../broadcast-cast-types";
import * as BracketFocus from "../core/BracketFocus";
import * as CastChannel from "../core/CastChannel";

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
			broadcastId: broadcast?.id,
		}),
		featuredMatchId,
		featuredMatchBracketIdx: featuredMatchId
			? tournament.matchIdToBracketIdx(featuredMatchId)
			: null,
		eliminationRoundNames: eliminationRoundNames({
			tournament,
			featuredMatchId,
		}),
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

/** The user's OBS URL, what it shows and how it mutes the capture card, `null` before the user generated it. */
async function ownProgram({
	userId,
	broadcastId,
}: {
	userId: number;
	broadcastId: number | undefined;
}) {
	const program = await BroadcastRepository.findProgram(userId);
	if (!program) return null;

	const isShowingThis =
		program.broadcastId !== null && program.broadcastId === broadcastId;

	return {
		programKey: program.programKey,
		isShowingThis,
		/** The other broadcast the URL shows, `null` when it shows this one or none. */
		showing:
			!isShowingThis &&
			program.tournamentName &&
			program.platform &&
			program.account
				? {
						tournamentName: program.tournamentName,
						channelName: channelName({
							castAccounts: program.tournamentCastAccounts,
							channel: { platform: program.platform, account: program.account },
						}),
					}
				: null,
		obsAudio: program.obsAudio,
	};
}

function channelName({
	castAccounts,
	channel,
}: {
	castAccounts: CastAccount[] | null;
	channel: Pick<BroadcastChannel, "platform" | "account">;
}) {
	return (
		CastChannel.list(castAccounts).find((candidate) =>
			LiveStream.isSameAccount(candidate, channel),
		)?.name ?? channel.account
	);
}

/** Names of the rounds of each side of the elimination brackets the bracket scene can show, by bracket index. */
function eliminationRoundNames({
	tournament,
	featuredMatchId,
}: {
	tournament: Tournament;
	featuredMatchId: number | null;
}) {
	const result: Record<
		number,
		Record<BroadcastBracketSide["type"], string[]>
	> = {};
	for (const idx of BracketFocus.showableBracketIdxs(tournament)) {
		const bracket = tournament.bracketByIdx(idx);
		if (
			bracket?.type !== "single_elimination" &&
			bracket?.type !== "double_elimination"
		) {
			continue;
		}

		const args = {
			type: bracket.type,
			data: bracket.data,
			groupId: BracketFocus.resolveGroupId({
				data: bracket.data,
				featuredMatchId,
			}),
		};
		result[idx] = {
			winners: BracketFocus.sideRoundNames({ ...args, side: "winners" }),
			losers:
				bracket.type === "double_elimination"
					? BracketFocus.sideRoundNames({ ...args, side: "losers" })
					: [],
		};
	}

	return result;
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
