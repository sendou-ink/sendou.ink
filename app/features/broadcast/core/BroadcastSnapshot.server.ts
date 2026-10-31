import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import { tournamentFromDB } from "~/features/tournament-bracket/core/Tournament.server";
import { resolveMatchMapList } from "~/features/tournament-match/core/mapList.server";
import * as TournamentMatchRepository from "~/features/tournament-match/TournamentMatchRepository.server";
import { inGameNameWithoutDiscriminator } from "~/utils/strings";
import { avatarUrl } from "~/utils/urls";
import * as BroadcastRepository from "../BroadcastRepository.server";
import {
	DEFAULT_BROADCAST_OVERRIDES,
	DEFAULT_BROADCAST_SETTINGS,
} from "../broadcast-constants";
import type {
	BroadcastChannel,
	BroadcastMatch,
	BroadcastOverrides,
	BroadcastPlayer,
	BroadcastState,
	BroadcastTeam,
	LiveResults,
} from "../broadcast-types";
import * as CastChannel from "./CastChannel";
import * as Producer from "./Producer";
import * as SetProgress from "./SetProgress";
import * as TeamOverrides from "./TeamOverrides";

type PlayerRow = Awaited<
	ReturnType<typeof BroadcastRepository.findAllPlayersByTournamentTeamIds>
>[number];

/** Broadcast state minus the connection counts, which the hub adds. */
export type Snapshot = Omit<BroadcastState, "health">;

/**
 * Builds the state the channel's overlays render from fresh (uncached) data.
 * `null` when the tournament has no cast channel by the slug.
 */
export async function build({
	tournamentId,
	slug,
}: {
	tournamentId: number;
	slug: string;
}): Promise<{ snapshot: Snapshot; channel: BroadcastChannel } | null> {
	const tournament = await tournamentFromDB(tournamentId);
	const channel = CastChannel.findBySlug(tournament.ctx.castAccounts, slug);
	if (!channel) return null;

	const stored = await BroadcastRepository.findByChannel({
		tournamentId,
		channel,
	});
	const featuredMatchId = CastChannel.featuredMatchId({
		castedMatchesInfo: tournament.ctx.castedMatchesInfo,
		channel,
	});

	return {
		channel,
		snapshot: {
			v: 1,
			...(stored?.state ?? Producer.initialState()),
			settings: stored?.settings ?? DEFAULT_BROADCAST_SETTINGS,
			tournament: {
				name: tournament.ctx.name,
				logoUrl: tournament.ctx.logoUrl,
			},
			match: featuredMatchId
				? await featuredMatch({
						tournament,
						matchId: featuredMatchId,
						overrides: stored?.overrides ?? DEFAULT_BROADCAST_OVERRIDES,
						liveResults: stored?.state.liveResults ?? null,
					})
				: null,
		},
	};
}

/** The team's editable values as the tournament has them, without the producer's edits. `null` for a team not in the tournament. */
export async function findTeamValues({
	tournament,
	teamId,
}: {
	tournament: Tournament;
	teamId: number;
}): Promise<TeamOverrides.TeamValues | null> {
	const tournamentTeam = tournament.teamById(teamId);
	if (!tournamentTeam) return null;

	const players = await BroadcastRepository.findAllPlayersByTournamentTeamIds([
		teamId,
	]);

	return {
		name: tournamentTeam.name,
		players: players.map((player) => {
			const { userId, name, weapons } = toBroadcastPlayer(player, null);
			return { userId, name, weapons };
		}),
	};
}

async function featuredMatch({
	tournament,
	matchId,
	overrides,
	liveResults,
}: {
	tournament: Tournament;
	matchId: number;
	overrides: BroadcastOverrides;
	liveResults: LiveResults | null;
}): Promise<BroadcastMatch | null> {
	const match = await TournamentMatchRepository.findMatchById(matchId);
	if (!match || match.tournamentId !== tournament.ctx.id) return null;

	const results = await TournamentMatchRepository.findResultsByMatchId(matchId);
	const isOver = Boolean(match.winnerSide);

	const mapList = isOver
		? null
		: await resolveMatchMapList({ match, tournament });
	const upcomingMap = mapList?.filter((map) => !map.bannedByTournamentTeamId)[
		results.length
	];
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
			upcomingMap: upcomingMap
				? { mode: upcomingMap.mode, stageId: upcomingMap.stageId }
				: null,
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

		return TeamOverrides.apply(
			{
				id: tournamentTeam.id,
				name: tournamentTeam.name,
				logoUrl: tournamentTeam.logoUrl,
				seed: tournamentTeam.seed,
				players: players
					.filter((player) => player.tournamentTeamId === tournamentTeam.id)
					.map((player) =>
						toBroadcastPlayer(player, tournamentTeam.activeRosterUserIds),
					),
				isEdited: false,
			},
			overrides,
		);
	};

	const names = tournament.matchContextNamesById(matchId);

	return {
		id: match.id,
		bracketName: names.bracketName,
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

function toBroadcastPlayer(
	player: PlayerRow,
	activeRosterUserIds: number[] | null,
): BroadcastPlayer {
	return {
		userId: player.id,
		name: player.inGameName
			? inGameNameWithoutDiscriminator(player.inGameName)
			: player.username,
		avatarUrl: player.avatar ? avatarUrl(player.avatar, "lg") : null,
		isSub: Boolean(player.isSub),
		isActive: activeRosterUserIds
			? activeRosterUserIds.includes(player.id)
			: null,
		weapons: player.weapons.map((weapon) => weapon.weaponSplId),
	};
}
