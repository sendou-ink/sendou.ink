import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import type { CommonUser } from "~/utils/kysely.server";
import styles from "./MatchTimeline.module.css";

type MatchSide = "ALPHA" | "BRAVO";

export interface TimelineTeam {
	name: string;
	avatar?: string;
}

export interface TimelineMap {
	stageId: StageId;
	mode: ModeShort;
	timestamp: number;
	winner: MatchSide;
	rosters: {
		alpha: CommonUser[];
		bravo: CommonUser[];
	};
	/** Optional point values [alpha, bravo] */
	points?: [number, number];
}

export interface MatchTimelineProps {
	teams: { alpha: TimelineTeam; bravo: TimelineTeam };
	score: { alpha: number; bravo: number };
	maps: TimelineMap[];
}

export function MatchTimeline({ teams, score, maps }: MatchTimelineProps) {
	return (
		<div className={styles.root}>
			<TimelineHeader teams={teams} score={score} />
			{maps.map((map, i) => {
				const previousMap = maps[i - 1];
				const substitutions = previousMap
					? inferSubstitutions(previousMap, map)
					: [];

				return (
					<div key={i}>
						{substitutions.map((sub, j) => (
							<TimelineSubstitutionRow key={j} substitution={sub} />
						))}
						<TimelineMapRow map={map} />
					</div>
				);
			})}
		</div>
	);
}

interface InferredSubstitution {
	side: MatchSide;
	playerOut: CommonUser;
	playerIn: CommonUser;
}

// xxx: unit test
function inferSubstitutions(
	previousMap: TimelineMap,
	currentMap: TimelineMap,
): InferredSubstitution[] {
	const result: InferredSubstitution[] = [];

	for (const side of ["alpha", "bravo"] as const) {
		const prevIds = new Set(previousMap.rosters[side].map((u) => u.id));
		const currIds = new Set(currentMap.rosters[side].map((u) => u.id));

		const out = previousMap.rosters[side].filter((u) => !currIds.has(u.id));
		const inn = currentMap.rosters[side].filter((u) => !prevIds.has(u.id));

		for (let i = 0; i < Math.max(out.length, inn.length); i++) {
			if (out[i] && inn[i]) {
				result.push({
					side: side === "alpha" ? "ALPHA" : "BRAVO",
					playerOut: out[i],
					playerIn: inn[i],
				});
			}
		}
	}

	return result;
}

function TimelineHeader({
	teams,
	score,
}: Pick<MatchTimelineProps, "teams" | "score">) {
	return (
		<div className={styles.header}>
			<div>{teams.alpha.name}</div>
			<div>
				{score.alpha}-{score.bravo}
			</div>
			<div>{teams.bravo.name}</div>
		</div>
	);
}

function TimelineMapRow({ map }: { map: TimelineMap }) {
	return <div className={styles.mapEvent}>{map.stageId}</div>;
}

function TimelineSubstitutionRow({
	substitution,
}: {
	substitution: InferredSubstitution;
}) {
	return (
		<div className={styles.substitutionEvent}>
			{substitution.playerOut.username} → {substitution.playerIn.username}
		</div>
	);
}
