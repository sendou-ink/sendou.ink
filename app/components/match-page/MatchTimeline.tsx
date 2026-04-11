import clsx from "clsx";
import { Check, RefreshCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useHydrated } from "~/hooks/useHydrated";
import { useTimeFormat } from "~/hooks/useTimeFormat";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import type { CommonUser } from "~/utils/kysely.server";
import { Avatar } from "../Avatar";
import { StageImage } from "../Image";
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
			<TimelineHeader teams={teams} score={score} maps={maps} />
			{maps.map((map, i) => {
				const previousMap = maps[i - 1];
				const substitutions = previousMap
					? inferSubstitutions(previousMap, map)
					: [];

				return (
					<div key={i} className="contents">
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
	maps,
}: Pick<MatchTimelineProps, "teams" | "score" | "maps">) {
	const initialRosters = maps[0]?.rosters;

	return (
		<div className={styles.header}>
			<div className={styles.headerTeam}>
				<div className={styles.headerTeamName}>{teams.alpha.name}</div>
				{initialRosters ? (
					<div className={styles.headerAvatars}>
						{initialRosters.alpha.map((user) => (
							<Avatar key={user.id} user={user} size="xxxs" />
						))}
					</div>
				) : null}
			</div>
			<div className={styles.headerScore}>
				{score.alpha}-{score.bravo}
			</div>
			<div className={clsx(styles.headerTeam, styles.headerTeamBravo)}>
				<div className={styles.headerTeamName}>{teams.bravo.name}</div>
				{initialRosters ? (
					<div className={styles.headerAvatars}>
						{initialRosters.bravo.map((user) => (
							<Avatar key={user.id} user={user} size="xxxs" />
						))}
					</div>
				) : null}
			</div>
		</div>
	);
}

function TimelineMapRow({ map }: { map: TimelineMap }) {
	const isHydrated = useHydrated();
	const { formatTime } = useTimeFormat();

	return (
		<div className={styles.mapEvent}>
			<div className={styles.mapSide}>
				{map.winner === "ALPHA" ? (
					<WinIndicator points={map.points?.[0]} />
				) : null}
			</div>
			<div className={styles.mapCenter}>
				<time className={styles.mapTimestamp}>
					{isHydrated ? (
						formatTime(new Date(map.timestamp))
					) : (
						<div className="invisible">X</div>
					)}
				</time>
				<StageImage
					stageId={map.stageId}
					width={80}
					className={styles.mapStageImage}
				/>
			</div>
			<div className={styles.mapSide}>
				{map.winner === "BRAVO" ? (
					<WinIndicator points={map.points?.[1]} />
				) : null}
			</div>
		</div>
	);
}

function WinIndicator({ points }: { points?: number }) {
	const { t } = useTranslation(["q"]);

	return (
		<div className={styles.winIndicator}>
			<Check size={32} className={styles.winCheck} />
			{points === 100 ? (
				<span className={styles.winPoints}>{t("q:match.action.ko")}</span>
			) : points ? (
				<span className={styles.winPoints}>
					{t("q:match.timeline.points", { count: points })}
				</span>
			) : null}
		</div>
	);
}

function TimelineSubstitutionRow({
	substitution,
}: {
	substitution: InferredSubstitution;
}) {
	return (
		<div className={styles.substitutionEvent}>
			<div>
				{substitution.side === "ALPHA" ? (
					<SubstitutionDetail substitution={substitution} />
				) : null}
			</div>
			<div className={styles.subCenter}>
				<RefreshCcw size={24} className={styles.subIcon} />
			</div>
			<div>
				{substitution.side === "BRAVO" ? (
					<SubstitutionDetail substitution={substitution} />
				) : null}
			</div>
		</div>
	);
}

function SubstitutionDetail({
	substitution,
}: {
	substitution: InferredSubstitution;
}) {
	const { t } = useTranslation(["q"]);

	return (
		<div className={styles.subDetail}>
			<span className={styles.subLabelOut}>{t("q:match.timeline.out")}</span>
			<Avatar user={substitution.playerOut} size="xxxs" />
			<span className={styles.subPlayerName}>
				{substitution.playerOut.username}
			</span>
			<span className={styles.subLabelIn}>{t("q:match.timeline.in")}</span>
			<Avatar user={substitution.playerIn} size="xxxs" />
			<span className={styles.subPlayerName}>
				{substitution.playerIn.username}
			</span>
		</div>
	);
}
