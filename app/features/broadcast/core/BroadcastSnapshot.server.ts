import * as R from "remeda";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import { tournamentFromDB } from "~/features/tournament-bracket/core/Tournament.server";
import {
	showsOneGroupAtATime,
	tournamentBracketChannel,
	tournamentChannel,
	tournamentTeamToActiveRosterUserIds,
} from "~/features/tournament-bracket/tournament-bracket-utils";
import { resolveMatchMapList } from "~/features/tournament-match/core/mapList.server";
import * as TournamentMatchRepository from "~/features/tournament-match/TournamentMatchRepository.server";
import { tournamentMatchChannel } from "~/features/tournament-match/tournament-match-utils";
import { inGameNameWithoutDiscriminator } from "~/utils/strings";
import { avatarUrl } from "~/utils/urls";
import * as BroadcastRepository from "../BroadcastRepository.server";
import { DEFAULT_BROADCAST_SETTINGS } from "../broadcast-constants";
import type {
	BroadcastBracketTeam,
	BroadcastCaster,
	BroadcastChannel,
	BroadcastMatch,
	BroadcastPlayer,
	BroadcastState,
	BroadcastTeam,
	BroadcastView,
	LiveResults,
	ProducerState,
} from "../broadcast-types";
import * as BracketFocus from "./BracketFocus";
import * as CastChannel from "./CastChannel";
import * as Producer from "./Producer";
import * as SetProgress from "./SetProgress";

type PlayerRow = Awaited<
	ReturnType<typeof BroadcastRepository.findAllPlayersByTournamentTeamIds>
>[number];

/** Broadcast state minus the connection counts, which the hub adds. */
export type Snapshot = Omit<BroadcastState, "health">;

/**
 * Builds the state the channel's overlays render from fresh (uncached) data, along with the event channels
 * whose events change it. `null` when the tournament has no cast channel by the slug.
 */
export async function build({
	tournamentId,
	slug,
}: {
	tournamentId: number;
	slug: string;
}): Promise<{
	snapshot: Snapshot;
	channel: BroadcastChannel;
	eventChannels: string[];
} | null> {
	const tournament = await tournamentFromDB(tournamentId);
	const channel = CastChannel.findBySlug(tournament.ctx.castAccounts, slug);
	if (!channel) return null;

	const stored = await BroadcastRepository.findByChannel({
		tournamentId,
		channel,
	});
	// settings and producer fields added later are missing from broadcasts written before
	const settings = { ...DEFAULT_BROADCAST_SETTINGS, ...stored?.settings };
	const state = stored
		? Producer.withDefaults(stored.state)
		: Producer.initialState();
	const featuredMatchId = CastChannel.featuredMatchId({
		castedMatchesInfo: tournament.ctx.castedMatchesInfo,
		channel,
	});
	const match = featuredMatchId
		? await featuredMatch({
				tournament,
				matchId: featuredMatchId,
				liveResults: state.liveResults,
			})
		: null;

	const shownBrackets = {
		live: shownBracket({ tournament, producer: state.live, match }),
		next: shownBracket({ tournament, producer: state.next, match }),
	};
	const bracketOf = (view: BroadcastView) => {
		const shown = shownBrackets[view];
		if (!shown) return null;

		return BracketFocus.layout({
			...shown,
			focus: state[view].bracketFocus,
			featured: match ? { id: match.id, progress: match.progress[view] } : null,
			teamById: (id) => bracketTeam(tournament, id),
		});
	};

	return {
		channel,
		snapshot: {
			v: 1,
			...state,
			settings,
			casters: await casters(settings.casterIds),
			tournament: {
				name: tournament.ctx.name,
				logoUrl: tournament.ctx.logoUrl,
			},
			match,
			bracket: { live: bracketOf("live"), next: bracketOf("next") },
		},
		eventChannels: R.unique([
			tournamentChannel(tournamentId),
			...(match ? [tournamentMatchChannel(match.id)] : []),
			// scores of sets still going are only sent to their bracket's channel
			...[shownBrackets.live, shownBrackets.next].flatMap((shown) =>
				shown ? [shown.eventChannel] : [],
			),
		]),
	};
}

/** The bracket the producer state's bracket scene shows and its group: the featured match's or the first. */
function shownBracket({
	tournament,
	producer,
	match,
}: {
	tournament: Tournament;
	producer: ProducerState;
	match: BroadcastMatch | null;
}) {
	const idx = BracketFocus.resolveBracketIdx({
		pickedIdx: producer.bracketIdx,
		featuredMatchBracketIdx: match
			? tournament.matchIdToBracketIdx(match.id)
			: null,
		showableIdxs: BracketFocus.showableBracketIdxs(tournament),
	});
	const bracket = idx === null ? null : tournament.bracketByIdx(idx);
	if (idx === null || !bracket) return null;

	const groupId =
		bracket.data.match.find((candidate) => candidate.id === match?.id)
			?.groupId ?? bracket.data.group[0]?.id;

	return {
		idx,
		name: bracket.name,
		data: bracket.data,
		groupId,
		eventChannel: tournamentBracketChannel({
			tournamentId: tournament.ctx.id,
			bracketIdx: idx,
			groupId:
				showsOneGroupAtATime(bracket) && typeof groupId === "number"
					? groupId
					: null,
		}),
	};
}

function bracketTeam(
	tournament: Tournament,
	id: number,
): BroadcastBracketTeam | null {
	const team = tournament.teamById(id);
	if (!team) return null;

	return {
		id: team.id,
		name: team.name,
		logoUrl: team.logoUrl,
		seed: team.seed,
	};
}

async function casters(userIds: number[]): Promise<BroadcastCaster[]> {
	const users = await BroadcastRepository.findAllCastersByUserIds(userIds);

	return userIds.flatMap((userId) => {
		const user = users.find((candidate) => candidate.userId === userId);
		return user ? [user] : [];
	});
}

async function featuredMatch({
	tournament,
	matchId,
	liveResults,
}: {
	tournament: Tournament;
	matchId: number;
	liveResults: LiveResults | null;
}): Promise<BroadcastMatch | null> {
	const match = await TournamentMatchRepository.findMatchById(matchId);
	if (!match || match.tournamentId !== tournament.ctx.id) return null;

	const results = await TournamentMatchRepository.findResultsByMatchId(matchId);
	const isOver = Boolean(match.winnerSide);

	const mapList = isOver
		? null
		: await resolveMatchMapList({ match, tournament });
	const plannedMaps = (mapList ?? [])
		.filter((map) => !map.bannedByTournamentTeamId)
		.map((map) => ({ mode: map.mode, stageId: map.stageId }));
	const progressAt = (resultCount: number) =>
		SetProgress.atResultCount({
			results,
			resultCount,
			teamIds: [match.opponentOne?.id ?? null, match.opponentTwo?.id ?? null],
			bracketScores: [
				match.opponentOne?.score ?? 0,
				match.opponentTwo?.score ?? 0,
			],
			isSetOver: isOver,
			plannedMaps,
			gameCount: match.roundMaps.count,
		});

	const players = await BroadcastRepository.findAllPlayersByTournamentTeamIds(
		[match.opponentOne?.id, match.opponentTwo?.id].filter(
			(id): id is number => typeof id === "number",
		),
	);

	const team = (opponent: typeof match.opponentOne): BroadcastTeam | null => {
		const tournamentTeam = opponent?.id
			? tournament.teamById(opponent.id)
			: null;
		if (!opponent?.id || !tournamentTeam) return null;

		return {
			id: tournamentTeam.id,
			name: tournamentTeam.name,
			logoUrl: tournamentTeam.logoUrl,
			seed: tournamentTeam.seed,
			players: rosterPlayers({
				players: players.filter(
					(player) => player.tournamentTeamId === tournamentTeam.id,
				),
				tournament,
				tournamentTeam,
			}).map(toBroadcastPlayer),
		};
	};

	const names = tournament.matchContextNamesById(matchId);

	return {
		id: match.id,
		bracketName:
			tournament.ctx.settings.bracketProgression.length > 1
				? names.bracketName
				: null,
		roundName: names.roundNameWithoutMatchIdentifier ?? null,
		countType: match.roundMaps.type,
		count: match.roundMaps.count,
		teams: [team(match.opponentOne), team(match.opponentTwo)],
		progress: {
			live: progressAt(
				SetProgress.liveResultCount({
					liveResults,
					matchId,
					resultCount: results.length,
				}),
			),
			next: progressAt(results.length),
		},
	};
}

/** The team's active roster, or its first members when it has not picked one. */
function rosterPlayers({
	players,
	tournament,
	tournamentTeam,
}: {
	players: PlayerRow[];
	tournament: Tournament;
	tournamentTeam: Tournament["ctx"]["teams"][number];
}) {
	const activeRosterUserIds = tournamentTeamToActiveRosterUserIds(
		tournamentTeam,
		tournament.minMembersPerTeam,
	);
	if (!activeRosterUserIds) {
		return players.slice(0, tournament.minMembersPerTeam);
	}

	return players.filter((player) => activeRosterUserIds.includes(player.id));
}

function toBroadcastPlayer(player: PlayerRow): BroadcastPlayer {
	return {
		userId: player.id,
		name: player.inGameName
			? inGameNameWithoutDiscriminator(player.inGameName)
			: player.username,
		avatarUrl: player.avatar ? avatarUrl(player.avatar, "lg") : null,
		weapons: player.weapons.map((weapon) => weapon.weaponSplId),
	};
}
