import clsx from "clsx";
import {
	ArrowRight,
	MousePointerClick,
	RefreshCcw,
	TrendingUp,
	Users,
	X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { LocaleTime } from "~/components/LocaleTime";
import type { GroupSkillDifference, UserSkillDifference } from "~/db/tables";
import { shortStageName } from "~/modules/in-game-lists/stage-ids";
import type {
	MainWeaponId,
	ModeShort,
	StageId,
} from "~/modules/in-game-lists/types";
import type { CommonUser } from "~/utils/kysely.server";
import { roundToNDecimalPlaces } from "~/utils/number";
import { Avatar } from "../Avatar";
import { SendouButton } from "../elements/Button";
import { SendouPopover } from "../elements/Popover";
import { ModeImage, StageImage } from "../Image";
import styles from "./MatchTimeline.module.css";
import { type InferredSubstitution, inferSubstitutions } from "./utils";
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
	/** Side that picked this map (counterpick / postGame map PICK). Renders a click indicator next to that side's WIN/LOSS label. */
	pickedBy?: MatchSide;
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

export interface TimelinePickBanEvent {
	/** "PICK" covers MODE_PICK (and the rare trailing-bucket map PICK); "BAN" covers map and mode bans. */
	kind: "PICK" | "BAN";
	/** Consecutive events of the same kind get merged into one row, regardless of side. */
	alphaEntries: Array<{ stageId?: StageId; mode?: ModeShort }>;
	bravoEntries: Array<{ stageId?: StageId; mode?: ModeShort }>;
}

export interface MatchTimelineProps {
	teams: { alpha: TimelineTeam; bravo: TimelineTeam };
	score: { alpha: number; bravo: number };
	maps: TimelineMap[];
	spChanges?: TimelineSpChanges;
	/** When true, render only the team + score header (no per-map rows or SP section). */
	compact?: boolean;
	/** When true, the match is still in progress; renders a small LIVE label under the score. */
	isOngoing?: boolean;
	/**
	 * Pick/ban events keyed by the slot they precede. Length = `maps.length + 1`.
	 * Bucket `i` renders above map row `i`; the trailing bucket renders after the
	 * last map row (covers events made after the latest result, or the
	 * pick/ban-only state with no maps reported yet).
	 */
	pickBanRowsBySlot?: TimelinePickBanEvent[][];
}

export function MatchTimeline({
	teams,
	score,
	maps,
	spChanges,
	compact = false,
	isOngoing = false,
	pickBanRowsBySlot,
}: MatchTimelineProps) {
	return (
		<div className={styles.root}>
			<TimelineHeader
				teams={teams}
				score={score}
				maps={maps}
				isOngoing={isOngoing}
			/>
			{compact
				? null
				: maps.map((map, i) => {
						const previousMap = maps[i - 1];
						const substitutions = previousMap
							? inferSubstitutions(previousMap.rosters, map.rosters)
							: [];
						const pickBanRows = pickBanRowsBySlot?.[i] ?? [];

						return (
							<div key={i} className="contents">
								{pickBanRows.map((event, j) => (
									<TimelinePickBanRow key={`pb-${j}`} event={event} />
								))}
								{substitutions.map((sub, j) => (
									<TimelineSubstitutionRow key={j} substitution={sub} />
								))}
								<TimelineMapRow map={map} />
							</div>
						);
					})}
			{!compact && pickBanRowsBySlot
				? (pickBanRowsBySlot[maps.length] ?? []).map((event, j) => (
						<TimelinePickBanRow key={`pb-trailing-${j}`} event={event} />
					))
				: null}
			{!compact && spChanges ? (
				<TimelineSpSection spChanges={spChanges} />
			) : null}
		</div>
	);
}

function TimelineHeader({
	teams,
	score,
	maps,
	isOngoing,
}: Pick<MatchTimelineProps, "teams" | "score" | "maps" | "isOngoing">) {
	const { t } = useTranslation(["q"]);
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
				<span className={styles.headerScoreValue}>
					{score.alpha}-{score.bravo}
				</span>
				{isOngoing ? (
					<span className={styles.headerScoreLive}>
						{t("q:match.timeline.live")}
					</span>
				) : null}
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

	const alphaPoints = map.points?.[0];
	const bravoPoints = map.points?.[1];

	return (
		<div className={styles.mapEvent}>
			<div className={styles.mapSide}>
				<SideResult
					result={map.winner === "ALPHA" ? "WIN" : "LOSS"}
					points={alphaPoints}
					weapons={map.weapons?.alpha}
					isPicked={map.pickedBy === "ALPHA"}
				/>
			</div>
			<div className={styles.mapCenter}>
				<LocaleTime
					date={new Date(map.timestamp)}
					options={{ hour: "numeric", minute: "numeric" }}
					className={styles.mapTimestamp}
				/>
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
					points={bravoPoints}
					weapons={map.weapons?.bravo}
					isPicked={map.pickedBy === "BRAVO"}
				/>
			</div>
		</div>
	);
}

function SideResult({
	result,
	points,
	weapons,
	isPicked,
}: {
	result: "WIN" | "LOSS";
	points?: number;
	weapons?: Array<MainWeaponId | null>;
	isPicked?: boolean;
}) {
	const { t } = useTranslation(["q"]);

	return (
		<div className={styles.sideResult}>
			<div className={styles.resultHeader}>
				{isPicked ? (
					<ExplainerIcon
						icon={
							<MousePointerClick
								size={14}
								className={result === "WIN" ? "text-success" : "text-error"}
							/>
						}
						description={t("q:match.timeline.explainer.picked")}
					/>
				) : null}
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

function ExplainerIcon({
	icon,
	description,
}: {
	icon: React.ReactNode;
	description: string;
}) {
	return (
		<SendouPopover
			trigger={
				<SendouButton
					variant="minimal"
					className={styles.explainerTrigger}
					aria-label={description}
				>
					{icon}
				</SendouButton>
			}
		>
			{description}
		</SendouPopover>
	);
}

function TimelinePickBanRow({ event }: { event: TimelinePickBanEvent }) {
	const { t } = useTranslation(["q"]);
	const isPick = event.kind === "PICK";
	const icon = isPick ? (
		<MousePointerClick
			size={32}
			className={clsx(styles.eventIcon, styles.pickIcon)}
		/>
	) : (
		<X size={32} className={clsx(styles.eventIcon, styles.banIcon)} />
	);
	const description = isPick
		? t("q:match.timeline.explainer.pick")
		: t("q:match.timeline.explainer.ban");

	return (
		<TimelineEventRow
			icon={<ExplainerIcon icon={icon} description={description} />}
			alphaContent={
				event.alphaEntries.length > 0 ? (
					<PickBanGroup entries={event.alphaEntries} side="ALPHA" />
				) : null
			}
			bravoContent={
				event.bravoEntries.length > 0 ? (
					<PickBanGroup entries={event.bravoEntries} side="BRAVO" />
				) : null
			}
		/>
	);
}

function PickBanGroup({
	entries,
	side,
}: {
	entries: Array<{ stageId?: StageId; mode?: ModeShort }>;
	side: MatchSide;
}) {
	return (
		<div
			className={clsx(styles.pickBanGroup, {
				[styles.pickBanGroupBravo]: side === "BRAVO",
			})}
		>
			{entries.map((entry, i) => (
				<PickBanEntry key={i} entry={entry} />
			))}
		</div>
	);
}

function PickBanEntry({
	entry,
}: {
	entry: { stageId?: StageId; mode?: ModeShort };
}) {
	if (entry.stageId !== undefined) {
		return (
			<StageImage
				stageId={entry.stageId}
				width={56}
				className={styles.pickBanStageImage}
			/>
		);
	}
	if (entry.mode !== undefined) {
		return (
			<div className={styles.pickBanModeTile}>
				<ModeImage mode={entry.mode} size={24} />
			</div>
		);
	}
	return null;
}

function TimelineSubstitutionRow({
	substitution,
}: {
	substitution: InferredSubstitution;
}) {
	const { t } = useTranslation(["q"]);
	return (
		<TimelineEventRow
			icon={
				<ExplainerIcon
					icon={<RefreshCcw size={32} className={styles.eventIcon} />}
					description={t("q:match.timeline.explainer.substitution")}
				/>
			}
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
	const { t } = useTranslation(["q"]);
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
				<ExplainerIcon
					icon={<TrendingUp size={32} className={styles.eventIcon} />}
					description={t("q:match.timeline.explainer.spChange")}
				/>
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
		const diff = roundToNDecimalPlaces(newSp - oldSp);
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
