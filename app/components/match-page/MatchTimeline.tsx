import clsx from "clsx";
import { ArrowRight, RefreshCcw, TrendingUp, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { GroupSkillDifference, UserSkillDifference } from "~/db/tables";
import { useHydrated } from "~/hooks/useHydrated";
import { useTimeFormat } from "~/hooks/useTimeFormat";
import { shortStageName } from "~/modules/in-game-lists/stage-ids";
import type {
	MainWeaponId,
	ModeShort,
	StageId,
} from "~/modules/in-game-lists/types";
import type { CommonUser } from "~/utils/kysely.server";
import { Avatar } from "../Avatar";
import { SendouButton } from "../elements/Button";
import { SendouPopover } from "../elements/Popover";
import { ModeImage, StageImage } from "../Image";
import styles from "./MatchTimeline.module.css";
import { WeaponPool } from "./WeaponPool";

const LONG_TEAM_NAME_THRESHOLD = 16;

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
	weapons?: {
		alpha: Array<MainWeaponId | null>;
		bravo: Array<MainWeaponId | null>;
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
	/** When true, render only the team + score header (no per-map rows or SP section). */
	compact?: boolean;
}

// xxx: need to show Pick/Bans somewhere, on tab?
export function MatchTimeline({
	teams,
	score,
	maps,
	spChanges,
	compact = false,
}: MatchTimelineProps) {
	return (
		<div className={styles.root}>
			<TimelineHeader teams={teams} score={score} maps={maps} />
			{compact
				? null
				: maps.map((map, i) => {
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
			{!compact && spChanges ? (
				<TimelineSpSection spChanges={spChanges} />
			) : null}
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
				<div
					className={clsx(styles.headerTeamName, {
						[styles.headerTeamNameLong]:
							teams.alpha.name.length > LONG_TEAM_NAME_THRESHOLD,
					})}
				>
					{teams.alpha.name}
				</div>
				{initialRosters ? (
					<div className={styles.headerAvatars}>
						{initialRosters.alpha.map((user) => (
							<Avatar key={user.id} user={user} size="xxs" />
						))}
					</div>
				) : null}
			</div>
			<div className={styles.headerScore}>
				{score.alpha}-{score.bravo}
			</div>
			<div className={clsx(styles.headerTeam, styles.headerTeamBravo)}>
				<div
					className={clsx(styles.headerTeamName, {
						[styles.headerTeamNameLong]:
							teams.bravo.name.length > LONG_TEAM_NAME_THRESHOLD,
					})}
				>
					{teams.bravo.name}
				</div>
				{initialRosters ? (
					<div className={styles.headerAvatars}>
						{initialRosters.bravo.map((user) => (
							<Avatar key={user.id} user={user} size="xxs" />
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
				<SideResult
					result={map.winner === "ALPHA" ? "WIN" : "LOSS"}
					points={map.points?.[0]}
					weapons={map.weapons?.alpha}
				/>
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
				<SideResult
					result={map.winner === "BRAVO" ? "WIN" : "LOSS"}
					points={map.points?.[1]}
					weapons={map.weapons?.bravo}
				/>
			</div>
		</div>
	);
}

function SideResult({
	result,
	points,
	weapons,
}: {
	result: "WIN" | "LOSS";
	points?: number;
	weapons?: Array<MainWeaponId | null>;
}) {
	const { t } = useTranslation(["q"]);

	return (
		<div className={styles.sideResult}>
			<div className={styles.resultHeader}>
				<span
					className={clsx(
						styles.resultLabel,
						result === "WIN" ? "text-success" : "text-error",
					)}
				>
					{result === "WIN"
						? t("q:match.timeline.win")
						: t("q:match.timeline.loss")}
				</span>
				{points === 100 ? (
					<span className={styles.resultPoints}>{t("q:match.action.ko")}</span>
				) : points ? (
					<span className={styles.resultPoints}>
						{t("q:match.timeline.points", { count: points })}
					</span>
				) : null}
			</div>
			{weapons ? <WeaponPool weapons={weapons} /> : null}
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
			<div className="stack horizontal items-center sm">
				<Avatar user={substitution.playerOut} size="xxxs" />
				<span className={styles.subPlayerName}>
					{substitution.playerOut.username}
				</span>
			</div>
			<span className={styles.subLabelIn}>{t("q:match.timeline.in")}</span>
			<div className="stack horizontal items-center sm">
				<Avatar user={substitution.playerIn} size="xxxs" />
				<span className={styles.subPlayerName}>
					{substitution.playerIn.username}
				</span>
			</div>
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
		const { spDiff, oldSp, newSp } = member.skillDifference;
		const isPositive = spDiff > 0;
		const arrow = isPositive ? "▲" : "▼";

		return (
			<div className={styles.spDetail}>
				<Avatar user={member.user} size="xxs" />
				<SpDeltaTrigger
					arrow={arrow}
					isPositive={isPositive}
					value={Math.abs(spDiff)}
					oldSp={oldSp}
					newSp={newSp}
				/>
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
				<div className={styles.spDetailContent}>
					<span className={styles.spCalculatingIcon}>◆</span>
					<span>
						{member.skillDifference.newSp ? (
							<>{member.skillDifference.newSp}SP</>
						) : null}
					</span>
				</div>
			</div>
		);
	}

	return (
		<div className={styles.spDetail}>
			<Avatar user={member.user} size="xxs" />
			<div className={styles.spDetailContent}>
				<span className={styles.spCalculatingIcon}>◆</span>
				<span>
					{member.skillDifference.matchesCount}/
					{member.skillDifference.matchesCountNeeded}
				</span>
			</div>
		</div>
	);
}

function SpTeamDetail({
	skillDifference,
}: {
	skillDifference: GroupSkillDifference;
}) {
	if (skillDifference.calculated) {
		const { oldSp, newSp } = skillDifference;
		const diff = newSp - oldSp;
		const isPositive = diff > 0;
		const arrow = isPositive ? "▲" : "▼";

		return (
			<div className={styles.spDetail}>
				<div className={styles.spTeamIcon}>
					<Users size={16} />
				</div>
				<SpDeltaTrigger
					arrow={arrow}
					isPositive={isPositive}
					value={Math.abs(diff)}
					oldSp={oldSp}
					newSp={newSp}
				/>
			</div>
		);
	}

	if (skillDifference.newSp) {
		return (
			<div className={styles.spDetail}>
				<div className={styles.spTeamIcon}>
					<Users size={16} />
				</div>
				<div className={styles.spDetailContent}>
					<span className={styles.spCalculatingIcon}>◆</span>
					<span>{skillDifference.newSp}SP</span>
				</div>
			</div>
		);
	}

	return (
		<div className={styles.spDetail}>
			<div className={styles.spTeamIcon}>
				<Users size={16} />
			</div>
			<div className={styles.spDetailContent}>
				<span className={styles.spCalculatingIcon}>◆</span>
				<span>
					{skillDifference.matchesCount}/{skillDifference.matchesCountNeeded}
				</span>
			</div>
		</div>
	);
}

function SpDeltaTrigger({
	arrow,
	isPositive,
	value,
	oldSp,
	newSp,
}: {
	arrow: string;
	isPositive: boolean;
	value: number;
	oldSp?: number;
	newSp?: number;
}) {
	const arrowClass = isPositive ? "text-success" : "text-warning";

	if (oldSp === undefined || newSp === undefined) {
		return (
			<div className={styles.spDetailContent}>
				<span className={arrowClass}>{arrow}</span>
				<span>{value}SP</span>
			</div>
		);
	}

	return (
		<SendouPopover
			trigger={
				<SendouButton variant="minimal" className={styles.spDeltaTrigger}>
					<span className={arrowClass}>{arrow}</span>
					<span>{value}SP</span>
				</SendouButton>
			}
		>
			<div className={styles.spRawPopover}>
				<span>{oldSp}SP</span>
				<ArrowRight size={16} />
				<span>{newSp}SP</span>
			</div>
		</SendouPopover>
	);
}
