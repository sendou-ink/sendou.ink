import * as Standings from "~/features/tournament/core/Standings";
import type { BracketData } from "~/features/tournament-bracket/core/engine/types";
import { tournamentSummary } from "~/features/tournament-bracket/core/summarizer.server";
import { Tournament } from "~/features/tournament-bracket/core/Tournament";
import {
	type TournamentData,
	tournamentData,
} from "~/features/tournament-bracket/core/Tournament.server";
import * as BracketInvariants from "~/features/tournament-bracket/core/tests/BracketInvariants";
import * as BracketReplay from "~/features/tournament-bracket/core/tests/BracketReplay";
import * as TournamentMatchRepository from "~/features/tournament-match/TournamentMatchRepository.server";
import * as Queries from "./queries";

/** One disagreement between the replay and the stored tournament, or a broken invariant of the stored data. */
export interface Finding {
	class: string;
	stageId?: number;
	stageType?: string;
	matchId?: number;
	detail: string;
}

/** Everything found for one tournament, one line of the results file. */
export interface TournamentReplay {
	tournamentId: number;
	stageCount: number;
	matchCount: number;
	findings: Finding[];
	notes: Record<string, number>;
	error?: string;
}

/**
 * Replays every stage of the tournament and diffs: match state (`BracketReplay`), stored data
 * invariants, scores against the game result rows, the teams and seeding of every bracket against
 * what the current code would start it with, and the summary against the stored result rows.
 */
export async function replayTournament(
	tournamentId: number,
): Promise<TournamentReplay> {
	const raw = await tournamentData(tournamentId);
	if (!raw) {
		return {
			tournamentId,
			stageCount: 0,
			matchCount: 0,
			findings: [],
			notes: {},
			error: "Tournament not found",
		};
	}

	const findings: Finding[] = [];
	const notes: Record<string, number> = {};
	const tournament = new Tournament(raw);
	const games = await Queries.gameResults(tournamentId);

	const reportedAtByMatchId = new Map<number, number>();
	for (const game of games) {
		reportedAtByMatchId.set(
			game.matchId,
			Math.max(reportedAtByMatchId.get(game.matchId) ?? 0, game.createdAt),
		);
	}
	const abDivisionByTeamId = new Map(
		raw.ctx.teams.map((team) => [team.id, team.abDivision as 0 | 1 | null]),
	);

	findings.push(...scoreFindings(raw.data, games));

	const replayedStages = new Map<number, BracketData>();
	for (const stage of raw.data.stage) {
		const stored = stageData(raw.data, stage.id);
		const bracket = tournament.brackets.find(
			(candidate) => !candidate.preview && candidate.id === stage.id,
		);
		const tag = { stageId: stage.id, stageType: stage.type };

		if (!bracket) {
			findings.push({
				...tag,
				class: "stage-not-in-progression",
				detail: `stage "${stage.name}" matches no bracket of the progression`,
			});
		}

		for (const violation of BracketInvariants.violations(stored)) {
			findings.push({
				...tag,
				class: `stored:${violation.class}`,
				matchId: violation.matchId,
				detail: violation.detail,
			});
		}

		const replay = BracketReplay.replayStage(stored, {
			reportedAtByMatchId,
			abDivisionByTeamId,
			advanceThreshold: bracket?.settings?.advanceThreshold,
		});
		for (const mismatch of replay.mismatches) {
			findings.push({
				...tag,
				...mismatch,
				class: knownLegacyClass(stored, mismatch) ?? mismatch.class,
			});
		}
		for (const [noteClass, count] of Object.entries(replay.notes)) {
			notes[noteClass] = (notes[noteClass] ?? 0) + count;
		}
		if (replay.replayed) replayedStages.set(stage.id, replay.replayed);

		if (bracket && replay.seeding) {
			findings.push(
				...participantFindings({
					raw,
					bracketIdx: bracket.idx,
					stageId: stage.id,
					seeding: replay.seeding.filter((teamId) => teamId !== null),
				}).map((finding) => ({ ...tag, ...finding })),
			);
		}
	}

	findings.push(...standingsShiftFindings(raw, tournament));

	const replayedTournament = new Tournament({
		...raw,
		data: withReplayedStages(raw.data, replayedStages),
	});
	findings.push(...(await resultFindings(replayedTournament)));

	return {
		tournamentId,
		stageCount: raw.data.stage.length,
		matchCount: raw.data.match.length,
		findings,
		notes,
	};
}

/** Stored scores against the game result rows they are the count of. */
function scoreFindings(
	data: BracketData,
	games: Awaited<ReturnType<typeof Queries.gameResults>>,
): Finding[] {
	const result: Finding[] = [];
	const stageTypeById = new Map(
		data.stage.map((stage) => [stage.id, stage.type]),
	);
	const winsByMatchId = new Map<number, Map<number, number>>();
	for (const game of games) {
		const wins = winsByMatchId.get(game.matchId) ?? new Map<number, number>();
		winsByMatchId.set(game.matchId, wins);
		wins.set(game.winnerTeamId, (wins.get(game.winnerTeamId) ?? 0) + 1);
	}

	for (const match of data.match) {
		const wins = winsByMatchId.get(match.id) ?? new Map<number, number>();
		const tag = {
			stageId: match.stageId,
			stageType: stageTypeById.get(match.stageId),
			matchId: match.id,
		};

		const strangers = [...wins.keys()].filter(
			(teamId) =>
				teamId !== match.opponent1?.id && teamId !== match.opponent2?.id,
		);
		if (strangers.length > 0) {
			result.push({
				...tag,
				class: "stored:game-won-by-team-not-in-match",
				detail: `teams ${strangers.join(", ")}`,
			});
			continue;
		}

		const scores = [match.opponent1, match.opponent2].map(
			(opponent) => opponent?.score ?? 0,
		);
		const rows = [match.opponent1, match.opponent2].map((opponent) =>
			opponent?.id ? (wins.get(opponent.id) ?? 0) : 0,
		);
		if (scores[0] !== rows[0] || scores[1] !== rows[1]) {
			result.push({
				...tag,
				class: "stored:score-differs-from-game-rows",
				detail: `score ${scores.join("-")}, game rows ${rows.join("-")}`,
			});
		}
	}

	return result;
}

/** Teams and seeding the current code would start the bracket with against the ones it has. */
function participantFindings({
	raw,
	bracketIdx,
	stageId,
	seeding,
}: {
	raw: TournamentData;
	bracketIdx: number;
	stageId: number;
	seeding: number[];
}): Finding[] {
	// a team that played the bracket had not dropped out when it started
	const beforeStart = new Tournament({
		...raw,
		ctx: {
			...raw.ctx,
			teams: raw.ctx.teams.map((team) =>
				seeding.includes(team.id) ? { ...team, droppedOut: 0 } : team,
			),
		},
		data: {
			stage: raw.data.stage.filter((stage) => stage.id !== stageId),
			group: raw.data.group.filter((group) => group.stageId !== stageId),
			round: raw.data.round.filter((round) => round.stageId !== stageId),
			match: raw.data.match.filter((match) => match.stageId !== stageId),
		},
	});

	let expected: number[];
	try {
		const preview = beforeStart.bracketByIdx(bracketIdx);
		if (!preview?.preview) return [];
		expected = preview.previewSeeding ?? [];
	} catch (error) {
		return [{ class: "preview-threw", detail: String(error) }];
	}

	const kind = beforeStart.ctx.settings.bracketProgression[bracketIdx].sources
		? "advancement"
		: "starting";
	const teamById = new Map(raw.ctx.teams.map((team) => [team.id, team]));
	const describeTeams = (teamIds: number[]) =>
		teamIds
			.map((teamId) => {
				const team = teamById.get(teamId);
				return `${teamId}${team?.droppedOut ? " (dropped)" : ""}${team ? "" : " (not in tournament)"}`;
			})
			.join(", ");

	const notExpected = seeding.filter((teamId) => !expected.includes(teamId));
	const notPlaying = expected.filter((teamId) => !seeding.includes(teamId));
	if (notExpected.length > 0 || notPlaying.length > 0) {
		return [
			{
				class: `${kind}-teams`,
				detail: `plays but not expected: [${describeTeams(notExpected)}]; expected but not playing: [${describeTeams(notPlaying)}]`,
			},
		];
	}

	const firstDifference = seeding.findIndex(
		(teamId, i) => expected[i] !== teamId,
	);
	if (firstDifference === -1) return [];

	return [
		{
			class: `${kind}-seeding`,
			detail: `first difference at seed ${firstDifference + 1} of ${seeding.length}: has ${seeding[firstDifference]}, expected ${expected[firstDifference]}`,
		},
	];
}

/**
 * Standings of a bracket must not depend on a team dropping out after it advanced (issue #2869):
 * compares them with the standings had the teams playing a follow-up bracket never dropped.
 */
function standingsShiftFindings(
	raw: TournamentData,
	tournament: Tournament,
): Finding[] {
	const result: Finding[] = [];
	const startedBrackets = tournament.brackets.filter(
		(bracket) => !bracket.preview,
	);

	for (const bracket of startedBrackets) {
		const advancedTeamIds = new Set(
			startedBrackets
				.filter((candidate) =>
					candidate.sources?.some(
						(source) => source.bracketIdx === bracket.idx,
					),
				)
				.flatMap((candidate) => candidate.participantTournamentTeamIds),
		);
		const droppedAfterAdvancing = raw.ctx.teams.filter(
			(team) => team.droppedOut && advancedTeamIds.has(team.id),
		);
		if (droppedAfterAdvancing.length === 0) continue;

		const withoutLaterDrops = new Tournament({
			...raw,
			ctx: {
				...raw.ctx,
				teams: raw.ctx.teams.map((team) =>
					advancedTeamIds.has(team.id) ? { ...team, droppedOut: 0 } : team,
				),
			},
		});
		const order = (standings: Tournament["brackets"][number]["standings"]) =>
			standings.map((standing) => standing.team.id).join(",");

		if (
			order(bracket.standings) !==
			order(withoutLaterDrops.bracketByIdx(bracket.idx)!.standings)
		) {
			result.push({
				class: "standings-shifted-by-drop",
				stageId: bracket.id,
				stageType: bracket.type,
				detail: `teams ${droppedAfterAdvancing.map((team) => team.id).join(", ")} dropped out after advancing`,
			});
		}
	}

	return result;
}

/** The summary the current code computes at finalization against the stored result rows. */
async function resultFindings(tournament: Tournament): Promise<Finding[]> {
	const stored = await Queries.storedResults(tournament.ctx.id);
	if (stored.length === 0) return [];

	const noRating = () => {
		throw new Error("Ratings are not part of the comparison");
	};

	let summary: ReturnType<typeof tournamentSummary>;
	try {
		summary = tournamentSummary({
			teams: tournament.ctx.teams,
			finalStandings: Standings.flattenStandings(
				Standings.tournamentStandings(tournament),
			),
			results: await TournamentMatchRepository.findAllResultsByTournamentId(
				tournament.ctx.id,
			),
			calculateSeasonalStats: false,
			queryCurrentTeamRating: noRating,
			queryCurrentUserRating: noRating,
			queryTeamPlayerRatingAverage: noRating,
			queryCurrentSeedingRating: noRating,
			seedingSkillCountsFor: null,
			progression: tournament.ctx.settings.bracketProgression,
		});
	} catch (error) {
		return [{ class: "summary-threw", detail: String(error) }];
	}

	const result: Finding[] = [];
	const storedByUserId = new Map(stored.map((row) => [row.userId, row]));
	const computedUserIds = new Set<number>();
	const counts = {
		placement: [] as string[],
		participantCount: [] as string[],
		div: [] as string[],
		team: [] as string[],
		setResults: [] as string[],
		notStored: [] as string[],
		notComputed: [] as string[],
	};

	for (const computed of summary.tournamentResults) {
		const computedSets = summary.setResults.get(computed.userId);
		// same as `TournamentRepository.finalize`: a member who was not in the lineup of any set gets no row
		if (computedSets?.every((setResult) => !setResult)) continue;

		computedUserIds.add(computed.userId);
		const row = storedByUserId.get(computed.userId);
		if (!row) {
			counts.notStored.push(`user ${computed.userId}`);
			continue;
		}

		const describe = `user ${computed.userId} team ${computed.tournamentTeamId}`;
		if (row.tournamentTeamId !== computed.tournamentTeamId) {
			counts.team.push(`${describe}: stored team ${row.tournamentTeamId}`);
			continue;
		}
		if (row.placement !== computed.placement) {
			counts.placement.push(
				`${describe}: stored ${row.placement}, computed ${computed.placement}`,
			);
		}
		if (row.participantCount !== computed.participantCount) {
			counts.participantCount.push(
				`${describe}: stored ${row.participantCount}, computed ${computed.participantCount}`,
			);
		}
		if ((row.div ?? null) !== (computed.div ?? null)) {
			counts.div.push(
				`${describe}: stored ${row.div}, computed ${computed.div}`,
			);
		}

		if (JSON.stringify(row.setResults) !== JSON.stringify(computedSets ?? [])) {
			counts.setResults.push(
				`${describe}: stored ${JSON.stringify(row.setResults)}, computed ${JSON.stringify(computedSets ?? [])}`,
			);
		}
	}
	for (const row of stored) {
		if (!computedUserIds.has(row.userId)) {
			counts.notComputed.push(
				`user ${row.userId} team ${row.tournamentTeamId}`,
			);
		}
	}

	const classByKey: Record<keyof typeof counts, string> = {
		placement: "result-placement",
		participantCount: "result-participant-count",
		div: "result-div",
		team: "result-team",
		setResults: "result-set-results",
		notStored: "result-user-without-stored-row",
		notComputed: "result-stored-row-without-standing",
	};
	for (const [key, details] of Object.entries(counts)) {
		if (details.length === 0) continue;

		result.push({
			class: classByKey[key as keyof typeof counts],
			detail: `${details.length} users, e.g. ${details.slice(0, 3).join("; ")}`,
		});
	}

	return result;
}

/** Mismatches whose cause is a known shape of old data get a class of their own, see `TRIAGE`. */
function knownLegacyClass(
	stored: BracketData,
	mismatch: BracketReplay.Mismatch,
): string | null {
	const stage = stored.stage[0];

	if (
		mismatch.class === "structure" &&
		stage.type === "round_robin" &&
		"roundRobinMode" in stage.settings
	) {
		return "legacy-round-robin-layout";
	}

	if (
		stage.type !== "double_elimination" ||
		(mismatch.class !== "final-opponents" &&
			mismatch.class !== "result-on-unplayable-match")
	) {
		return null;
	}

	const match = stored.match.find(
		(candidate) => candidate.id === mismatch.matchId,
	);
	const finalsRounds = stored.round.filter(
		(round) => round.groupId === match?.groupId && round.section === "finals",
	);
	const isBracketReset =
		finalsRounds.find((round) => round.id === match?.roundId)?.number === 2;
	const firstFinal = stored.match.find(
		(candidate) =>
			candidate.roundId ===
			finalsRounds.find((round) => round.number === 1)?.id,
	);
	if (!isBracketReset || firstFinal?.winnerSide !== "opponent1") return null;

	return mismatch.class === "final-opponents"
		? "legacy-bracket-reset-filled"
		: "legacy-bracket-reset-played";
}

function stageData(data: BracketData, stageId: number): BracketData {
	return {
		stage: data.stage.filter((stage) => stage.id === stageId),
		group: data.group.filter((group) => group.stageId === stageId),
		round: data.round.filter((round) => round.stageId === stageId),
		match: data.match.filter((match) => match.stageId === stageId),
	};
}

/** Stored data with the matches of every replayed stage swapped in, keeping what only the database knows (KO counts). */
function withReplayedStages(
	data: BracketData,
	replayedStages: Map<number, BracketData>,
): BracketData {
	const replayedMatchById = new Map(
		[...replayedStages.values()].flatMap((stage) =>
			stage.match.map((match) => [match.id, match] as const),
		),
	);

	return {
		...data,
		match: data.match.map((stored) => {
			const replayed = replayedMatchById.get(stored.id);
			if (!replayed) return stored;

			const withKos = (side: "opponent1" | "opponent2") => {
				const opponent = replayed[side];
				if (!opponent) return opponent;

				return opponent.id === stored[side]?.id
					? { ...opponent, totalKos: stored[side]?.totalKos }
					: opponent;
			};

			return {
				...stored,
				opponent1: withKos("opponent1"),
				opponent2: withKos("opponent2"),
				winnerSide: replayed.winnerSide,
			};
		}),
	};
}
