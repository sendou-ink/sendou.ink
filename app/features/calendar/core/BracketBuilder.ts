import * as R from "remeda";
import type { SkippableRound } from "~/db/tables-json";
import * as Engine from "~/features/tournament-bracket/core/engine";
import * as Progression from "~/features/tournament-bracket/core/Progression";
import * as SkippedRounds from "~/features/tournament-bracket/core/SkippedRounds";
import {
	type BracketFormValue,
	newBracketFormValue,
	newProgressionSource,
	type ProgressionFormValue,
	type ProgressionSourceFormValue,
	sourceBracketHasEarlyAdvance,
} from "../calendar-progression-form";

/** Without knowing the team count tiers are listed for up to this big brackets, "and everyone below" covers the rest. */
const LARGEST_ROUND_LISTED = 64;
const DOUBLE_ELIMINATION_TIERS_LISTED = 10;

/** The `brackets` + `progression` form values the builder edits. */
export interface BuilderValues {
	brackets: BracketFormValue[];
	progression: ProgressionFormValue[];
}

/** A line of the builder: teams of `fromIdx` moving on to `toIdx`, stored as the `sourceIdx`th source of the destination. */
export interface Connection {
	fromIdx: number;
	toIdx: number;
	sourceIdx: number;
	placements: string;
}

/** One setting shown on a bracket card, see {@link cardFacts}. */
export type CardFact =
	| { type: "GROUPS"; count: number }
	| { type: "TEAMS_PER_GROUP"; count: number }
	| { type: "AB_DIVISIONS" }
	| { type: "ROUNDS"; count: number }
	| { type: "EARLY_ADVANCE"; wins: number }
	| { type: "SKIPPED"; round: SkippableRound };

/** Reason a connection could not be made, see {@link connect}. */
export type ConnectError =
	| "SAME_BRACKET"
	| "FIRST_BRACKET"
	| "EARLIER_BRACKET"
	| "CYCLE";

/** A group of teams of a bracket sharing a placement, e.g. both semifinal losers of a single elimination bracket. */
export interface PlacementTier {
	placement: number;
	kind:
		| "WON_FINAL"
		| "LOST_FINAL"
		| "WON_THIRD_PLACE_MATCH"
		| "LOST_THIRD_PLACE_MATCH"
		| "LOST_SEMIFINALS"
		| "LOST_QUARTERFINALS"
		| "LOST_ROUND_OF"
		| "WON_GRAND_FINALS"
		| "LOST_GRAND_FINALS"
		| "LOST_LOSERS_FINAL"
		| "LOST_LOSERS_SEMIFINAL"
		| "OUT_IN_LOSERS_BRACKET"
		| "GROUP_PLACEMENT"
		| "STILL_IN"
		| "UNBEATEN"
		| "ALIVE_WITH_ONE_LOSS";
	/** Most teams sharing the placement, in round robin per group. */
	maxTeams: number;
	/** (Elimination split into groups) Most teams sharing the placement in one group. */
	maxTeamsPerGroup?: number;
	/** For `LOST_ROUND_OF`, e.g. 16 for the round of 16. */
	roundOf?: number;
}

/** A bracket without sources, teams join it from sign-up. The first bracket always is one. */
export function isStartingBracket(values: BuilderValues, bracketIdx: number) {
	return (
		bracketIdx === 0 || values.progression[bracketIdx]?.source !== "BRACKET"
	);
}

/** Every line of the builder. Sources pointing to a non-existent bracket are left out, the schema reports them. */
export function connections(values: BuilderValues): Connection[] {
	return values.progression.flatMap((entry, toIdx) => {
		if (isStartingBracket(values, toIdx)) return [];

		return entry.sources.flatMap((source, sourceIdx) => {
			const fromIdx = Number(source.bracketIdx);
			if (
				!Number.isInteger(fromIdx) ||
				fromIdx < 0 ||
				fromIdx >= values.brackets.length ||
				fromIdx === toIdx
			) {
				return [];
			}

			return [
				{ fromIdx, toIdx, sourceIdx, placements: source.placements ?? "" },
			];
		});
	});
}

/**
 * Builder column of every bracket: starting brackets 0, follow-ups right of all their sources.
 * `minColumns` keeps a follow-up where it was dropped even before it has any lines.
 */
export function columns(
	values: BuilderValues,
	minColumns: ReadonlyArray<number | undefined> = [],
): number[] {
	const lines = connections(values);
	const result = new Map<number, number>();

	const columnOf = (bracketIdx: number, path: Set<number>): number => {
		const cached = result.get(bracketIdx);
		if (cached !== undefined) return cached;
		if (isStartingBracket(values, bracketIdx)) return 0;
		// only possible with an invalid progression the schema reports
		if (path.has(bracketIdx)) return 1;

		const sourceColumns = lines
			.filter((line) => line.toIdx === bracketIdx)
			.map((line) => columnOf(line.fromIdx, new Set(path).add(bracketIdx)));

		const column = Math.max(
			1,
			minColumns[bracketIdx] ?? 1,
			...sourceColumns.map((sourceColumn) => sourceColumn + 1),
		);
		result.set(bracketIdx, column);
		return column;
	};

	return values.brackets.map((_, bracketIdx) =>
		columnOf(bracketIdx, new Set()),
	);
}

/**
 * Appends a new bracket to the last column holding follow-ups, or to the first follow-up column if there are none.
 * Returned `column` is where it goes, it has no lines yet to place it there. Without brackets it becomes the first, starting, one.
 */
export function addBracket(
	values: BuilderValues,
	name: string,
	minColumns: ReadonlyArray<number | undefined> = [],
): { values: BuilderValues; column: number } {
	const brackets = [...values.brackets, { ...newBracketFormValue(), name }];

	if (values.brackets.length === 0) {
		return { values: { brackets, progression: [signUpEntry()] }, column: 0 };
	}

	return {
		values: {
			brackets,
			progression: [...values.progression, { source: "BRACKET", sources: [] }],
		},
		column: Math.max(1, ...columns(values, minColumns)),
	};
}

/**
 * Moves a bracket to a column, the first one making it a starting bracket. Lines from brackets that would no
 * longer be on its left are removed, the count of them is returned. The first bracket always stays a starting bracket.
 */
export function moveToColumn(
	values: BuilderValues,
	bracketIdx: number,
	column: number,
	minColumns: ReadonlyArray<number | undefined> = [],
): { values: BuilderValues; removedConnectionCount: number } {
	if (bracketIdx === 0) return { values, removedConnectionCount: 0 };

	const incoming = connections(values).filter(
		(line) => line.toIdx === bracketIdx,
	);

	if (column === 0) {
		return {
			values: withProgressionEntry(values, bracketIdx, signUpEntry()),
			removedConnectionCount: incoming.length,
		};
	}

	const currentColumns = columns(values, minColumns);
	const keptSources = incoming
		.filter((line) => currentColumns[line.fromIdx] < column)
		.map((line) => values.progression[bracketIdx].sources[line.sourceIdx]);

	return {
		values: withProgressionEntry(values, bracketIdx, {
			source: "BRACKET",
			sources: keptSources,
		}),
		removedConnectionCount: incoming.length - keptSources.length,
	};
}

/**
 * Why teams of `fromIdx` can't be sent on to `toIdx`, or null if they can. Lines go from left to right, so the
 * destination has to be in the same column (it then moves right) or a later one.
 */
export function connectError(
	values: BuilderValues,
	fromIdx: number,
	toIdx: number,
	minColumns: ReadonlyArray<number | undefined> = [],
): ConnectError | null {
	if (fromIdx === toIdx) return "SAME_BRACKET";
	if (toIdx === 0) return "FIRST_BRACKET";

	const bracketColumns = columns(values, minColumns);
	if (bracketColumns[toIdx] < bracketColumns[fromIdx]) return "EARLIER_BRACKET";
	if (reaches(values, toIdx, fromIdx)) return "CYCLE";

	return null;
}

/** Sends teams of `fromIdx` on to `toIdx`, preselecting the next placements no other line from `fromIdx` takes. */
export function connect(
	values: BuilderValues,
	fromIdx: number,
	toIdx: number,
	minColumns: ReadonlyArray<number | undefined> = [],
): { values: BuilderValues; error?: ConnectError } {
	const error = connectError(values, fromIdx, toIdx, minColumns);
	if (error) return { values, error };

	const existing = connections(values).find(
		(line) => line.fromIdx === fromIdx && line.toIdx === toIdx,
	);
	if (existing) return { values };

	const keptSources = isStartingBracket(values, toIdx)
		? []
		: values.progression[toIdx].sources;

	return {
		values: withProgressionEntry(values, toIdx, {
			source: "BRACKET",
			sources: [
				...keptSources,
				{
					bracketIdx: String(fromIdx),
					placements: defaultPlacements(values, fromIdx),
				},
			],
		}),
	};
}

/** Removes a line. The destination stays a follow-up, without sources until it gets a new line. */
export function disconnect(
	values: BuilderValues,
	toIdx: number,
	sourceIdx: number,
): BuilderValues {
	const entry = values.progression[toIdx];
	if (entry?.source !== "BRACKET") return values;

	return withProgressionEntry(values, toIdx, {
		source: "BRACKET",
		sources: entry.sources.filter((_, idx) => idx !== sourceIdx),
	});
}

/** Deletes a bracket with its lines, shifting the source indexes of the brackets after it. The first bracket can't be deleted. */
export function removeBracket(
	values: BuilderValues,
	bracketIdx: number,
): BuilderValues {
	if (bracketIdx === 0) return values;

	return {
		brackets: values.brackets.filter((_, idx) => idx !== bracketIdx),
		progression: values.progression
			.filter((_, idx) => idx !== bracketIdx)
			.map((entry) => {
				if (entry.source !== "BRACKET") return signUpEntry();

				return {
					source: "BRACKET",
					sources: entry.sources
						.filter((source) => Number(source.bracketIdx) !== bracketIdx)
						.map((source) => {
							const sourceIdx = Number(source.bracketIdx);
							return sourceIdx > bracketIdx
								? { ...source, bracketIdx: String(sourceIdx - 1) }
								: source;
						}),
				};
			}),
	};
}

/**
 * Drops placements of lines their source bracket no longer has, e.g. a 4th place after its groups shrunk to 3
 * or knocked out teams after it changed to round robin. A line left with none gets the default picks instead.
 * Returns `values` as is when every placement still exists.
 */
export function fitPlacementsToSources(values: BuilderValues): BuilderValues {
	let result = values;

	// fitting a line can change how many teams later brackets get and so what placements they have, hence the passes
	for (let pass = 0; pass <= values.brackets.length; pass++) {
		const maxTeams = maxTeamCounts(result);
		let hasChanged = false;

		for (const line of connections(result)) {
			const fitted = fittedPlacements(result, line, maxTeams[line.fromIdx]);
			if (fitted === line.placements) continue;

			result = withLinePlacements(result, line, fitted);
			hasChanged = true;
		}

		if (!hasChanged) break;
	}

	return result;
}

/** Placements of `fromIdx` a new line takes by default: the top ones, or the next ones after what other lines already take. */
export function defaultPlacements(
	values: BuilderValues,
	fromIdx: number,
): string {
	const bracket = values.brackets[fromIdx];
	if (
		sourceBracketHasEarlyAdvance(values.brackets, {
			bracketIdx: String(fromIdx),
			placements: "",
		})
	) {
		return "";
	}

	const taken = connections(values)
		.filter((line) => line.fromIdx === fromIdx)
		.map((line) => Progression.parsePlacements(line.placements));
	if (taken.some((parsed) => parsed?.rest)) return "";

	const highestTaken = Math.max(
		0,
		...taken.flatMap((parsed) =>
			(parsed?.placements ?? []).filter((placement) => placement > 0),
		),
	);
	const next = highestTaken + 1;

	switch (bracket.type) {
		case "round_robin": {
			const last = Math.min(next + 1, Number(bracket.teamsPerGroup));
			if (next > last) return "";

			return Progression.placementsToString(R.range(next, last + 1));
		}
		case "swiss":
			return `${next}-${next + 7}`;
		default: {
			if (highestTaken > 0) return `${next}+`;
			if (
				bracket.skippedRounds.some((round) => round !== "THIRD_PLACE_MATCH")
			) {
				return "1";
			}

			const topFourTierCount =
				bracket.type === "single_elimination" && !hasThirdPlaceMatch(bracket)
					? 3
					: 4;
			return `1-${topFourTierCount}`;
		}
	}
}

/**
 * Placement tiers of a bracket a line can pick from. Placements of the progression count these tiers,
 * not team positions: in single elimination without a third place match `3` means both semifinal losers.
 * Swiss lists none, its standings are picked as a range. `maxTeams` limits elimination tiers to what fits.
 */
export function placementTiers(
	bracket: BracketFormValue,
	maxTeams: number | null = null,
): PlacementTier[] {
	switch (bracket.type) {
		case "round_robin":
			return R.range(1, Number(bracket.teamsPerGroup) + 1).map((placement) => ({
				placement,
				kind: "GROUP_PLACEMENT",
				maxTeams: 1,
			}));
		case "swiss":
			return [];
		case "single_elimination":
		case "double_elimination": {
			const tiers =
				bracket.type === "single_elimination"
					? singleEliminationTiers(bracket)
					: doubleEliminationTiers(bracket);
			if (!isGrouped(bracket)) return limitToTeamCount(tiers, maxTeams);

			const groupCount =
				maxTeams === null
					? Number(bracket.eliminationGroupCount)
					: Engine.eliminationGroupCount(
							{ groupCount: Number(bracket.eliminationGroupCount) },
							maxTeams,
						);
			const groupTiers = limitToTeamCount(
				tiers,
				maxTeams === null ? null : Math.ceil(maxTeams / groupCount),
			);

			return limitToTeamCount(
				groupTiers.map((tier) => ({
					...tier,
					maxTeams: tier.maxTeams * groupCount,
					maxTeamsPerGroup: tier.maxTeams,
				})),
				maxTeams,
			);
		}
	}
}

/**
 * Fewest teams a bracket (or a group of it) needs for any match to be played with its rounds skipped,
 * e.g. skipping the semifinals of single elimination leaves nothing to play for four teams.
 */
export function fewestTeamsWithMatches(bracket: BracketFormValue): number {
	if (
		bracket.type !== "single_elimination" &&
		bracket.type !== "double_elimination"
	) {
		return 2;
	}

	const skipped = SkippedRounds.normalized(bracket.type, bracket.skippedRounds);

	if (skipped.includes("SEMIS")) return 5;
	if (skipped.includes("FINALS") || skipped.includes("WB_FINALS")) return 3;

	return 2;
}

/** Single or double elimination split into groups. */
export function isGrouped(bracket: BracketFormValue) {
	return (
		(bracket.type === "single_elimination" ||
			bracket.type === "double_elimination") &&
		Number(bracket.eliminationGroupCount) > 1
	);
}

/**
 * Settings of a bracket worth showing on its card: the shape of its format and rounds left unplayed.
 * A skipped round is listed only when the rounds it depends on are played, skipping the semifinals says
 * enough without the finals.
 */
export function cardFacts(
	bracket: BracketFormValue,
	{ isStarting }: { isStarting: boolean },
): CardFact[] {
	switch (bracket.type) {
		case "round_robin":
			return [
				{ type: "TEAMS_PER_GROUP", count: Number(bracket.teamsPerGroup) },
				...(isStarting && bracket.hasAbDivisions
					? [{ type: "AB_DIVISIONS" } as const]
					: []),
			];
		case "swiss":
			return [
				...(Number(bracket.groupCount) > 1
					? [{ type: "GROUPS", count: Number(bracket.groupCount) } as const]
					: []),
				{ type: "ROUNDS", count: Number(bracket.roundCount) },
				...(bracket.earlyAdvance
					? [
							{
								type: "EARLY_ADVANCE",
								wins: Number(bracket.advanceThreshold),
							} as const,
						]
					: []),
			];
		case "single_elimination":
		case "double_elimination": {
			const skipped = SkippedRounds.normalized(
				bracket.type,
				bracket.skippedRounds,
			);

			return [
				...(isGrouped(bracket)
					? [
							{
								type: "GROUPS",
								count: Number(bracket.eliminationGroupCount),
							} as const,
						]
					: []),
				...skipped
					.filter((round) =>
						SkippedRounds.prerequisitesOf(round).every(
							(prerequisite) => !skipped.includes(prerequisite),
						),
					)
					.map((round) => ({ type: "SKIPPED", round }) as const),
			];
		}
	}
}

/** Losers rounds an "knocked out early" line can take, `-1` being the first round. */
export function knockedOutRoundOptions(bracket: BracketFormValue) {
	return bracket.type === "single_elimination" ||
		bracket.type === "double_elimination"
		? [1, 2, 3]
		: [];
}

/**
 * Most teams each bracket can get, or null when it depends on how many teams sign up. A follow-up fed the
 * top 8 of another bracket gets at most 8, one fed group winners as many as there end up being groups.
 */
export function maxTeamCounts(values: BuilderValues): Array<number | null> {
	const lines = connections(values);
	const result = new Map<number, number | null>();

	const maxOf = (bracketIdx: number, path: Set<number>): number | null => {
		if (result.has(bracketIdx)) return result.get(bracketIdx)!;
		if (isStartingBracket(values, bracketIdx) || path.has(bracketIdx)) {
			return null;
		}

		const incoming = lines.filter((line) => line.toIdx === bracketIdx);
		if (incoming.length === 0) return null;

		let total = 0;
		for (const line of incoming) {
			const sourceMax = maxOf(line.fromIdx, new Set(path).add(bracketIdx));
			const advancing = maxAdvancing(values, line, sourceMax);
			if (advancing === null) {
				result.set(bracketIdx, null);
				return null;
			}
			total += advancing;
		}

		result.set(bracketIdx, total);
		return total;
	};

	return values.brackets.map((_, bracketIdx) => maxOf(bracketIdx, new Set()));
}

/** Pixel sizes of the builder's board. */
export interface BoardDimensions {
	cardWidth: number;
	/** Cards grow from this to fit their content */
	minCardHeight: number;
	columnGap: number;
	rowGap: number;
	headerHeight: number;
	padding: number;
	/** Height of the empty slot a line skipping a column passes through */
	laneHeight: number;
}

interface Point {
	x: number;
	y: number;
}

export interface BoardLayout {
	/** Top left corner and height of each bracket's card */
	cards: Array<Point & { height: number }>;
	/** Per line of {@link connections}, in the same order */
	lines: Array<{
		/** Start port, both ends of each lane the line passes, end port */
		points: Point[];
		labelAt: Point;
	}>;
	/** Bottom of the lowest card or lane */
	height: number;
}

/**
 * Positions of the cards and lines of the board. A line skipping columns passes each through a lane, an empty slot
 * between the column's cards, so that it never crosses a card. A lane goes where the line comes in, pushing the
 * cards below it down. Cards grow to fit their content, `cardHeights` being their measured heights.
 */
export function boardLayout(
	values: BuilderValues,
	bracketColumns: number[],
	dimensions: BoardDimensions,
	cardHeights: Array<number | undefined> = [],
): BoardLayout {
	const {
		cardWidth,
		minCardHeight,
		columnGap,
		rowGap,
		headerHeight,
		padding,
		laneHeight,
	} = dimensions;
	const lines = connections(values);
	const columnX = (column: number) =>
		padding + column * (cardWidth + columnGap);
	const cards: BoardLayout["cards"] = [];
	const heightOf = (bracketIdx: number) =>
		Math.max(minCardHeight, cardHeights[bracketIdx] ?? 0);
	const centerYOf = (bracketIdx: number) =>
		cards[bracketIdx].y + cards[bracketIdx].height / 2;
	const laneYs = lines.map(() => new Map<number, number>());
	let height = headerHeight;

	const lineYAt = (lineIdx: number, column: number) => {
		const { fromIdx } = lines[lineIdx];
		return column === bracketColumns[fromIdx]
			? centerYOf(fromIdx)
			: laneYs[lineIdx].get(column)!;
	};

	const columnCount = Math.max(0, ...bracketColumns) + 1;
	for (let column = 0; column < columnCount; column++) {
		const lanes = lines
			.flatMap((line, lineIdx) =>
				bracketColumns[line.fromIdx] < column &&
				column < bracketColumns[line.toIdx]
					? [{ lineIdx, comesInAt: lineYAt(lineIdx, column - 1) }]
					: [],
			)
			.sort((a, b) => a.comesInAt - b.comesInAt);

		let y = headerHeight;
		const placeLane = () => {
			const lane = lanes.shift()!;
			laneYs[lane.lineIdx].set(column, y + laneHeight / 2);
			y += laneHeight + rowGap;
		};

		for (const [bracketIdx, bracketColumn] of bracketColumns.entries()) {
			if (bracketColumn !== column) continue;

			const cardHeight = heightOf(bracketIdx);
			while (lanes.length > 0 && lanes[0].comesInAt <= y + cardHeight / 2) {
				placeLane();
			}
			cards[bracketIdx] = { x: columnX(column), y, height: cardHeight };
			y += cardHeight + rowGap;
		}
		while (lanes.length > 0) placeLane();

		height = Math.max(height, y - rowGap);
	}

	return {
		cards,
		lines: lines.map((line, lineIdx) => {
			const fromColumn = bracketColumns[line.fromIdx];
			const toColumn = bracketColumns[line.toIdx];
			const start = {
				x: columnX(fromColumn) + cardWidth,
				y: centerYOf(line.fromIdx),
			};
			const end = {
				x: columnX(toColumn),
				y: centerYOf(line.toIdx),
			};
			const laneColumns = R.range(
				fromColumn + 1,
				Math.max(fromColumn + 1, toColumn),
			);
			const lanePoints = laneColumns.flatMap((column) => {
				const y = laneYs[lineIdx].get(column)!;
				return [
					{ x: columnX(column), y },
					{ x: columnX(column) + cardWidth, y },
				];
			});

			return {
				points: [start, ...lanePoints, end],
				labelAt:
					laneColumns.length > 0
						? {
								x: columnX(laneColumns[0]) + cardWidth / 2,
								y: laneYs[lineIdx].get(laneColumns[0])!,
							}
						: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
			};
		}),
		height,
	};
}

/** Whether teams of `fromIdx` can (transitively) end up in `toIdx`. */
function reaches(values: BuilderValues, fromIdx: number, toIdx: number) {
	const lines = connections(values);
	const visited = new Set<number>();
	const queue = [fromIdx];

	while (queue.length > 0) {
		const current = queue.shift()!;
		if (current === toIdx) return true;
		if (visited.has(current)) continue;
		visited.add(current);

		for (const line of lines) {
			if (line.fromIdx === current) queue.push(line.toIdx);
		}
	}

	return false;
}

function maxAdvancing(
	values: BuilderValues,
	line: Connection,
	sourceMax: number | null,
): number | null {
	const source = values.brackets[line.fromIdx];
	const sourceRef: ProgressionSourceFormValue = {
		bracketIdx: String(line.fromIdx),
		placements: line.placements,
	};

	if (sourceBracketHasEarlyAdvance(values.brackets, sourceRef)) {
		return sourceMax;
	}

	const parsed = Progression.parsePlacements(line.placements);
	if (!parsed || parsed.placements.length === 0) return 0;

	const isKnockedOut = parsed.placements.some((placement) => placement < 0);
	if (isKnockedOut || parsed.rest) return sourceMax;

	const picked = new Set(parsed.placements);
	switch (source.type) {
		case "round_robin": {
			if (sourceMax === null) return null;
			const groupCount = Math.ceil(sourceMax / Number(source.teamsPerGroup));
			return Math.min(sourceMax, picked.size * groupCount);
		}
		case "swiss":
			return picked.size * Number(source.groupCount);
		default:
			return R.sumBy(
				placementTiers(source, sourceMax).filter((tier) =>
					picked.has(tier.placement),
				),
				(tier) => tier.maxTeams,
			);
	}
}

function singleEliminationTiers(bracket: BracketFormValue): PlacementTier[] {
	const skipped = SkippedRounds.normalized(
		"single_elimination",
		bracket.skippedRounds,
	);
	const skippedRoundCount = skipped.includes("SEMIS")
		? 2
		: skipped.includes("FINALS")
			? 1
			: 0;

	const result: Array<Omit<PlacementTier, "placement">> =
		skippedRoundCount === 0
			? [
					{ kind: "WON_FINAL", maxTeams: 1 },
					{ kind: "LOST_FINAL", maxTeams: 1 },
				]
			: [{ kind: "STILL_IN", maxTeams: 2 ** skippedRoundCount }];

	// rounds from the end: 0 = final, 1 = semifinals...
	for (
		let roundsFromEnd = Math.max(1, skippedRoundCount);
		2 ** (roundsFromEnd + 1) <= LARGEST_ROUND_LISTED;
		roundsFromEnd++
	) {
		const roundOf = 2 ** (roundsFromEnd + 1);

		if (roundsFromEnd === 1) {
			result.push(
				...(hasThirdPlaceMatch(bracket)
					? ([
							{ kind: "WON_THIRD_PLACE_MATCH", maxTeams: 1 },
							{ kind: "LOST_THIRD_PLACE_MATCH", maxTeams: 1 },
						] as const)
					: ([{ kind: "LOST_SEMIFINALS", maxTeams: 2 }] as const)),
			);
			continue;
		}

		result.push({
			kind: roundOf === 8 ? "LOST_QUARTERFINALS" : "LOST_ROUND_OF",
			maxTeams: roundOf / 2,
			roundOf,
		});
	}

	return withPlacements(result);
}

function doubleEliminationTiers(bracket: BracketFormValue): PlacementTier[] {
	const skipped = SkippedRounds.normalized(
		"double_elimination",
		bracket.skippedRounds,
	);
	const skippedLosersRoundCount = skipped.includes("LB_SEMIS")
		? 2
		: skipped.includes("LB_FINALS")
			? 1
			: 0;

	// losers rounds knock out 1, 1, 2, 2, 4, 4... teams counting from the losers final
	const losersRounds = Array.from(
		{ length: DOUBLE_ELIMINATION_TIERS_LISTED },
		(_, roundsFromEnd) => ({
			kind:
				roundsFromEnd === 0
					? ("LOST_LOSERS_FINAL" as const)
					: roundsFromEnd === 1
						? ("LOST_LOSERS_SEMIFINAL" as const)
						: ("OUT_IN_LOSERS_BRACKET" as const),
			maxTeams: 2 ** Math.floor(roundsFromEnd / 2),
		}),
	);

	const unbeatenCount = skipped.includes("WB_FINALS") ? 2 : 1;
	const stillIn: Array<Omit<PlacementTier, "placement">> = skipped.includes(
		"GRAND_FINALS",
	)
		? [
				{ kind: "UNBEATEN", maxTeams: unbeatenCount },
				{
					kind: "ALIVE_WITH_ONE_LOSS",
					// grand finalists + the teams of the skipped losers rounds
					maxTeams:
						2 +
						R.sumBy(
							losersRounds.slice(0, skippedLosersRoundCount),
							(round) => round.maxTeams,
						) -
						unbeatenCount,
				},
			]
		: [
				{ kind: "WON_GRAND_FINALS", maxTeams: 1 },
				{ kind: "LOST_GRAND_FINALS", maxTeams: 1 },
			];

	return withPlacements(
		[...stillIn, ...losersRounds.slice(skippedLosersRoundCount)].slice(
			0,
			DOUBLE_ELIMINATION_TIERS_LISTED,
		),
	);
}

function hasThirdPlaceMatch(bracket: BracketFormValue) {
	return !SkippedRounds.normalized(
		"single_elimination",
		bracket.skippedRounds,
	).includes("THIRD_PLACE_MATCH");
}

function withPlacements(
	tiers: Array<Omit<PlacementTier, "placement">>,
): PlacementTier[] {
	return tiers.map((tier, idx) => ({ ...tier, placement: idx + 1 }));
}

function limitToTeamCount(tiers: PlacementTier[], maxTeams: number | null) {
	if (maxTeams === null) return tiers;

	const result: PlacementTier[] = [];
	let teamsSoFar = 0;
	for (const tier of tiers) {
		if (teamsSoFar >= maxTeams) break;
		const teams = Math.min(tier.maxTeams, maxTeams - teamsSoFar);
		result.push({ ...tier, maxTeams: teams });
		teamsSoFar += teams;
	}

	return result;
}

function signUpEntry(): ProgressionFormValue {
	// the sources array needs an item even when unused, see the `progression` field
	return { source: "SIGN_UP", sources: [newProgressionSource()] };
}

function withProgressionEntry(
	values: BuilderValues,
	bracketIdx: number,
	entry: ProgressionFormValue,
): BuilderValues {
	return {
		brackets: values.brackets,
		progression: values.progression.map((existing, idx) =>
			idx === bracketIdx ? entry : existing,
		),
	};
}

function fittedPlacements(
	values: BuilderValues,
	line: Connection,
	sourceMaxTeams: number | null,
) {
	const source = values.brackets[line.fromIdx];
	if (
		sourceBracketHasEarlyAdvance(values.brackets, {
			bracketIdx: String(line.fromIdx),
			placements: line.placements,
		})
	) {
		return line.placements;
	}

	const parsed = Progression.parsePlacements(line.placements);
	if (!parsed) return line.placements;

	// none means the lines into the source have nothing picked yet, an error of their own and no reason to drop picks
	const existing = existingPlacements(
		source,
		sourceMaxTeams === 0 ? null : sourceMaxTeams,
	);
	const kept = parsed.placements.filter(existing);
	if (kept.length === parsed.placements.length) return line.placements;
	if (kept.length > 0) {
		// placements are dropped from the end, so "everyone below" would cover what other lines take in between
		const keepsRest =
			parsed.rest && Math.max(...kept) === Math.max(...parsed.placements);
		return Progression.placementsToString(kept, keepsRest);
	}

	const defaults = Progression.parsePlacements(
		defaultPlacements(withLinePlacements(values, line, ""), line.fromIdx),
	);
	return Progression.placementsToString(
		(defaults?.placements ?? []).filter(existing),
		defaults?.rest,
	);
}

function existingPlacements(
	source: BracketFormValue,
	sourceMaxTeams: number | null,
) {
	const knockedOut = new Set(
		knockedOutRoundOptions(source).map((rounds) => -rounds),
	);
	const tierPlacements = new Set(
		placementTiers(source, sourceMaxTeams).map((tier) => tier.placement),
	);

	return (placement: number) =>
		placement < 0
			? knockedOut.has(placement)
			: source.type === "swiss" || tierPlacements.has(placement);
}

function withLinePlacements(
	values: BuilderValues,
	line: Pick<Connection, "toIdx" | "sourceIdx">,
	placements: string,
): BuilderValues {
	const entry = values.progression[line.toIdx];

	return withProgressionEntry(values, line.toIdx, {
		...entry,
		sources: entry.sources.map((source, idx) =>
			idx === line.sourceIdx ? { ...source, placements } : source,
		),
	});
}
