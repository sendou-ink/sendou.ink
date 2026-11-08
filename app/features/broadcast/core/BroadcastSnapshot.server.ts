import * as R from "remeda";
import {
	type Bracket,
	createBracket,
} from "~/features/tournament-bracket/core/Bracket";
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
import { modesShort } from "~/modules/in-game-lists/modes";
import { inGameNameWithoutDiscriminator } from "~/utils/strings";
import { avatarUrl } from "~/utils/urls";
import * as BroadcastRepository from "../BroadcastRepository.server";
import { DEFAULT_BROADCAST_SETTINGS } from "../broadcast-constants";
import type {
	BroadcastBracket,
	BroadcastBracketFocus,
	BroadcastBracketTeam,
	BroadcastCaster,
	BroadcastChannel,
	BroadcastMatch,
	BroadcastOtherMatch,
	BroadcastPlayer,
	BroadcastState,
	BroadcastTeam,
	BroadcastTeamSpotlight,
	BroadcastView,
	LiveResults,
	ProducerState,
} from "../broadcast-types";
import { matchSides, roundLabel } from "../broadcast-utils";
import * as BracketFocus from "./BracketFocus";
import * as CastChannel from "./CastChannel";
import * as GroupFocus from "./GroupFocus";
import * as Producer from "./Producer";
import * as SetProgress from "./SetProgress";
import * as TeamSpotlight from "./TeamSpotlight";

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

		return bracketLayout({
			...shown,
			focus: state[view].bracketFocus,
			featured: match ? { id: match.id, progress: match.progress[view] } : null,
			teamById: (id) => bracketTeam(tournament, id),
		});
	};

	const teamOf = (view: BroadcastView) => {
		const producer = state[view];
		if (producer.scene !== "team") return null;

		const teamId = pickedTeamId({ match, view, producer });
		if (typeof teamId !== "number") return null;

		return teamSpotlight({
			tournament,
			teamId,
			featured: match ? { id: match.id, progress: match.progress[view] } : null,
		});
	};
	const teams = { live: await teamOf("live"), next: await teamOf("next") };

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
			team: teams,
			otherMatches: otherMatches({ tournament, featuredMatchId: match?.id }),
		},
		eventChannels: R.unique([
			tournamentChannel(tournamentId),
			...(match ? [tournamentMatchChannel(match.id)] : []),
			// scores of sets still going are only sent to their bracket's channel
			...[shownBrackets.live, shownBrackets.next].flatMap((shown) =>
				shown ? [shown.eventChannel] : [],
			),
			...[teams.live, teams.next].flatMap((spotlight) =>
				(spotlight?.sets ?? []).flatMap((set) =>
					set.status === "live"
						? [matchEventChannel(tournament, set.matchId)]
						: [],
				),
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
		bracket,
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

function bracketLayout({
	bracket,
	groupId,
	focus,
	featured,
	teamById,
}: {
	bracket: Bracket;
	groupId: number | undefined;
	focus: BroadcastBracketFocus;
	featured: BracketFocus.FeaturedMatch | null;
	teamById: (id: number) => BroadcastBracketTeam | null;
}): BroadcastBracket | null {
	if (
		bracket.type === "single_elimination" ||
		bracket.type === "double_elimination"
	) {
		return BracketFocus.layout({
			idx: bracket.idx,
			name: bracket.name,
			type: bracket.type,
			data: bracket.data,
			groupId,
			focus,
			featured,
			teamById,
		});
	}
	if (
		(bracket.type !== "round_robin" && bracket.type !== "swiss") ||
		typeof groupId !== "number"
	) {
		return null;
	}

	// standings counting the featured match only as far as it is on air
	const onAir = createBracket({
		...bracket,
		type: bracket.type,
		data: BracketFocus.asOnAir(bracket.data, featured),
	});
	const args = {
		idx: bracket.idx,
		name: bracket.name,
		data: onAir.data,
		groupId,
		standings: onAir.liveStandings.filter(
			(standing) => standing.groupId === groupId,
		),
		featuredMatchId: featured?.id ?? null,
		teamById,
	};

	return bracket.type === "swiss"
		? GroupFocus.swiss(args)
		: GroupFocus.roundRobin(args);
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

// xxx: mocked with matches of Paddling Pool 393, make live: the matches of every bracket being played (and maybe
// just finished) with their event channels in `eventChannels` as their scores are only sent to their bracket's channel
function otherMatches({
	tournament,
	featuredMatchId,
}: {
	tournament: Tournament;
	featuredMatchId: number | undefined;
}): BroadcastOtherMatch[] {
	if (tournament.ctx.id !== 4733) return [];

	const matches: BroadcastOtherMatch[] = [
		{
			id: 160993,
			roundName: "WB Semis",
			teams: [
				{ name: "flower man", seed: 1 },
				{ name: "piscine paddling poutine pool", seed: 13 },
			],
			scores: [1, 0],
			winner: null,
		},
		{
			id: 161016,
			roundName: "LB Round 4",
			teams: [
				{ name: "zuun forgot to wake up", seed: 7 },
				{ name: "Scream", seed: 6 },
			],
			scores: [1, 1],
			winner: null,
		},
		{
			id: 161017,
			roundName: "LB Round 4",
			teams: [
				{ name: "Socks & Sandals", seed: 11 },
				{ name: "labiteamomooo", seed: 10 },
			],
			scores: [0, 2],
			winner: 1,
		},
		{
			id: 161018,
			roundName: "LB Round 4",
			teams: [
				{ name: "PEZ", seed: 8 },
				{ name: "Monëy so big", seed: 4 },
			],
			scores: [1, 1],
			winner: null,
		},
		{
			id: 161019,
			roundName: "LB Round 4",
			teams: [
				{ name: "Poker", seed: 5 },
				{ name: "jsp jsp jsp", seed: 9 },
			],
			scores: [1, 0],
			winner: null,
		},
	];

	return matches.filter((match) => match.id !== featuredMatchId);
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

async function teamSpotlight({
	tournament,
	teamId,
	featured,
}: {
	tournament: Tournament;
	teamId: number;
	featured: BracketFocus.FeaturedMatch | null;
}): Promise<BroadcastTeamSpotlight | null> {
	const tournamentTeam = tournament.teamById(teamId);
	if (!tournamentTeam) return null;

	const brackets = R.sortBy(
		tournament.brackets.filter((bracket) => !bracket.preview),
		(bracket) => bracket.createdAt ?? Number.POSITIVE_INFINITY,
		(bracket) => bracket.idx,
	);
	const matchIds = brackets.flatMap((bracket) =>
		bracket.data.match
			.filter(
				(match) =>
					match.opponent1?.id === teamId || match.opponent2?.id === teamId,
			)
			.map((match) => match.id),
	);
	const games =
		await BroadcastRepository.findAllGameResultsByMatchIds(matchIds);
	const players = await BroadcastRepository.findAllPlayersByTournamentTeamIds([
		teamId,
	]);
	// map pools are revealed once the tournament starts
	const mapPool =
		tournament.teamsPrePickMaps && tournament.hasStarted
			? await BroadcastRepository.findMapPoolByTournamentTeamId(teamId)
			: [];
	const hasManyBrackets = tournament.ctx.settings.bracketProgression.length > 1;
	const spotlight = TeamSpotlight.build({
		teamId,
		brackets,
		games,
		featured,
		teamById: (id) => bracketTeam(tournament, id),
		roundLabelOf: (matchId) => {
			const names = tournament.matchContextNamesById(matchId);

			return roundLabel({
				bracketName: hasManyBrackets ? names.bracketName : null,
				roundName: names.roundNameWithoutMatchIdentifier ?? null,
			});
		},
	});

	return {
		...spotlight,
		team: toBroadcastTeam({ tournament, tournamentTeam, players }),
		modes: tournament.modesIncluded.length > 1 ? spotlight.modes : [],
		mapPool: R.sortBy(
			mapPool,
			(map) => modesShort.indexOf(map.mode),
			(map) => map.stageId,
		),
	};
}

function pickedTeamId({
	match,
	view,
	producer,
}: {
	match: BroadcastMatch | null;
	view: BroadcastView;
	producer: ProducerState;
}) {
	if (typeof producer.teamPick === "number") return producer.teamPick;
	if (!match) return null;

	return matchSides(match, view, producer)[producer.teamPick === "left" ? 0 : 1]
		.team?.id;
}

/** Channel the match's score updates are sent to: its bracket's (or group's), the tournament's when not found. */
function matchEventChannel(tournament: Tournament, matchId: number) {
	const bracketIdx = tournament.matchIdToBracketIdx(matchId);
	const bracket =
		typeof bracketIdx === "number" ? tournament.bracketByIdx(bracketIdx) : null;
	if (typeof bracketIdx !== "number" || !bracket) {
		return tournamentChannel(tournament.ctx.id);
	}

	const groupId =
		bracket.data.match.find((match) => match.id === matchId)?.groupId ?? null;

	return tournamentBracketChannel({
		tournamentId: tournament.ctx.id,
		bracketIdx,
		groupId: showsOneGroupAtATime(bracket) ? groupId : null,
	});
}

function toBroadcastTeam({
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
