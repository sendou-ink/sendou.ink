import clsx from "clsx";
import {
	ArrowRight,
	ChevronDown,
	MousePointerClick,
	RefreshCcw,
	TrendingUp,
	Users,
	X,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { LocaleTime } from "~/components/LocaleTime";
import type {
	GroupSkillDifference,
	UserSkillDifference,
} from "~/features/sendouq-match/core/SkillDifference";
import { abilities } from "~/modules/in-game-lists/abilities";
import { shortStageName } from "~/modules/in-game-lists/stage-ids";
import type {
	AbilityWithUnknown,
	MainWeaponId,
	ModeShort,
	StageId,
} from "~/modules/in-game-lists/types";
import type { CommonUser } from "~/utils/kysely.server";
import { abilityImageUrl, navIconUrl } from "~/utils/urls";
import { Ability } from "../Ability";
import { Avatar } from "../Avatar";
import { SendouButton } from "../elements/Button";
import { SendouPopover } from "../elements/Popover";
import { GameTimeline } from "../GameTimeline";
import { Image, ModeImage, StageImage, WeaponImage } from "../Image";
import type { ObjectiveTimelineEvent } from "../ObjectiveTimeline";
import { matchScoresFromObjective } from "../objective-timeline-utils";
import type { PlayerStatusTimelineSample } from "../PlayerStatusTimeline";
import { SpDelta } from "../SpDelta";
import styles from "./MatchTimeline.module.css";
import { type InferredSubstitution, inferSubstitutions } from "./utils";
import type { WeaponPoolWeapon } from "./WeaponPool";
import { WeaponPool } from "./WeaponPool";

const LONG_TEAM_NAME_THRESHOLD = 16;

/** Ingested team scores run 0-100; a knockout shows as 100 for the winner. */
const SCOREBOARD_KO_SCORE = 100;

const ABILITY_NAMES: ReadonlySet<string> = new Set(
	abilities.map((ability) => ability.name),
);

type MatchSide = "ALPHA" | "BRAVO";

export interface TimelineTeam {
	name: string;
	avatar?: string;
}

export interface TimelineScoreboardPlayer {
	name: string;
	weaponSplId: MainWeaponId | null;
	ka: number | null;
	d: number | null;
	s: number | null;
	paint: number | null;
	/** [head, clothes, shoes] ability rows (main + subs) as ability codes */
	abilities?: string[][];
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
		alpha: WeaponPoolWeapon[];
		bravo: WeaponPoolWeapon[];
	};
	/** Whether the game ended in a knockout. Undefined if not collected. */
	ko?: boolean;
	/** Side that picked this map (counterpick / postGame map PICK), shown as a click indicator. */
	pickedBy?: MatchSide;
	/** Ingested end-of-game scoreboard, an expandable stats section below the map row. */
	scoreboard?: {
		/** [alpha, bravo] on the ingested 0-100 scale (100 = knockout) */
		scores: [number | null, number | null];
		alpha: TimelineScoreboardPlayer[];
		bravo: TimelineScoreboardPlayer[];
		/** [alpha, bravo] objective-counter reads charted above the stats tables */
		objective?: ObjectiveTimelineEvent[];
		/** [alpha, bravo] per-player splat/special bands charted above the objective chart */
		playerStatus?: PlayerStatusTimelineSample[];
	};
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
	score?: { alpha: number; bravo: number };
	maps: TimelineMap[];
	spChanges?: TimelineSpChanges;
	/** only the team + score header, no per-map rows or SP section */
	compact?: boolean;
	/** renders a LIVE label under the score */
	isOngoing?: boolean;
	/**
	 * Pick/ban events keyed by the slot they precede, length `maps.length + 1`. Bucket `i` renders
	 * above map row `i`; the trailing bucket after the last row (events after the latest result).
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
								<TimelineMapRow map={map} teams={teams} />
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
				{score ? (
					<span className={styles.headerScoreValue}>
						{score.alpha}-{score.bravo}
					</span>
				) : null}
				{isOngoing ? (
					<span className={styles.headerScoreLive}>
						{t("q:match.timeline.ongoing")}
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

function TimelineMapRow({
	map,
	teams,
}: {
	map: TimelineMap;
	teams: MatchTimelineProps["teams"];
}) {
	const { t } = useTranslation(["game-misc"]);
	const objectiveScores = matchScoresFromObjective(
		(map.scoreboard?.objective ?? []).map((event) => ({
			t: event.t,
			score: event.data.score,
		})),
	);

	return (
		<div className={styles.mapEvent}>
			<div className={styles.mapSide}>
				<SideResult
					result={map.winner === "ALPHA" ? "WIN" : "LOSS"}
					isKo={map.ko && map.winner === "ALPHA"}
					scoreboardScore={map.scoreboard?.scores[0]}
					objectiveScore={objectiveScores[0]}
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
			<div className={clsx(styles.mapSide, styles.mapSideBravo)}>
				<SideResult
					result={map.winner === "BRAVO" ? "WIN" : "LOSS"}
					isKo={map.ko && map.winner === "BRAVO"}
					scoreboardScore={map.scoreboard?.scores[1]}
					objectiveScore={objectiveScores[1]}
					weapons={map.weapons?.bravo}
					isPicked={map.pickedBy === "BRAVO"}
				/>
			</div>
			{map.scoreboard ? (
				<TimelineScoreboardSection scoreboard={map.scoreboard} teams={teams} />
			) : null}
		</div>
	);
}

function SideResult({
	result,
	isKo,
	scoreboardScore,
	objectiveScore,
	weapons,
	isPicked,
}: {
	result: "WIN" | "LOSS";
	isKo?: boolean;
	/** ingested 0-100 team score (100 = knockout) */
	scoreboardScore?: number | null;
	/** 0-100 team score implied by the last objective-counter read */
	objectiveScore?: number | null;
	weapons?: WeaponPoolWeapon[];
	isPicked?: boolean;
}) {
	const { t } = useTranslation(["q"]);
	const score = resolveSideScore(scoreboardScore, objectiveScore);

	return (
		<div className={styles.sideResult}>
			<div className={styles.resultHeaderGroup}>
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
					{isKo && score === null ? (
						<span className={styles.resultPoints}>
							{t("q:match.action.ko")}
						</span>
					) : null}
				</div>
				{score ? <ResultPoints score={score} /> : null}
			</div>
			{weapons ? <WeaponPool weapons={weapons} /> : null}
		</div>
	);
}

interface SideScore {
	/** 0-100 (100 = knockout) */
	value: number;
	/** read off the objective counter rather than the results screen */
	fromObjective: boolean;
}

/** A knockout's loser has no reported score, so prefer the objective counter read over a scoreless 0. */
function resolveSideScore(
	scoreboardScore?: number | null,
	objectiveScore?: number | null,
): SideScore | null {
	if (typeof scoreboardScore === "number" && scoreboardScore > 0) {
		return { value: scoreboardScore, fromObjective: false };
	}
	if (typeof objectiveScore === "number") {
		return { value: objectiveScore, fromObjective: true };
	}
	if (typeof scoreboardScore === "number") {
		return { value: scoreboardScore, fromObjective: false };
	}

	return null;
}

function ResultPoints({ score }: { score: SideScore }) {
	const { t } = useTranslation(["q"]);

	if (score.value === SCOREBOARD_KO_SCORE) {
		return (
			<span className={styles.resultPoints}>{t("q:match.action.ko")}</span>
		);
	}

	return (
		<span className={styles.resultPoints}>
			{score.fromObjective
				? `(${score.value})`
				: t("q:match.timeline.points", { points: score.value })}
		</span>
	);
}

function TimelineScoreboardSection({
	scoreboard,
	teams,
}: {
	scoreboard: NonNullable<TimelineMap["scoreboard"]>;
	teams: MatchTimelineProps["teams"];
}) {
	const { t } = useTranslation(["q"]);
	const [isExpanded, setIsExpanded] = useState(false);

	return (
		<div className={styles.scoreboard}>
			<button
				type="button"
				className={styles.scoreboardToggle}
				onClick={() => setIsExpanded(!isExpanded)}
				aria-expanded={isExpanded}
			>
				{t("q:match.timeline.details")}
				<ChevronDown
					size={14}
					className={clsx(styles.scoreboardChevron, {
						[styles.scoreboardChevronOpen]: isExpanded,
					})}
				/>
			</button>
			{isExpanded ? (
				<div className={styles.scoreboardPanel}>
					<GameTimeline
						objectiveEvents={scoreboard.objective}
						playerStatusSamples={scoreboard.playerStatus}
						teams={[
							{
								label: teams.alpha.name,
								weapons: scoreboard.alpha.map((player) => player.weaponSplId),
							},
							{
								label: teams.bravo.name,
								weapons: scoreboard.bravo.map((player) => player.weaponSplId),
							},
						]}
					/>
					<div className={styles.scoreboardTables}>
						<ScoreboardTable
							name={teams.alpha.name}
							players={scoreboard.alpha}
						/>
						<ScoreboardTable
							name={teams.bravo.name}
							players={scoreboard.bravo}
						/>
					</div>
				</div>
			) : null}
		</div>
	);
}

function ScoreboardTable({
	name,
	players,
}: {
	name: string;
	players: TimelineScoreboardPlayer[];
}) {
	const { t } = useTranslation(["q"]);

	return (
		<table className={styles.scoreboardTable}>
			<thead>
				<tr className={styles.scoreboardHeaderRow}>
					<th className={styles.scoreboardWeaponColumn} />
					<th scope="col" className={styles.scoreboardTeamName}>
						{name}
					</th>
					<th scope="col" className={styles.scoreboardStatHeader}>
						{t("q:match.timeline.stats.paint")}
					</th>
					<th scope="col" className={styles.scoreboardStatHeader}>
						{t("q:match.timeline.stats.kills")}
					</th>
					<th scope="col" className={styles.scoreboardStatHeader}>
						{t("q:match.timeline.stats.deaths")}
					</th>
					<th scope="col" className={styles.scoreboardStatHeader}>
						{t("q:match.timeline.stats.specials")}
					</th>
					<th className={styles.scoreboardBuildColumn} />
				</tr>
			</thead>
			<tbody>
				{players.map((player, i) => (
					<tr key={i} className={styles.scoreboardPlayerRow}>
						<td className={styles.scoreboardWeaponCell}>
							{player.weaponSplId !== null ? (
								<WeaponImage
									weaponSplId={player.weaponSplId}
									variant="badge"
									size={28}
								/>
							) : (
								<Image
									path={abilityImageUrl("UNKNOWN")}
									alt="?"
									size={28}
									className={styles.scoreboardUnknownWeapon}
								/>
							)}
						</td>
						<th scope="row" className={styles.scoreboardPlayerName}>
							{player.name}
						</th>
						<td className={styles.scoreboardStat}>
							{player.paint !== null
								? t("q:match.timeline.points", { points: player.paint })
								: "–"}
						</td>
						<td className={styles.scoreboardStat}>{player.ka ?? "–"}</td>
						<td className={styles.scoreboardStat}>{player.d ?? "–"}</td>
						<td className={styles.scoreboardStat}>{player.s ?? "–"}</td>
						<td className={styles.scoreboardBuildCell}>
							{player.abilities && player.abilities.length > 0 ? (
								<ScoreboardBuildPopover abilities={player.abilities} />
							) : null}
						</td>
					</tr>
				))}
			</tbody>
		</table>
	);
}

function ScoreboardBuildPopover({ abilities }: { abilities: string[][] }) {
	const { t } = useTranslation(["common"]);

	return (
		<SendouPopover
			trigger={
				<SendouButton shape="circle" size="small" variant="minimal">
					<Image
						path={navIconUrl("builds")}
						alt={t("common:pages.builds")}
						size={18}
					/>
				</SendouButton>
			}
		>
			<div className={styles.scoreboardAbilities}>
				{abilities.map((row, i) => (
					<div key={i} className={styles.scoreboardAbilityRow}>
						{row.map((ability, j) => (
							<Ability
								key={j}
								ability={toAbility(ability)}
								size={j === 0 ? "MAIN" : "SUB"}
							/>
						))}
					</div>
				))}
			</div>
		</SendouPopover>
	);
}

function toAbility(value: string): AbilityWithUnknown {
	return ABILITY_NAMES.has(value) ? (value as AbilityWithUnknown) : "UNKNOWN";
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

		return (
			<div className={styles.spDetail}>
				<Avatar user={member.user} size="xxs" />
				<SpDeltaTrigger diff={spDiff} oldSp={oldSp} newSp={newSp} />
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

		return (
			<div className={styles.spDetail}>
				<div className={styles.spTeamIcon}>
					<Users size={16} />
				</div>
				<SpDeltaTrigger diff={newSp - oldSp} oldSp={oldSp} newSp={newSp} />
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
	diff,
	oldSp,
	newSp,
}: {
	diff: number;
	oldSp?: number;
	newSp?: number;
}) {
	if (oldSp === undefined || newSp === undefined) {
		return (
			<div className={styles.spDetailContent}>
				<SpDelta diff={diff} />
			</div>
		);
	}

	return (
		<SendouPopover
			trigger={
				<SendouButton variant="minimal" className={styles.spDeltaTrigger}>
					<SpDelta diff={diff} />
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
