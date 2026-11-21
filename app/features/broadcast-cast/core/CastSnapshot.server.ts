import * as R from "remeda";
import * as BroadcastRepository from "~/features/broadcast/BroadcastRepository.server";
import type {
	BroadcastMatch,
	BroadcastView,
} from "~/features/broadcast/broadcast-types";
import { matchSides, roundLabel } from "~/features/broadcast/broadcast-utils";
import * as BroadcastSnapshot from "~/features/broadcast/core/BroadcastSnapshot.server";
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
} from "~/features/tournament-bracket/tournament-bracket-utils";
import { tournamentMatchChannel } from "~/features/tournament-match/tournament-match-utils";
import { modesShort } from "~/modules/in-game-lists/modes";
import { databaseTimestampToJavascriptTimestamp } from "~/utils/dates";
import { avatarUrl } from "~/utils/urls";
import * as BroadcastCastRepository from "../BroadcastCastRepository.server";
import {
	BROADCAST_FINISHED_SET_SHOWN_MS,
	BROADCAST_OTHER_MATCHES_MIN_COUNT,
	CAST_PRODUCER_RULES,
	DEFAULT_CAST_BROADCAST_SETTINGS,
} from "../broadcast-cast-constants";
import type {
	BroadcastBracket,
	BroadcastBracketFocus,
	BroadcastBracketTeam,
	BroadcastCaster,
	BroadcastCasterSetting,
	BroadcastOtherMatch,
	BroadcastTeamSpotlight,
	CastBroadcastState,
	CastProducerState,
} from "../broadcast-cast-types";
import * as BracketFocus from "./BracketFocus";
import * as CastChannel from "./CastChannel";
import * as GroupFocus from "./GroupFocus";
import * as TeamSpotlight from "./TeamSpotlight";

/**
 * Builds the state the channel's cast overlays render from fresh (uncached) data, along with the event channels
 * whose events change it. `null` when the tournament has no cast channel by the slug.
 */
export async function build({
	tournamentId,
	slug,
}: {
	tournamentId: number;
	slug: string;
}): Promise<BroadcastSnapshot.Built<CastBroadcastState> | null> {
	const tournament = await tournamentFromDB(tournamentId);
	const channel = CastChannel.findBySlug(tournament.ctx.castAccounts, slug);
	if (!channel) return null;

	const { state, settings } = await BroadcastSnapshot.stored({
		tournamentId,
		channel,
		rules: CAST_PRODUCER_RULES,
		defaultSettings: DEFAULT_CAST_BROADCAST_SETTINGS,
	});
	const featuredMatchId = CastChannel.featuredMatchId({
		castedMatchesInfo: tournament.ctx.castedMatchesInfo,
		channel,
	});
	const match = featuredMatchId
		? await BroadcastSnapshot.featuredMatch({
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
	const elsewhere = await otherMatches({
		tournament,
		featuredMatchId: match?.id,
	});

	return {
		channel,
		snapshot: {
			v: 1,
			...state,
			settings,
			casters: await casters(settings.casters),
			tournament: {
				name: tournament.ctx.name,
				logoUrl: tournament.ctx.logoUrl,
			},
			match,
			bracket: { live: bracketOf("live"), next: bracketOf("next") },
			team: teams,
			otherMatches: elsewhere.matches,
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
			...elsewhere.matches.flatMap((other) =>
				other.winner === null ? [matchEventChannel(tournament, other.id)] : [],
			),
		]),
		staleAt: elsewhere.staleAt,
	};
}

/** The bracket the producer state's bracket scene shows and its group: the featured match's or the first. */
function shownBracket({
	tournament,
	producer,
	match,
}: {
	tournament: Tournament;
	producer: CastProducerState;
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

/**
 * The tournament's sets being played right now (0-0 ones too) and the ones finished in the last
 * {@link BROADCAST_FINISHED_SET_SHOWN_MS}, topped up with the most recently finished ones to
 * {@link BROADCAST_OTHER_MATCHES_MIN_COUNT} when there are fewer (e.g. only losers finals left), leaving out the ones a
 * channel is casting or holding back for a cast, in bracket order. Their round names say the bracket too when the sets
 * are of more than one. `staleAt` is when the first recently finished set is due to leave.
 */
async function otherMatches({
	tournament,
	featuredMatchId,
}: {
	tournament: Tournament;
	featuredMatchId: number | undefined;
}): Promise<{ matches: BroadcastOtherMatch[]; staleAt: number | null }> {
	const castMatchIds = new Set([
		featuredMatchId,
		...(tournament.ctx.castedMatchesInfo?.castedMatches ?? []).map(
			(match) => match.matchId,
		),
		...(tournament.ctx.castedMatchesInfo?.lockedMatches ?? []).map(
			(match) => match.matchId,
		),
	]);

	const candidatesByBracket = tournament.brackets.flatMap((bracket) => {
		// a league's scheduled sets are played over weeks, not right now
		if (bracket.preview || bracket.hasScheduling) return [];

		const statuses = bracket.matchStatuses();
		const groupNumberById = new Map(
			bracket.data.group.map((group) => [group.id, group.number]),
		);
		const roundNumberById = new Map(
			bracket.data.round.map((round) => [round.id, round.number]),
		);
		const candidates = bracket.data.match.filter(
			(match) =>
				!castMatchIds.has(match.id) &&
				(statuses.get(match.id) === "STARTED" || Boolean(match.winnerSide)),
		);

		return [
			R.sortBy(
				candidates,
				(match) => groupNumberById.get(match.groupId) ?? 0,
				(match) => roundNumberById.get(match.roundId) ?? 0,
				(match) => match.number,
			),
		];
	});

	const now = Date.now();
	const candidates = candidatesByBracket.flat();
	const lastReportedAts =
		await BroadcastCastRepository.findAllLastGameReportedAtByMatchIds(
			candidates.filter((match) => match.winnerSide).map((match) => match.id),
		);
	// a set won against a BYE has no games, so it never shows
	const finished = lastReportedAts.map((row) => ({
		matchId: row.matchId,
		leavesAt:
			databaseTimestampToJavascriptTimestamp(row.lastReportedAt) +
			BROADCAST_FINISHED_SET_SHOWN_MS,
	}));
	const recent = finished.filter((set) => set.leavesAt > now);
	const fillCount = Math.max(
		0,
		BROADCAST_OTHER_MATCHES_MIN_COUNT -
			candidates.filter((match) => !match.winnerSide).length -
			recent.length,
	);
	const fill = R.sortBy(
		finished.filter((set) => set.leavesAt <= now),
		[(set) => set.leavesAt, "desc"],
	).slice(0, fillCount);
	const shownFinishedIds = new Set(
		[...recent, ...fill].map((set) => set.matchId),
	);

	const shownByBracket = candidatesByBracket
		.map((ofBracket) =>
			ofBracket.filter(
				(match) => !match.winnerSide || shownFinishedIds.has(match.id),
			),
		)
		.filter((shown) => shown.length > 0);
	const isOfManyBrackets = shownByBracket.length > 1;

	const matches = shownByBracket.flat().map((match): BroadcastOtherMatch => {
		const names = tournament.matchContextNamesById(match.id);
		const team = (id: number | null | undefined) => {
			const tournamentTeam =
				typeof id === "number" ? tournament.teamById(id) : null;

			return tournamentTeam
				? { name: tournamentTeam.name, seed: tournamentTeam.seed }
				: null;
		};

		return {
			id: match.id,
			roundName:
				roundLabel({
					bracketName: isOfManyBrackets ? names.bracketName : null,
					roundName: names.roundNameWithoutMatchIdentifier ?? null,
				}) || null,
			teams: [team(match.opponent1?.id), team(match.opponent2?.id)],
			scores: [match.opponent1?.score ?? 0, match.opponent2?.score ?? 0],
			winner: match.winnerSide
				? match.winnerSide === "opponent1"
					? 0
					: 1
				: null,
		};
	});

	return {
		matches,
		staleAt:
			recent.length > 0 ? Math.min(...recent.map((set) => set.leavesAt)) : null,
	};
}

async function casters(
	settings: BroadcastCasterSetting[],
): Promise<BroadcastCaster[]> {
	const users = await BroadcastCastRepository.findAllCastersByUserIds(
		settings.map((caster) => caster.userId),
	);

	return settings.flatMap((caster) => {
		const user = users.find((candidate) => candidate.userId === caster.userId);
		if (!user) return [];

		return [
			{
				...caster,
				userId: user.userId,
				name: user.name,
				pronouns: user.pronouns,
				avatarUrl: user.avatar ? avatarUrl(user.avatar, "lg") : null,
			},
		];
	});
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
		await BroadcastCastRepository.findAllGameResultsByMatchIds(matchIds);
	const players = await BroadcastRepository.findAllPlayersByTournamentTeamIds([
		teamId,
	]);
	// map pools are revealed once the tournament starts
	const mapPool =
		tournament.teamsPrePickMaps && tournament.hasStarted
			? await BroadcastCastRepository.findMapPoolByTournamentTeamId(teamId)
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
		team: BroadcastSnapshot.toBroadcastTeam({
			tournament,
			tournamentTeam,
			players,
		}),
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
	producer: CastProducerState;
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
