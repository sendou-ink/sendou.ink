import * as R from "remeda";
import type { Standing } from "~/features/tournament-bracket/core/Bracket";
import type {
	BracketData,
	MatchData,
	RoundData,
} from "~/features/tournament-bracket/core/engine/types";
import type {
	BroadcastBracketMatch,
	BroadcastBracketTeam,
	BroadcastRoundRobinBracket,
	BroadcastStanding,
	BroadcastSwissBracket,
} from "../broadcast-cast-types";
import * as BracketFocus from "./BracketFocus";

const MAX_STANDINGS_SHOWN = 16;
const MAX_ROUNDS_SHOWN = 7;

/** A team's place in the group's standings, see `Bracket.liveStandings`. */
type GroupStanding = Pick<Standing, "placement" | "stats"> & {
	team: { id: number };
};

interface GroupArgs {
	idx: number;
	name: string;
	/** The featured match as the view shows it, see `BracketFocus.asOnAir`. */
	data: BracketData;
	groupId: number;
	/** The group's, from `data`. */
	standings: GroupStanding[];
	featuredMatchId: number | null;
	teamById: (id: number) => BroadcastBracketTeam | null;
}

/**
 * Lays out a round robin group for the bracket scene: its standings and rounds. A big group's are cut to the
 * standings around the featured match's teams and the rounds around the one being played.
 */
export function roundRobin(args: GroupArgs): BroadcastRoundRobinBracket {
	const rounds = groupRounds(args).map((round) => ({
		id: round.id,
		number: round.number,
		matches: roundMatches({ args, roundId: round.id }),
	}));
	const featuredRoundIdx = rounds.findIndex((round) =>
		round.matches.some((match) => match.isFeatured),
	);
	const playedRoundIdx = rounds.findIndex((round) =>
		round.matches.some((match) => match.winner === null),
	);
	const focusedRoundIdx =
		featuredRoundIdx !== -1
			? featuredRoundIdx
			: playedRoundIdx !== -1
				? playedRoundIdx
				: rounds.length - 1;

	return {
		type: "round_robin",
		...groupBase(args),
		rounds: windowsAround({
			count: rounds.length,
			focusedIdxs: [focusedRoundIdx],
			size: MAX_ROUNDS_SHOWN,
		}).flatMap(([start, end]) => rounds.slice(start, end)),
	};
}

/**
 * Lays out a Swiss group for the bracket scene: its standings, of a big group the ones around the featured match's
 * teams, and the round being played with its matches pooled by the record their teams went into it with.
 */
export function swiss(args: GroupArgs): BroadcastSwissBracket {
	const rounds = groupRounds(args);
	const groupMatches = args.data.match.filter(
		(match) => match.groupId === args.groupId,
	);
	const featuredRoundId = groupMatches.find(
		(match) => match.id === args.featuredMatchId,
	)?.roundId;
	const shownRound =
		rounds.find((round) => round.id === featuredRoundId) ??
		R.findLast(rounds, (round) =>
			groupMatches.some((match) => match.roundId === round.id),
		);

	const base = { type: "swiss" as const, ...groupBase(args) };
	if (!shownRound) {
		return { ...base, roundNumber: null, roundCount: rounds.length, pools: [] };
	}

	const roundNumberById = new Map(
		rounds.map((round) => [round.id, round.number]),
	);
	const records = recordsOf(
		groupMatches.filter(
			(match) =>
				(roundNumberById.get(match.roundId) ?? Number.POSITIVE_INFINITY) <
				shownRound.number,
		),
	);
	const poolOf = (match: BroadcastBracketMatch) =>
		R.firstBy(
			match.teams.map(
				(team) =>
					(team ? records.get(team.id) : undefined) ?? { wins: 0, losses: 0 },
			),
			[(record) => record.wins, "desc"],
			(record) => record.losses,
		) ?? { wins: 0, losses: 0 };

	const pools = Object.values(
		R.groupBy(roundMatches({ args, roundId: shownRound.id }), (match) => {
			const pool = poolOf(match);
			return `${pool.wins}-${pool.losses}`;
		}),
	).map((matches) => ({ ...poolOf(matches[0]), matches }));

	return {
		...base,
		roundNumber: shownRound.number,
		roundCount: rounds.length,
		pools: R.sortBy(
			pools,
			[(pool) => pool.wins, "desc"],
			(pool) => pool.losses,
		),
	};
}

/**
 * Index ranges (`[start, end)`) of the items shown, at most `size` of them: one range centered on the focused items
 * as far as the ends allow, or when they are too far apart for it one around the first and one around the last.
 * The first items when none is focused.
 * @internal
 */
export function windowsAround({
	count,
	focusedIdxs,
	size,
}: {
	count: number;
	focusedIdxs: number[];
	size: number;
}): Array<[number, number]> {
	if (count <= size) return [[0, count]];

	const focused = focusedIdxs.filter((idx) => idx >= 0).sort((a, b) => a - b);
	const first = focused.at(0);
	const last = focused.at(-1);
	if (first === undefined || last === undefined) return [[0, size]];

	if (last - first < size) {
		return [windowRange({ center: (first + last) / 2, size, count })];
	}

	const firstSize = Math.floor(size / 2);
	return [
		windowRange({ center: first, size: firstSize, count }),
		windowRange({ center: last, size: size - firstSize, count }),
	];
}

function windowRange({
	center,
	size,
	count,
}: {
	center: number;
	size: number;
	count: number;
}): [number, number] {
	const start = R.clamp(Math.round(center - (size - 1) / 2), {
		min: 0,
		max: count - size,
	});

	return [start, start + size];
}

function groupBase(args: GroupArgs) {
	const group = args.data.group.find(
		(candidate) => candidate.id === args.groupId,
	);
	const featuredMatch = args.data.match.find(
		(match) => match.id === args.featuredMatchId,
	);
	const featuredTeamIds = [
		featuredMatch?.opponent1?.id,
		featuredMatch?.opponent2?.id,
	].filter((id) => typeof id === "number");
	const standings = args.standings.flatMap((standing) =>
		toBroadcastStanding({
			standing,
			// placements of a bracket's groups are numbered together: 1st of each group is 1st, 2nd of each 3rd...
			placement:
				args.standings.filter((other) => other.placement < standing.placement)
					.length + 1,
			teamById: args.teamById,
		}),
	);
	const windows = windowsAround({
		count: standings.length,
		focusedIdxs: standings.flatMap((standing, idx) =>
			featuredTeamIds.includes(standing.team.id) ? [idx] : [],
		),
		size: MAX_STANDINGS_SHOWN,
	});

	return {
		idx: args.idx,
		name: args.name,
		groupNumber: args.data.group.length > 1 && group ? group.number : null,
		standings: windows.map(([start, end], windowIdx) => ({
			hiddenAbove: start - (windows[windowIdx - 1]?.[1] ?? 0),
			standings: standings.slice(start, end),
		})),
		standingsHiddenBelow: standings.length - (windows.at(-1)?.[1] ?? 0),
	};
}

function toBroadcastStanding({
	standing,
	placement,
	teamById,
}: {
	standing: GroupStanding;
	placement: number;
	teamById: GroupArgs["teamById"];
}): BroadcastStanding[] {
	const team = teamById(standing.team.id);
	if (!team) return [];

	return [
		{
			placement,
			team,
			setWins: standing.stats?.setWins ?? 0,
			setLosses: standing.stats?.setLosses ?? 0,
			mapWins: standing.stats?.mapWins ?? 0,
			mapLosses: standing.stats?.mapLosses ?? 0,
		},
	];
}

function groupRounds(args: GroupArgs): RoundData[] {
	return R.sortBy(
		args.data.round.filter((round) => round.groupId === args.groupId),
		(round) => round.number,
	);
}

function roundMatches({
	args,
	roundId,
}: {
	args: GroupArgs;
	roundId: number;
}): BroadcastBracketMatch[] {
	return args.data.match
		.filter(
			(match) =>
				match.roundId === roundId && match.opponent1 && match.opponent2,
		)
		.map((match) =>
			BracketFocus.toBroadcastMatch({
				match,
				isFeatured: match.id === args.featuredMatchId,
				isFed: false,
				teamById: args.teamById,
			}),
		);
}

/** Sets won and lost per team over the matches, a bye counting as a win. */
function recordsOf(matches: MatchData[]) {
	const records = new Map<number, { wins: number; losses: number }>();
	const add = (teamId: number | null | undefined, isWin: boolean) => {
		if (typeof teamId !== "number") return;

		const record = records.get(teamId) ?? { wins: 0, losses: 0 };
		records.set(teamId, {
			wins: record.wins + (isWin ? 1 : 0),
			losses: record.losses + (isWin ? 0 : 1),
		});
	};

	for (const match of matches) {
		if (!match.opponent1 || !match.opponent2) {
			add((match.opponent1 ?? match.opponent2)?.id, true);
			continue;
		}
		if (!match.winnerSide) continue;

		add(match.opponent1.id, match.winnerSide === "opponent1");
		add(match.opponent2.id, match.winnerSide === "opponent2");
	}

	return records;
}
