import * as Engine from "../engine";
import { createResolved } from "../engine/create";
import { ordering } from "../engine/create/seeding";
import type {
	BracketData,
	MatchData,
	RoundData,
	Seeding,
	Side,
	StageSettings,
} from "../engine/types";

/** What a replayed stage can disagree with the given one about. */
type MismatchClass =
	/** The seeding the stage was created with can't be read back from its first round. */
	| "seeding-unrecoverable"
	/** `Engine.create` threw for the recovered seeding and settings. */
	| "create-threw"
	/** Groups, rounds or matches exist on one side only. */
	| "structure"
	/** A first round match starts with other teams than the given one has. */
	| "first-round-opponents"
	/** The teams the replay brought to a match are not the ones that played it. */
	| "opponents"
	/** Right teams, sides the other way around. */
	| "opponent-sides"
	/** A match has a result although the replay says it can't be played (a team missing or busy in an earlier round). */
	| "result-on-unplayable-match"
	/** The engine threw when the result was reported. */
	| "report-threw"
	/** The scores decide the set for the other team than the one marked as winner. */
	| "winner-contradicts-scores"
	/** The scores decide the set but no winner is marked. */
	| "decided-without-winner"
	/** After every result was fed a match still differs: its teams. */
	| "final-opponents"
	/** After every result was fed a match still differs: its scores. */
	| "final-score"
	/** After every result was fed a match still differs: its winner. */
	| "final-winner"
	/** After every result was fed a match still differs: its derived status. */
	| "final-status"
	/** Swiss: a round exists although the previous one has an unfinished match. */
	| "swiss-round-over-unfinished-round"
	/** Swiss: `generateRound` failed where a round exists. */
	| "swiss-generate-error"
	/** Swiss: the round was played by other teams than the engine would pair. */
	| "swiss-active-teams"
	/** Swiss: the round has more byes than the engine needs. */
	| "swiss-extra-byes"
	/** Swiss: the engine leaves more teams without a match than the round did. */
	| "swiss-engine-extra-byes"
	/** Swiss: the round has more rematches than the engine needs. */
	| "swiss-avoidable-rematch"
	/** Swiss: the engine pairs more rematches than the round needed. */
	| "swiss-engine-more-rematches"
	/** Swiss: the bye went to a team with more wins than the team the engine gives it to. */
	| "swiss-bye-above-lowest"
	/** Swiss: the engine gives the bye to a team with more wins than the round did. */
	| "swiss-engine-bye-above-lowest"
	/** Swiss: the bye went to a team that already had one although the engine finds a team without. */
	| "swiss-repeat-bye"
	/** Swiss: the engine gives a second bye although the round managed without. */
	| "swiss-engine-repeat-bye";

export interface Mismatch {
	class: MismatchClass;
	matchId?: number;
	detail: string;
}

/** Not mismatches: legitimate history worth counting. */
type NoteClass =
	/** Winner set without the scores deciding the set (organizer ended it, a team dropped out). */
	| "ended-early"
	/** A result older than the result of a match that feeds it: the feeding match was reopened and reported again. */
	| "reported-before-feeder"
	/** First round positions differ from the ones the engine assigns now (old seed ordering). */
	| "legacy-positions"
	/** Stage settings carry keys of the brackets-manager era. */
	| "legacy-settings"
	/** Round robin BYE matches of uneven groups, which the engine no longer creates. */
	| "legacy-round-robin-bye-match";

interface StageReplay {
	/** State after feeding every result, in the ids of the given data. `null` when the stage could not be rebuilt. */
	replayed: BracketData | null;
	seeding: Seeding | null;
	mismatches: Mismatch[];
	notes: Partial<Record<NoteClass, number>>;
}

interface ReplayOptions {
	/** Latest game result timestamp of each match that has one, the order results are fed in. */
	reportedAtByMatchId?: Map<number, number>;
	/** Needed to rebuild a round robin with A/B divisions. */
	abDivisionByTeamId?: Map<number, 0 | 1 | null>;
	/** Swiss early advance, from the bracket's progression settings. */
	advanceThreshold?: number;
	/** Skip the swiss pairing comparison (it is random, so not usable as a strict invariant). */
	skipSwissPairings?: boolean;
	/**
	 * Accept round robin results in rounds that are not playable yet. A running bracket gets there by
	 * design: dropping out ends every match of the team, and reopening an old match does not take back
	 * what its teams played since.
	 */
	roundRobinRoundsInAnyOrder?: boolean;
}

const LEGACY_SETTING_KEYS = [
	"size",
	"seedOrdering",
	"grandFinal",
	"roundRobinMode",
	"matchesChildCount",
];

/**
 * Rebuilds one stage from scratch: recovers its seeding, creates the bracket anew and feeds the
 * given results back through the engine in reported order (swiss rounds are paired with
 * `generateRound` and compared, then the given pairings are used). Returns where the replay and
 * the given data disagree.
 *
 * @param stored Data of exactly one stage.
 */
export function replayStage(
	stored: BracketData,
	options: ReplayOptions = {},
): StageReplay {
	const mismatches: Mismatch[] = [];
	const notes: StageReplay["notes"] = {};
	const note = (noteClass: NoteClass, count = 1) => {
		notes[noteClass] = (notes[noteClass] ?? 0) + count;
	};

	const stage = stored.stage[0];
	if (!stage || stored.stage.length !== 1) {
		throw new Error("replayStage: data of exactly one stage expected");
	}

	if (LEGACY_SETTING_KEYS.some((key) => key in (stage.settings as object))) {
		note("legacy-settings");
	}

	const seeding = seedingOf(stored);
	if (!seeding) {
		mismatches.push({
			class: "seeding-unrecoverable",
			detail: "first round opponents don't give a full seeding",
		});
		return { replayed: null, seeding: null, mismatches, notes };
	}

	let created: BracketData;
	try {
		created = createResolved({
			type: stage.type,
			seeding,
			settings: currentSettings(stage.settings),
			abDivisions: stage.settings.hasAbDivisions
				? (seeding.map(
						(teamId) => options.abDivisionByTeamId?.get(teamId!) ?? 0,
					) as (0 | 1)[])
				: undefined,
		});
	} catch (error) {
		mismatches.push({ class: "create-threw", detail: String(error) });
		return { replayed: null, seeding, mismatches, notes };
	}

	const rekeyed = withStoredIds(created, stored, mismatches, note);
	if (!rekeyed) return { replayed: null, seeding, mismatches, notes };

	let data = rekeyed;
	const storedMatchById = new Map(
		stored.match.map((match) => [match.id, match]),
	);
	const mismatchedMatchIds = new Set<number>();
	const mismatch = (entry: Mismatch) => {
		mismatches.push(entry);
		if (typeof entry.matchId === "number")
			mismatchedMatchIds.add(entry.matchId);
	};

	// created with nothing played: first round as given
	for (const match of data.match) {
		const storedMatch = storedMatchById.get(match.id);
		if (!storedMatch || !isFirstRound(stored, storedMatch)) continue;

		if (
			match.opponent1?.id !== storedMatch.opponent1?.id ||
			match.opponent2?.id !== storedMatch.opponent2?.id
		) {
			mismatch({
				class: "first-round-opponents",
				matchId: match.id,
				detail: `${describeOpponents(match)} created, ${describeOpponents(storedMatch)} given`,
			});
		} else if (
			match.opponent1?.position !== storedMatch.opponent1?.position ||
			match.opponent2?.position !== storedMatch.opponent2?.position
		) {
			note("legacy-positions");
		}
	}

	const feedPlayable = (roundIds?: Set<number>) => {
		const pending = new Set(
			stored.match
				.filter(
					(match) =>
						hasResult(match) &&
						(!roundIds || roundIds.has(match.roundId)) &&
						data.match.some((candidate) => candidate.id === match.id),
				)
				.map((match) => match.id),
		);
		const fedAt = new Map<number, number>();

		while (pending.size > 0) {
			const statuses = Engine.matchStatuses(data);
			const playable = [...pending]
				.filter((matchId) => statuses.get(matchId) === "STARTED")
				.map((matchId) => storedMatchById.get(matchId)!)
				.sort(
					(a, b) =>
						(options.reportedAtByMatchId?.get(a.id) ?? 0) -
							(options.reportedAtByMatchId?.get(b.id) ?? 0) ||
						a.roundId - b.roundId ||
						a.number - b.number,
				);

			const next = playable[0];
			if (!next) {
				const lockedByRound =
					stage.type === "round_robin" && options.roundRobinRoundsInAnyOrder
						? storedMatchById.get([...pending][0])
						: undefined;
				if (lockedByRound) {
					pending.delete(lockedByRound.id);
					data = {
						...data,
						match: data.match.map((match) =>
							match.id === lockedByRound.id
								? {
										...lockedByRound,
										opponent1: {
											...match.opponent1!,
											score: lockedByRound.opponent1?.score,
										},
										opponent2: {
											...match.opponent2!,
											score: lockedByRound.opponent2?.score,
										},
									}
								: match,
						),
					};
					continue;
				}

				for (const matchId of pending) {
					const current = data.match.find((match) => match.id === matchId)!;
					// decided by a BYE the same way on both sides
					if (statuses.get(matchId) === "COMPLETED") continue;

					mismatch({
						class: "result-on-unplayable-match",
						matchId,
						detail: `replay has ${describeOpponents(current)}, given ${describeOpponents(storedMatchById.get(matchId)!)}`,
					});
				}
				return;
			}
			pending.delete(next.id);

			const reportedAt = options.reportedAtByMatchId?.get(next.id);
			if (
				typeof reportedAt === "number" &&
				[...fedAt.values()].some((earlier) => earlier > reportedAt)
			) {
				note("reported-before-feeder");
			}
			if (typeof reportedAt === "number") fedAt.set(next.id, reportedAt);

			data = feedResult(data, next, { mismatch, note });
		}
	};

	if (stage.type === "swiss") {
		const roundNumbers = [
			...new Set(stored.round.map((round) => round.number)),
		].sort((a, b) => a - b);

		for (const roundNumber of roundNumbers) {
			const rounds = stored.round.filter(
				(round) => round.number === roundNumber,
			);

			if (roundNumber > 1) {
				for (const round of rounds) {
					data = pairSwissRound({ data, stored, round, options, mismatch });
				}
			}

			feedPlayable(new Set(rounds.map((round) => round.id)));
		}
	} else {
		feedPlayable();
	}

	const statuses = Engine.matchStatuses(data);
	const storedStatuses = Engine.matchStatuses(stored);
	for (const match of data.match) {
		const storedMatch = storedMatchById.get(match.id);
		if (!storedMatch || mismatchedMatchIds.has(match.id)) continue;

		if (
			match.opponent1?.id !== storedMatch.opponent1?.id ||
			match.opponent2?.id !== storedMatch.opponent2?.id ||
			(match.opponent1 === null) !== (storedMatch.opponent1 === null) ||
			(match.opponent2 === null) !== (storedMatch.opponent2 === null)
		) {
			mismatch({
				class: "final-opponents",
				matchId: match.id,
				detail: `replay has ${describeOpponents(match)}, given ${describeOpponents(storedMatch)}`,
			});
		} else if (
			match.opponent1?.score !== storedMatch.opponent1?.score ||
			match.opponent2?.score !== storedMatch.opponent2?.score
		) {
			mismatch({
				class: "final-score",
				matchId: match.id,
				detail: `replay has ${describeScores(match)}, given ${describeScores(storedMatch)}`,
			});
		} else if (match.winnerSide !== storedMatch.winnerSide) {
			mismatch({
				class: "final-winner",
				matchId: match.id,
				detail: `replay has ${match.winnerSide}, given ${storedMatch.winnerSide}`,
			});
		} else if (statuses.get(match.id) !== storedStatuses.get(match.id)) {
			mismatch({
				class: "final-status",
				matchId: match.id,
				detail: `replay has ${statuses.get(match.id)}, given ${storedStatuses.get(match.id)}`,
			});
		}
	}

	return { replayed: data, seeding, mismatches, notes };
}

/**
 * The seeding a stage was created with, read back from its first round. `null` = BYE; `null` as a
 * whole when it can't be recovered.
 */
function seedingOf(stored: BracketData): Seeding | null {
	const stage = stored.stage[0];
	if (!stage) return null;

	switch (stage.type) {
		case "swiss":
			return swissSeeding(stored);
		case "round_robin":
			return seedingByPosition(stored.match);
		case "single_elimination":
		case "double_elimination": {
			const firstRounds = stored.group.map((group) =>
				firstWinnersRoundMatches(stored, group.id),
			);
			if (firstRounds.some((matches) => matches.length === 0)) return null;
			if (stored.group.length > 1) return seedingByPosition(firstRounds.flat());

			return seedingByLayout(firstRounds[0]);
		}
	}
}

function feedResult(
	data: BracketData,
	stored: MatchData,
	report: {
		mismatch: (entry: Mismatch) => void;
		note: (noteClass: NoteClass) => void;
	},
): BracketData {
	const current = data.match.find((match) => match.id === stored.id)!;

	const sameSides =
		current.opponent1?.id === stored.opponent1?.id &&
		current.opponent2?.id === stored.opponent2?.id;
	const swappedSides =
		current.opponent1?.id === stored.opponent2?.id &&
		current.opponent2?.id === stored.opponent1?.id;

	if (!sameSides && !swappedSides) {
		report.mismatch({
			class: "opponents",
			matchId: stored.id,
			detail: `replay has ${describeOpponents(current)}, given ${describeOpponents(stored)}`,
		});
		return data;
	}
	if (swappedSides) {
		report.mismatch({
			class: "opponent-sides",
			matchId: stored.id,
			detail: `replay has ${describeOpponents(current)}, given ${describeOpponents(stored)}`,
		});
	}

	const bySide = <T>(pair: [T, T]): [T, T] =>
		swappedSides ? [pair[1], pair[0]] : pair;
	const storedWinnerSide: Side | null =
		stored.winnerSide && swappedSides
			? otherSide(stored.winnerSide)
			: stored.winnerSide;
	const hasScores =
		stored.opponent1?.score !== undefined ||
		stored.opponent2?.score !== undefined;

	try {
		let next = data;
		if (hasScores) {
			next = Engine.reportResult(next, {
				matchId: stored.id,
				scores: bySide([
					stored.opponent1?.score ?? 0,
					stored.opponent2?.score ?? 0,
				]),
			}).data;
		}

		const derivedWinnerSide =
			next.match.find((match) => match.id === stored.id)?.winnerSide ?? null;

		if (derivedWinnerSide === storedWinnerSide) return next;

		if (derivedWinnerSide && !storedWinnerSide) {
			report.mismatch({
				class: "decided-without-winner",
				matchId: stored.id,
				detail: `scores ${describeScores(stored)} decide the set`,
			});
			return next;
		}
		if (derivedWinnerSide && storedWinnerSide) {
			report.mismatch({
				class: "winner-contradicts-scores",
				matchId: stored.id,
				detail: `scores ${describeScores(stored)}, winner ${stored.winnerSide}`,
			});
		} else {
			report.note("ended-early");
		}

		return Engine.reportResult(next, {
			matchId: stored.id,
			winnerSide: storedWinnerSide!,
		}).data;
	} catch (error) {
		report.mismatch({
			class: "report-threw",
			matchId: stored.id,
			detail: String(error),
		});
		return data;
	}
}

/** Compares what `generateRound` pairs with the given round, then continues with the given pairings. */
function pairSwissRound({
	data,
	stored,
	round,
	options,
	mismatch,
}: {
	data: BracketData;
	stored: BracketData;
	round: RoundData;
	options: ReplayOptions;
	mismatch: (entry: Mismatch) => void;
}): BracketData {
	const storedMatches = stored.match
		.filter((match) => match.roundId === round.id)
		.sort((a, b) => a.number - b.number);
	if (storedMatches.length === 0) return data;

	const withRound: BracketData = {
		...data,
		match: [
			...data.match,
			...storedMatches.map((match) => ({
				...match,
				opponent1: match.opponent1 && { id: match.opponent1.id },
				opponent2: match.opponent2 && { id: match.opponent2.id },
				winnerSide: null,
				startedAt: undefined,
			})),
		],
	};
	if (options.skipSwissPairings) return withRound;

	const describeRound = `group ${round.groupId} round ${round.number}`;
	const groupMatches = data.match.filter(
		(match) => match.groupId === round.groupId,
	);

	if (
		groupMatches.some(
			(match) => match.opponent1 && match.opponent2 && !match.winnerSide,
		)
	) {
		mismatch({
			class: "swiss-round-over-unfinished-round",
			detail: describeRound,
		});
		return withRound;
	}

	const record = swissRecords(groupMatches);
	const roundTeamIds = new Set(
		storedMatches.flatMap((match) =>
			[match.opponent1?.id, match.opponent2?.id].filter(
				(id): id is number => typeof id === "number",
			),
		),
	);

	const generated = Engine.generateRound(data, {
		groupId: round.groupId,
		standings: [...record.entries()].map(([teamId, stats]) => ({
			team: { id: teamId, droppedOut: !roundTeamIds.has(teamId) },
			stats: { setWins: stats.wins, setLosses: stats.losses },
		})),
		settings: { advanceThreshold: options.advanceThreshold },
	});
	if (!generated.ok) {
		mismatch({
			class: "swiss-generate-error",
			detail: `${describeRound}: ${generated.error}`,
		});
		return withRound;
	}

	const generatedTeamIds = new Set(
		generated.value.matches.flatMap((match) =>
			[match.opponent1?.id, match.opponent2?.id].filter(
				(id): id is number => typeof id === "number",
			),
		),
	);
	if (
		generatedTeamIds.size !== roundTeamIds.size ||
		[...roundTeamIds].some((teamId) => !generatedTeamIds.has(teamId))
	) {
		mismatch({
			class: "swiss-active-teams",
			detail: `${describeRound}: engine pairs ${generatedTeamIds.size} teams, ${roundTeamIds.size} played`,
		});
		return withRound;
	}

	const given = pairingQuality(storedMatches, groupMatches, record);
	const engine = pairingQuality(generated.value.matches, groupMatches, record);

	// in the order the engine weighs them, so only the first difference tells who paired better
	const comparisons: Array<
		[keyof PairingQuality, MismatchClass, MismatchClass]
	> = [
		["byes", "swiss-extra-byes", "swiss-engine-extra-byes"],
		["rematches", "swiss-avoidable-rematch", "swiss-engine-more-rematches"],
		["repeatByes", "swiss-repeat-bye", "swiss-engine-repeat-bye"],
		["byeWins", "swiss-bye-above-lowest", "swiss-engine-bye-above-lowest"],
	];
	for (const [key, givenWorse, engineWorse] of comparisons) {
		if (given[key] === engine[key]) continue;

		mismatch({
			class: given[key] > engine[key] ? givenWorse : engineWorse,
			detail: `${describeRound}: given ${given[key]}, engine ${engine[key]}`,
		});
		break;
	}

	return withRound;
}

interface PairingQuality {
	byes: number;
	/** Earlier meetings of the paired teams, a pair that met twice counting twice. */
	rematches: number;
	/** Byes to teams that already had one. */
	repeatByes: number;
	/** Most wins among the teams that got a bye, -1 without a bye. */
	byeWins: number;
}

function pairingQuality(
	pairs: Array<{
		opponent1: { id: number | null } | null;
		opponent2: { id: number | null } | null;
	}>,
	earlierMatches: MatchData[],
	record: Map<number, { wins: number; losses: number }>,
): PairingQuality {
	const meetings = new Map<string, number>();
	const hadBye = new Set<number>();
	for (const match of earlierMatches) {
		if (match.opponent1?.id && match.opponent2?.id) {
			const key = pairKey(match.opponent1.id, match.opponent2.id);
			meetings.set(key, (meetings.get(key) ?? 0) + 1);
		} else if (match.opponent1?.id) {
			hadBye.add(match.opponent1.id);
		}
	}

	const result: PairingQuality = {
		byes: 0,
		rematches: 0,
		repeatByes: 0,
		byeWins: -1,
	};
	for (const pair of pairs) {
		const oneId = pair.opponent1?.id;
		const twoId = pair.opponent2?.id;

		if (oneId && twoId) {
			result.rematches += meetings.get(pairKey(oneId, twoId)) ?? 0;
			continue;
		}

		const byeTeamId = oneId ?? twoId;
		if (!byeTeamId) continue;
		result.byes++;
		if (hadBye.has(byeTeamId)) result.repeatByes++;
		result.byeWins = Math.max(result.byeWins, record.get(byeTeamId)?.wins ?? 0);
	}

	return result;
}

/** Set wins and losses of every team of the matches, a bye counting as a win. */
export function swissRecords(matches: MatchData[]) {
	const result = new Map<number, { wins: number; losses: number }>();
	const recordOf = (teamId: number) => {
		const existing = result.get(teamId);
		if (existing) return existing;

		const created = { wins: 0, losses: 0 };
		result.set(teamId, created);
		return created;
	};

	for (const match of matches) {
		const oneId = match.opponent1?.id;
		const twoId = match.opponent2?.id;

		if (oneId && twoId) {
			const one = recordOf(oneId);
			const two = recordOf(twoId);
			if (!match.winnerSide) continue;

			(match.winnerSide === "opponent1" ? one : two).wins++;
			(match.winnerSide === "opponent1" ? two : one).losses++;
		} else if (oneId ?? twoId) {
			recordOf((oneId ?? twoId)!).wins++;
		}
	}

	return result;
}

/** Created data with the ids of the given data, matched by group number, section, round number and match number. */
function withStoredIds(
	created: BracketData,
	stored: BracketData,
	mismatches: Mismatch[],
	note: (noteClass: NoteClass) => void,
): BracketData | null {
	const storedStage = stored.stage[0];
	const isSwiss = storedStage.type === "swiss";
	const isRoundRobin = storedStage.type === "round_robin";

	const storedGroupByNumber = new Map(
		stored.group.map((group) => [group.number, group]),
	);
	const groupNumberById = (data: BracketData) =>
		new Map(data.group.map((group) => [group.id, group.number]));
	const createdGroupNumbers = groupNumberById(created);
	const storedGroupNumbers = groupNumberById(stored);

	const roundKey = (round: RoundData, groupNumbers: Map<number, number>) =>
		`group ${groupNumbers.get(round.groupId)} ${round.section ?? "round"} ${round.number}`;
	const storedRoundByKey = new Map(
		stored.round.map((round) => [roundKey(round, storedGroupNumbers), round]),
	);
	const createdRoundKeys = new Set(
		created.round.map((round) => roundKey(round, createdGroupNumbers)),
	);

	const structure: string[] = [];
	for (const group of created.group) {
		if (!storedGroupByNumber.has(group.number)) {
			structure.push(`group ${group.number} only created`);
		}
	}
	if (stored.group.length > created.group.length) {
		structure.push(
			`${stored.group.length} groups given, ${created.group.length} created`,
		);
	}
	for (const key of createdRoundKeys) {
		if (!storedRoundByKey.has(key)) structure.push(`${key} only created`);
	}
	for (const key of storedRoundByKey.keys()) {
		if (!createdRoundKeys.has(key)) structure.push(`${key} only given`);
	}

	const createdRoundById = new Map(
		created.round.map((round) => [round.id, round]),
	);
	const storedRoundById = new Map(
		stored.round.map((round) => [round.id, round]),
	);
	const matchKey = (
		match: MatchData,
		roundById: Map<number, RoundData>,
		groupNumbers: Map<number, number>,
	) =>
		// match numbers of old uneven round robin groups are off by the BYE match, the pairing is not
		isRoundRobin
			? `${roundKey(roundById.get(match.roundId)!, groupNumbers)} teams ${[match.opponent1?.id ?? 0, match.opponent2?.id ?? 0].sort((a, b) => a - b).join(" & ")}`
			: `${roundKey(roundById.get(match.roundId)!, groupNumbers)} match ${match.number}`;
	const storedMatchByKey = new Map<string, MatchData>();
	for (const match of stored.match) {
		if (isRoundRobin && (!match.opponent1 || !match.opponent2)) {
			note("legacy-round-robin-bye-match");
			continue;
		}

		storedMatchByKey.set(
			matchKey(match, storedRoundById, storedGroupNumbers),
			match,
		);
	}
	const createdMatchKeys = new Set(
		created.match.map((match) =>
			matchKey(match, createdRoundById, createdGroupNumbers),
		),
	);
	for (const key of createdMatchKeys) {
		if (!storedMatchByKey.has(key)) structure.push(`${key} only created`);
	}
	for (const [key, match] of storedMatchByKey) {
		if (createdMatchKeys.has(key)) continue;
		// swiss rounds after the first are paired as the bracket is played
		if (isSwiss && storedRoundById.get(match.roundId)!.number > 1) continue;

		structure.push(`${key} only given`);
	}

	if (structure.length > 0) {
		mismatches.push({
			class: "structure",
			detail: `${structure.slice(0, 5).join("; ")}${structure.length > 5 ? ` (+${structure.length - 5} more)` : ""}`,
		});
		return null;
	}

	return {
		stage: [
			{ ...created.stage[0], id: storedStage.id, name: storedStage.name },
		],
		group: created.group.map((group) => ({
			...group,
			id: storedGroupByNumber.get(group.number)!.id,
			stageId: storedStage.id,
		})),
		round: created.round.map((round) => {
			const storedRound = storedRoundByKey.get(
				roundKey(round, createdGroupNumbers),
			)!;

			return {
				...round,
				id: storedRound.id,
				stageId: storedStage.id,
				groupId: storedRound.groupId,
				maps: storedRound.maps,
			};
		}),
		match: created.match.map((match) => {
			const storedMatch = storedMatchByKey.get(
				matchKey(match, createdRoundById, createdGroupNumbers),
			)!;

			return {
				...match,
				id: storedMatch.id,
				stageId: storedStage.id,
				groupId: storedMatch.groupId,
				roundId: storedMatch.roundId,
			};
		}),
	};
}

/** Settings without the keys of the brackets-manager era, which the engine no longer reads. */
function currentSettings(settings: StageSettings): StageSettings {
	return Object.fromEntries(
		Object.entries(settings).filter(
			([key]) => !LEGACY_SETTING_KEYS.includes(key),
		),
	);
}

function seedingByPosition(matches: MatchData[]): Seeding | null {
	const teamIdByPosition = new Map<number, number>();
	for (const match of matches) {
		for (const opponent of [match.opponent1, match.opponent2]) {
			if (!opponent?.id) continue;
			if (typeof opponent.position !== "number") return null;

			const existing = teamIdByPosition.get(opponent.position);
			if (existing !== undefined && existing !== opponent.id) return null;
			teamIdByPosition.set(opponent.position, opponent.id);
		}
	}
	if (teamIdByPosition.size === 0) return null;

	const result: Seeding = [];
	for (
		let position = 1;
		position <= Math.max(...teamIdByPosition.keys());
		position++
	) {
		const teamId = teamIdByPosition.get(position);
		if (teamId === undefined) return null;
		result.push(teamId);
	}

	return result;
}

/** Inverse of the first round seed ordering of a single group elimination bracket. */
function seedingByLayout(firstRoundMatches: MatchData[]): Seeding | null {
	const slots = firstRoundMatches.flatMap((match) => [
		match.opponent1?.id ?? null,
		match.opponent2?.id ?? null,
	]);
	if (!Number.isInteger(Math.log2(slots.length))) return null;
	if (slots.length === 2) return slots;

	const seedOfSlot = ordering.space_between(slots.map((_, i) => i));
	const result: Seeding = slots.map(() => null);
	for (const [slotIdx, seedIdx] of seedOfSlot.entries()) {
		result[seedIdx] = slots[slotIdx];
	}

	return result;
}

function swissSeeding(stored: BracketData): Seeding | null {
	const groups = stored.group
		.slice()
		.sort((a, b) => a.number - b.number)
		.map((group) => {
			const firstRound = stored.round.find(
				(round) => round.groupId === group.id && round.number === 1,
			);
			const matches = stored.match
				.filter((match) => match.roundId === firstRound?.id)
				.sort((a, b) => a.number - b.number);

			const paired = matches.filter((match) => match.opponent2);
			const bye = matches.find((match) => !match.opponent2);

			return [
				...paired.map((match) => match.opponent1?.id),
				...paired.map((match) => match.opponent2?.id),
				...(bye ? [bye.opponent1?.id] : []),
			];
		});

	const result: Seeding = [];
	const teamCount = groups.reduce((sum, group) => sum + group.length, 0);
	for (let i = 0; i < teamCount; i++) {
		const teamId = groups[i % groups.length]?.[Math.floor(i / groups.length)];
		if (typeof teamId !== "number") return null;
		result.push(teamId);
	}

	return result;
}

function firstWinnersRoundMatches(stored: BracketData, groupId: number) {
	const round = stored.round.find(
		(candidate) =>
			candidate.groupId === groupId &&
			candidate.section === "winners" &&
			candidate.number === 1,
	);

	return stored.match
		.filter((match) => match.roundId === round?.id)
		.sort((a, b) => a.number - b.number);
}

function isFirstRound(stored: BracketData, match: MatchData) {
	const round = stored.round.find(
		(candidate) => candidate.id === match.roundId,
	);
	if (round?.number !== 1) return false;

	return round.section === null || round.section === "winners";
}

function hasResult(match: MatchData) {
	if (!match.opponent1 || !match.opponent2) return false;

	return (
		Boolean(match.winnerSide) ||
		match.opponent1.score !== undefined ||
		match.opponent2.score !== undefined
	);
}

function otherSide(side: Side): Side {
	return side === "opponent1" ? "opponent2" : "opponent1";
}

function pairKey(oneId: number, twoId: number) {
	return oneId < twoId ? `${oneId}-${twoId}` : `${twoId}-${oneId}`;
}

function describeOpponents(match: MatchData) {
	const describe = (opponent: MatchData["opponent1"]) =>
		opponent === null ? "BYE" : (opponent.id ?? "TBD");

	return `${describe(match.opponent1)} vs ${describe(match.opponent2)}`;
}

function describeScores(match: MatchData) {
	return `${match.opponent1?.score ?? "-"}-${match.opponent2?.score ?? "-"}`;
}
