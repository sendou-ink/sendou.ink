import clsx from "clsx";
import { Check, RefreshCcw, TrendingUp, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { GroupSkillDifference, UserSkillDifference } from "~/db/tables";
import { useHydrated } from "~/hooks/useHydrated";
import { useTimeFormat } from "~/hooks/useTimeFormat";
import { shortStageName } from "~/modules/in-game-lists/stage-ids";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import type { CommonUser } from "~/utils/kysely.server";
import { Avatar } from "../Avatar";
import { ModeImage, StageImage } from "../Image";
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

interface TimelineSpMember {
	user: CommonUser;
	skillDifference: UserSkillDifference;
}

export interface TimelineSpChanges {
	alpha: {
		members: TimelineSpMember[];
		skillDifference?: GroupSkillDifference;
	};
	bravo: {
		members: TimelineSpMember[];
		skillDifference?: GroupSkillDifference;
	};
}

export interface MatchTimelineProps {
	teams: { alpha: TimelineTeam; bravo: TimelineTeam };
	score: { alpha: number; bravo: number };
	maps: TimelineMap[];
	spChanges?: TimelineSpChanges;
}

// xxx: need to show Pick/Bans somewhere, on tab?
// xxx: align checkmarks better
export function MatchTimeline({
	teams,
	score,
	maps,
	spChanges,
}: MatchTimelineProps) {
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
			{spChanges ? <TimelineSpSection spChanges={spChanges} /> : null}
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
	const { t } = useTranslation(["game-misc"]);
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
				<div className={styles.mapLabel}>
					<ModeImage mode={map.mode} size={14} />
					<span>{shortStageName(t(`game-misc:STAGE_${map.stageId}`))}</span>
				</div>
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
			<Check size={18} className={styles.winCheck} />
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

function TimelineEventRow({
	icon,
	alphaContent,
	bravoContent,
}: {
	icon: React.ReactNode;
	alphaContent: React.ReactNode;
	bravoContent: React.ReactNode;
}) {
	return (
		<div className={styles.eventRow}>
			<div className={styles.eventAlpha}>{alphaContent}</div>
			<div className={styles.subCenter}>{icon}</div>
			<div>{bravoContent}</div>
		</div>
	);
}

function TimelineSubstitutionRow({
	substitution,
}: {
	substitution: InferredSubstitution;
}) {
	return (
		<TimelineEventRow
			icon={<RefreshCcw size={32} className={styles.eventIcon} />}
			alphaContent={
				substitution.side === "ALPHA" ? (
					<SubstitutionDetail substitution={substitution} />
				) : null
			}
			bravoContent={
				substitution.side === "BRAVO" ? (
					<SubstitutionDetail substitution={substitution} />
				) : null
			}
		/>
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

function TimelineSpSection({ spChanges }: { spChanges: TimelineSpChanges }) {
	const alphaMembersWithDiff = spChanges.alpha.members.filter(
		(m) => !m.skillDifference.calculated || m.skillDifference.spDiff !== 0,
	);
	const bravoMembersWithDiff = spChanges.bravo.members.filter(
		(m) => !m.skillDifference.calculated || m.skillDifference.spDiff !== 0,
	);

	const maxMemberRows = Math.max(
		alphaMembersWithDiff.length,
		bravoMembersWithDiff.length,
	);

	if (
		maxMemberRows === 0 &&
		!spChanges.alpha.skillDifference &&
		!spChanges.bravo.skillDifference
	) {
		return null;
	}

	return (
		<div className={styles.spSection}>
			<div className={styles.spColumn}>
				{alphaMembersWithDiff.map((m) => (
					<SpMemberDetail key={m.user.id} member={m} />
				))}
				{spChanges.alpha.skillDifference ? (
					<SpTeamDetail skillDifference={spChanges.alpha.skillDifference} />
				) : null}
			</div>
			<div className={styles.spIcon}>
				<TrendingUp size={32} className={styles.eventIcon} />
			</div>
			<div className={styles.spColumn}>
				{bravoMembersWithDiff.map((m) => (
					<SpMemberDetail key={m.user.id} member={m} />
				))}
				{spChanges.bravo.skillDifference ? (
					<SpTeamDetail skillDifference={spChanges.bravo.skillDifference} />
				) : null}
			</div>
		</div>
	);
}

function SpMemberDetail({ member }: { member: TimelineSpMember }) {
	if (member.skillDifference.calculated) {
		const isPositive = member.skillDifference.spDiff > 0;

		return (
			<div className={styles.spDetail}>
				<Avatar user={member.user} size="xxs" />
				<span className={isPositive ? "text-success" : "text-warning"}>
					{isPositive ? "▲" : "▼"}
				</span>
				<span>{Math.abs(member.skillDifference.spDiff)}SP</span>
			</div>
		);
	}

	if (
		member.skillDifference.matchesCount ===
		member.skillDifference.matchesCountNeeded
	) {
		return (
			<div className={styles.spDetail}>
				<Avatar user={member.user} size="xxs" />
				<span className={styles.spCalculatingIcon}>◆</span>
				<span>
					{member.skillDifference.newSp ? (
						<>{member.skillDifference.newSp}SP</>
					) : null}
				</span>
			</div>
		);
	}

	return (
		<div className={styles.spDetail}>
			<Avatar user={member.user} size="xxs" />
			<span className={styles.spCalculatingIcon}>◆</span>
			<span>
				{member.skillDifference.matchesCount}/
				{member.skillDifference.matchesCountNeeded}
			</span>
		</div>
	);
}

function SpTeamDetail({
	skillDifference,
}: {
	skillDifference: GroupSkillDifference;
}) {
	if (skillDifference.calculated) {
		const diff = skillDifference.newSp - skillDifference.oldSp;
		const isPositive = diff > 0;

		return (
			<div className={styles.spDetail}>
				<div className={styles.spTeamIcon}>
					<Users size={16} />
				</div>
				<span className={isPositive ? "text-success" : "text-warning"}>
					{isPositive ? "▲" : "▼"}
				</span>
				<span>{Math.abs(diff)}SP</span>
			</div>
		);
	}

	if (skillDifference.newSp) {
		return (
			<div className={styles.spDetail}>
				<div className={styles.spTeamIcon}>
					<Users size={16} />
				</div>
				<span className={styles.spCalculatingIcon}>◆</span>
				<span>{skillDifference.newSp}SP</span>
			</div>
		);
	}

	return (
		<div className={styles.spDetail}>
			<div className={styles.spTeamIcon}>
				<Users size={16} />
			</div>
			<span className={styles.spCalculatingIcon}>◆</span>
			<span>
				{skillDifference.matchesCount}/{skillDifference.matchesCountNeeded}
			</span>
		</div>
	);
}
