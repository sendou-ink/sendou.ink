import { TOURNAMENT } from "../../../tournament/tournament-constants";
import type { Bracket as BracketType } from "../../core/Bracket";
import { groupNumberToLetters } from "../../tournament-bracket-utils";
import { Match } from "./Match";
import { RoundHeader } from "./RoundHeader";

// xxx: use Elimination.tsx component

interface DoubleEliminationGroupsBracketProps {
	bracket: BracketType;
}

export function DoubleEliminationGroupsBracket({
	bracket,
}: DoubleEliminationGroupsBracketProps) {
	const pools = getPools(bracket);

	return (
		<div className="stack xl">
			{pools.map((pool) => (
				<PoolBracket key={pool.poolLetter} pool={pool} bracket={bracket} />
			))}
		</div>
	);
}

interface Pool {
	poolLetter: string;
	poolIdx: number;
	wbGroupId: number | null;
	lbGroupId: number | null;
	gfGroupId: number | null;
}

function getPools(bracket: BracketType): Pool[] {
	const groups = bracket.data.group;
	const poolCount = Math.ceil(groups.length / 3);

	const pools: Pool[] = [];

	for (let i = 0; i < poolCount; i++) {
		// Group numbers in brackets-manager: WB=1,4,7... LB=2,5,8... GF=3,6,9...
		// baseGroupNumber for pool i is i*3, then WB=+1, LB=+2, GF=+3
		const baseGroupNumber = i * 3;

		const wbGroup = groups.find((g) => g.number === baseGroupNumber + 1);
		const lbGroup = groups.find((g) => g.number === baseGroupNumber + 2);
		const gfGroup = groups.find((g) => g.number === baseGroupNumber + 3);

		pools.push({
			poolLetter: groupNumberToLetters(i + 1),
			poolIdx: i,
			wbGroupId: wbGroup?.id ?? null,
			lbGroupId: lbGroup?.id ?? null,
			gfGroupId: gfGroup?.id ?? null,
		});
	}

	return pools;
}

function PoolBracket({ pool, bracket }: { pool: Pool; bracket: BracketType }) {
	// Count real teams in this pool by looking at WB first round
	const wbAllRounds =
		pool.wbGroupId !== null
			? bracket.data.round
					.filter((r) => r.group_id === pool.wbGroupId)
					.sort((a, b) => a.number - b.number)
			: [];
	const wbFirstRound = wbAllRounds[0];

	const realTeamCount = wbFirstRound
		? new Set(
				bracket.data.match
					.filter((m) => m.round_id === wbFirstRound.id)
					.flatMap((m) => [m.opponent1?.id, m.opponent2?.id])
					.filter((id): id is number => id != null),
			).size
		: 0;

	// For rounds with real teams, check that both opponents exist (not BYE)
	const hasNonByeMatch = (round: BracketType["data"]["round"][number]) =>
		bracket.data.match.some(
			(m) =>
				m.round_id === round.id && m.opponent1 !== null && m.opponent2 !== null,
		);

	// For WB/GF, also require at least one opponent to have a real ID (filters empty placeholder rounds)
	const hasRealMatch = (round: BracketType["data"]["round"][number]) =>
		bracket.data.match.some(
			(m) =>
				m.round_id === round.id &&
				m.opponent1 !== null &&
				m.opponent2 !== null &&
				(m.opponent1?.id != null || m.opponent2?.id != null),
		);

	// Note: Use !== null check instead of truthy check because group IDs can be 0
	const wbRounds = wbAllRounds.filter(hasRealMatch);

	// Only show LB and GF if there are enough teams for double elimination (4+)
	const lbRounds =
		realTeamCount >= 4 && pool.lbGroupId !== null
			? bracket.data.round
					.filter((r) => r.group_id === pool.lbGroupId)
					.filter(hasNonByeMatch)
					.sort((a, b) => a.number - b.number)
			: [];

	const gfRounds =
		realTeamCount >= 4 && pool.gfGroupId !== null
			? bracket.data.round
					.filter((r) => r.group_id === pool.gfGroupId)
					.filter(hasNonByeMatch)
					.sort((a, b) => a.number - b.number)
			: [];

	// Combine WB and GF rounds into a single row (GF comes after WB finals)
	const wbAndGfRounds = [...wbRounds, ...gfRounds];

	return (
		<div className="stack lg ml-6">
			<h2 className="text-lg">Group {pool.poolLetter}</h2>
			<div className="stack md">
				<PoolBracketSide
					type="winners"
					rounds={wbAndGfRounds}
					bracket={bracket}
					poolLetter={pool.poolLetter}
					wbRoundCount={wbRounds.length}
				/>
				<PoolBracketSide
					type="losers"
					rounds={lbRounds}
					bracket={bracket}
					poolLetter={pool.poolLetter}
				/>
			</div>
		</div>
	);
}

function PoolBracketSide({
	type,
	rounds,
	bracket,
	poolLetter,
	wbRoundCount,
}: {
	type: "winners" | "losers";
	rounds: BracketType["data"]["round"];
	bracket: BracketType;
	poolLetter: string;
	wbRoundCount?: number;
}) {
	if (rounds.length === 0) return null;

	return (
		<div
			className="elim-bracket__container"
			style={{ "--round-count": rounds.length }}
		>
			{rounds.map((round, roundIdx) => {
				const bestOf = round.maps?.count;

				const matches = bracket.data.match.filter(
					(match) => match.round_id === round.id,
				);

				const someMatchOngoing = matches.some(
					(match) =>
						match.opponent1 &&
						match.opponent2 &&
						match.opponent1.result !== "win" &&
						match.opponent2.result !== "win",
				);

				// For winners row, rounds after wbRoundCount are GF rounds
				const isGfRound =
					type === "winners" &&
					wbRoundCount !== undefined &&
					roundIdx >= wbRoundCount;
				const roundName = isGfRound
					? TOURNAMENT.ROUND_NAMES.GRAND_FINALS
					: getRoundName(type, roundIdx, wbRoundCount ?? rounds.length);

				return (
					<div
						key={round.id}
						className="elim-bracket__round-column"
						data-round-id={round.id}
					>
						<RoundHeader
							roundId={round.id}
							name={roundName}
							bestOf={bestOf}
							showInfos={someMatchOngoing}
							maps={round.maps}
						/>
						<div className="elim-bracket__round-matches-container">
							{matches.map((match) => (
								<Match
									key={match.id}
									match={match}
									roundNumber={round.number}
									isPreview={bracket.preview}
									showSimulation={
										roundName !== TOURNAMENT.ROUND_NAMES.GRAND_FINALS
									}
									bracket={bracket}
									type={isGfRound ? "grands" : type}
									group={poolLetter}
								/>
							))}
						</div>
					</div>
				);
			})}
		</div>
	);
}

function getRoundName(
	type: "winners" | "losers",
	roundIdx: number,
	totalRounds: number,
): string {
	const namePrefix = type === "winners" ? "WB " : "LB ";

	const isFinals = roundIdx === totalRounds - 1;
	const isSemis = roundIdx === totalRounds - 2;

	return `${namePrefix}${isFinals ? "Finals" : isSemis ? "Semis" : `Round ${roundIdx + 1}`}`;
}
