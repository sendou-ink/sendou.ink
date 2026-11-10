import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import { tournamentTeamToActiveRosterUserIds } from "~/features/tournament-bracket/tournament-bracket-utils";
import { resolveMatchMapList } from "~/features/tournament-match/core/mapList.server";
import * as TournamentMatchRepository from "~/features/tournament-match/TournamentMatchRepository.server";
import { inGameNameWithoutDiscriminator } from "~/utils/strings";
import { avatarUrl } from "~/utils/urls";
import * as BroadcastRepository from "../BroadcastRepository.server";
import type {
	BroadcastChannel,
	BroadcastMatch,
	BroadcastPlayer,
	BroadcastSettings,
	BroadcastState,
	BroadcastStoredState,
	BroadcastTeam,
	LiveResults,
	ProducerState,
} from "../broadcast-types";
import * as Producer from "./Producer";
import * as SetProgress from "./SetProgress";

type PlayerRow = Awaited<
	ReturnType<typeof BroadcastRepository.findAllPlayersByTournamentTeamIds>
>[number];

/** Broadcast state minus the connection counts, which the hub adds. */
export type Snapshot<State extends BroadcastState = BroadcastState> = Omit<
	State,
	"health"
>;

/** A scene set's freshly built state of a broadcast, see `BroadcastHub.Layout`. */
export interface Built<State extends BroadcastState = BroadcastState> {
	snapshot: Snapshot<State>;
	channel: BroadcastChannel;
	/** Event channels whose events change the state. */
	eventChannels: string[];
}

/**
 * The channel's broadcast's producer state and settings as stored, settings and producer fields added after it was
 * written filled in with their defaults (a broadcast nothing has been written to yet gets them all).
 */
export async function stored<
	Item extends ProducerState,
	Settings extends BroadcastSettings,
>({
	tournamentId,
	channel,
	rules,
	defaultSettings,
}: {
	tournamentId: number;
	channel: BroadcastChannel;
	rules: Producer.Rules<Item>;
	defaultSettings: Settings;
}): Promise<{ state: BroadcastStoredState<Item>; settings: Settings }> {
	const row = await BroadcastRepository.findByChannel({
		tournamentId,
		channel,
	});

	// settings and producer fields added later are missing from broadcasts written before
	return {
		state: row
			? Producer.withDefaults(rules, row.state)
			: Producer.initialState(rules),
		settings: { ...defaultSettings, ...row?.settings },
	};
}

/**
 * The match the broadcast features, as on air (the first `liveResults.count` of its results, see
 * `SetProgress.liveResultCount`) and as reported. `null` when it is not the tournament's.
 */
export async function featuredMatch({
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

		return toBroadcastTeam({ tournament, tournamentTeam, players });
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

/** The tournament team as the overlays show it, with its active roster. */
export function toBroadcastTeam({
	tournament,
	tournamentTeam,
	players,
}: {
	tournament: Tournament;
	tournamentTeam: Tournament["ctx"]["teams"][number];
	players: PlayerRow[];
}): BroadcastTeam {
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
		country: player.country,
	};
}
