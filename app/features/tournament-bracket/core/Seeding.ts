import { ordering } from "./engine/create/seeding";

export interface FollowUpBracketSource {
	/** Standings of the source bracket, best placements first. Tied placements (e.g. the winner of each group) form the tiers that seeding keeps intact. */
	standings: Array<{
		tournamentTeamId: number;
		placement: number;
		/** `null` when the source bracket is not played in groups */
		groupId: number | null;
	}>;
	/** Pairs of teams that already faced each other in the source bracket */
	encounters: Array<[number, number]>;
}

interface TeamMeta {
	classKey: string;
	groupKey: string | null;
}

interface Constraints {
	/** groupKey -> teams of the group may not share an aligned first round lineup block of this size */
	groupBlockSizes: Map<string, number>;
	/** teams that already met may not share a block of this size (2 = not in the same first round match, 1 = no constraint) */
	encounterBlockSize: number;
}

const MAX_SEARCH_NODES = 10_000;

/**
 * Reorders teams advancing into a single or double elimination bracket so that:
 *
 * - teams sharing a source group spread evenly across the bracket's sections and can
 *   meet again only as late as the bracket allows (e.g. 4 groups of 4 into a 16 bracket:
 *   every quarter holds one team per group, so rivals can rematch in the semis at the earliest)
 * - teams that already faced each other do not rematch in round 1 (relevant e.g. when
 *   a single Swiss group feeds a top cut)
 * - placement tiers stay intact: a team never takes a seed reserved for a better
 *   placement, keeping byes and favorable lines with the top placing teams. The
 *   exception is the bottom half of a bracket sourced from a single group, where
 *   placements may be swapped to avoid round 1 rematches.
 *
 * Within those constraints the incoming order changes as little as possible. When the
 * constraints cannot all be satisfied they are relaxed step by step, and as the last
 * resort the teams are returned in the incoming order.
 */
export function forFollowUpBracket({
	teams,
	sources,
}: {
	/** tournament team ids in their incoming seed order (best placements first) */
	teams: number[];
	sources: FollowUpBracketSource[];
}): number[] {
	// with fewer than 4 teams every allowed order produces the same round 1 pairings
	if (teams.length < 4) return [...teams];

	const bracketSize = 2 ** Math.ceil(Math.log2(teams.length));
	const lineupPosBySeedIdx = resolveLineupPositions(bracketSize);

	const metaByTeamId = resolveTeamMeta(teams, sources);
	const classes = resolveClasses(teams, metaByTeamId);
	const encounterKeys = new Set(
		sources.flatMap((source) =>
			source.encounters.map(([one, two]) => encounterKey(one, two)),
		),
	);
	const idealBlockSizes = resolveIdealBlockSizes(
		teams,
		metaByTeamId,
		bracketSize,
	);

	for (const constraints of relaxationLadder(idealBlockSizes)) {
		const result = search({
			teams,
			classes,
			metaByTeamId,
			encounterKeys,
			lineupPosBySeedIdx,
			constraints,
		});
		if (result) return result;
	}

	return [...teams];
}

function resolveLineupPositions(bracketSize: number) {
	const seedIndices = Array.from({ length: bracketSize }, (_, i) => i);
	const lineup = ordering.space_between(seedIndices);

	const positions = Array.from({ length: bracketSize }, () => 0);
	for (const [position, seedIdx] of lineup.entries()) {
		positions[seedIdx] = position;
	}

	return positions;
}

function resolveTeamMeta(teams: number[], sources: FollowUpBracketSource[]) {
	const metaByTeamId = new Map<number, TeamMeta>();

	for (const [sourceIdx, source] of sources.entries()) {
		for (const standing of source.standings) {
			if (!teams.includes(standing.tournamentTeamId)) continue;

			metaByTeamId.set(standing.tournamentTeamId, {
				classKey: `${sourceIdx}:${standing.placement}`,
				groupKey:
					standing.groupId !== null
						? `${sourceIdx}:${standing.groupId}`
						: `${sourceIdx}:single`,
			});
		}
	}

	// teams without a standing (should not happen) stay at their incoming seed
	for (const teamId of teams) {
		if (!metaByTeamId.has(teamId)) {
			metaByTeamId.set(teamId, {
				classKey: `unknown:${teamId}`,
				groupKey: null,
			});
		}
	}

	poolSingleGroupBottomHalf(teams, sources, metaByTeamId);

	return metaByTeamId;
}

/** When one group feeds the whole bracket its placements are all distinct and there
 * would be no freedom to avoid rematches. Mirroring how brackets are commonly
 * re-seeded by hand, the top half keeps its exact placements while the bottom half
 * placements become interchangeable. */
function poolSingleGroupBottomHalf(
	teams: number[],
	sources: FollowUpBracketSource[],
	metaByTeamId: Map<number, TeamMeta>,
) {
	if (sources.length !== 1) return;

	const groupKeys = new Set(
		[...metaByTeamId.values()].map((meta) => meta.groupKey),
	);
	if (groupKeys.size !== 1) return;

	const bottomHalfStart = Math.floor(teams.length / 2);

	const seedIdxsByClass = new Map<string, number[]>();
	for (const [seedIdx, teamId] of teams.entries()) {
		const meta = metaByTeamId.get(teamId)!;
		if (!seedIdxsByClass.has(meta.classKey)) {
			seedIdxsByClass.set(meta.classKey, []);
		}
		seedIdxsByClass.get(meta.classKey)!.push(seedIdx);
	}

	for (const teamId of teams) {
		const meta = metaByTeamId.get(teamId)!;
		const classSeedIdxs = seedIdxsByClass.get(meta.classKey)!;
		if (classSeedIdxs.every((seedIdx) => seedIdx >= bottomHalfStart)) {
			meta.classKey = "bottom-half-pool";
		}
	}
}

function resolveClasses(teams: number[], metaByTeamId: Map<number, TeamMeta>) {
	const classes = new Map<string, number[]>();
	for (const teamId of teams) {
		const { classKey } = metaByTeamId.get(teamId)!;
		if (!classes.has(classKey)) {
			classes.set(classKey, []);
		}
		classes.get(classKey)!.push(teamId);
	}

	return classes;
}

/** The largest aligned lineup block a group's teams can be kept from sharing: with T
 * teams of a group in the bracket they fit into T disjoint blocks of bracketSize / T
 * slots, delaying their meetings the furthest the bracket structure allows. */
function resolveIdealBlockSizes(
	teams: number[],
	metaByTeamId: Map<number, TeamMeta>,
	bracketSize: number,
) {
	const groupSizes = new Map<string, number>();
	for (const teamId of teams) {
		const { groupKey } = metaByTeamId.get(teamId)!;
		if (!groupKey) continue;

		groupSizes.set(groupKey, (groupSizes.get(groupKey) ?? 0) + 1);
	}

	const blockSizes = new Map<string, number>();
	for (const [groupKey, size] of groupSizes) {
		if (size < 2) continue;

		const blockSize = 2 ** Math.floor(Math.log2(bracketSize / size));
		if (blockSize < 2) continue;

		blockSizes.set(groupKey, blockSize);
	}

	return blockSizes;
}

function* relaxationLadder(
	idealBlockSizes: Map<string, number>,
): Generator<Constraints> {
	const maxBlockSize = Math.max(2, ...idealBlockSizes.values());
	const maxShift = Math.log2(maxBlockSize) - 1;

	for (let shift = 0; shift <= maxShift; shift++) {
		const groupBlockSizes = new Map(
			[...idealBlockSizes].map(([groupKey, blockSize]) => [
				groupKey,
				Math.max(2, blockSize >> shift),
			]),
		);

		if (shift === 0) {
			yield { groupBlockSizes, encounterBlockSize: 2 };
		}
		yield { groupBlockSizes, encounterBlockSize: 1 };
	}
}

/** Depth-first search assigning the seeds best first, always trying the highest
 * ranked remaining team of the seed's tier first: the first solution found is the
 * one closest to the incoming order. */
function search({
	teams,
	classes,
	metaByTeamId,
	encounterKeys,
	lineupPosBySeedIdx,
	constraints,
}: {
	teams: number[];
	classes: Map<string, number[]>;
	metaByTeamId: Map<number, TeamMeta>;
	encounterKeys: Set<string>;
	lineupPosBySeedIdx: number[];
	constraints: Constraints;
}): number[] | null {
	const assignment: number[] = [];
	const used = new Set<number>();
	let nodesVisited = 0;

	const hasConflict = (candidate: number, seedIdx: number) => {
		const candidateMeta = metaByTeamId.get(candidate)!;
		const candidatePos = lineupPosBySeedIdx[seedIdx];

		for (const [assignedSeedIdx, assignedTeam] of assignment.entries()) {
			const assignedPos = lineupPosBySeedIdx[assignedSeedIdx];

			if (candidateMeta.groupKey) {
				const groupBlockSize = constraints.groupBlockSizes.get(
					candidateMeta.groupKey,
				);
				if (
					groupBlockSize &&
					metaByTeamId.get(assignedTeam)!.groupKey === candidateMeta.groupKey &&
					sameBlock(candidatePos, assignedPos, groupBlockSize)
				) {
					return true;
				}
			}

			if (
				constraints.encounterBlockSize > 1 &&
				encounterKeys.has(encounterKey(candidate, assignedTeam)) &&
				sameBlock(candidatePos, assignedPos, constraints.encounterBlockSize)
			) {
				return true;
			}
		}

		return false;
	};

	const assignSeed = (seedIdx: number): boolean => {
		if (seedIdx === teams.length) return true;

		nodesVisited++;
		if (nodesVisited > MAX_SEARCH_NODES) return false;

		const { classKey } = metaByTeamId.get(teams[seedIdx])!;
		for (const candidate of classes.get(classKey)!) {
			if (used.has(candidate)) continue;
			if (hasConflict(candidate, seedIdx)) continue;

			assignment.push(candidate);
			used.add(candidate);

			if (assignSeed(seedIdx + 1)) return true;

			assignment.pop();
			used.delete(candidate);
		}

		return false;
	};

	if (!assignSeed(0)) return null;

	return assignment;
}

function sameBlock(posA: number, posB: number, blockSize: number) {
	return Math.floor(posA / blockSize) === Math.floor(posB / blockSize);
}

function encounterKey(one: number, two: number) {
	return one < two ? `${one}:${two}` : `${two}:${one}`;
}
