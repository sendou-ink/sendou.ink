/**
 * Glanceable card for one ScannerMatch in the live feed: stage banner, mode +
 * stage, score, team weapons and /ingest status. Expanding reveals the source
 * event cards below it.
 */

import clsx from "clsx";
import { ChevronDown } from "lucide-react";
import type * as React from "react";
import { useState } from "react";
import { Ability } from "~/components/Ability";
import { SendouButton } from "~/components/elements/Button";
import { ModeImage, WeaponImage } from "~/components/Image";
import { matchScoresFromObjective } from "~/components/objective-timeline-utils";
import { StageBannerBox } from "~/components/StageBannerBox";
import type { IngestedMatchLink } from "~/features/scanner-ingest/scanner-ingest-schemas";
import type {
	AbilityWithUnknown,
	MainWeaponId,
} from "~/modules/in-game-lists/types";
import { sendouQMatchPage, tournamentMatchPage } from "~/utils/urls";
import type { IngestSkipReason } from "../core/match-builder";
import type { ScannerMatch, ScannerMatchPlayer } from "../core/scanner-match";
import type { SendStatus } from "../store/events";
import { formatTime, useEventTimeFormatter } from "./format";
import { lobbyLabel, modeLabel, stageLabel } from "./labels";
import styles from "./MatchCard.module.css";

/** the game score a knockout wins at */
const KO_MATCH_SCORE = 100;

/** one per gear slot: [head, clothes, shoes], the arc's left-to-right order */
const UNKNOWN_MAIN_ABILITIES: AbilityWithUnknown[] = [
	"UNKNOWN",
	"UNKNOWN",
	"UNKNOWN",
];

/**
 * Where each main sits on the half-moon under the weapon. A positive CSS
 * rotation swings the arc's offset to the *left*, so angles descend to read
 * head, clothes, shoes left to right.
 */
const ABILITY_ARC_ANGLES = ["44deg", "0deg", "-44deg"];

const SEND_STATE_CLASS: Record<SendStatus["state"], string> = {
	queued: styles.queued,
	sending: styles.sending,
	sent: styles.sent,
	unlinked: styles.unlinked,
	failed: styles.failed,
};

const SEND_CHIP_LABELS: Record<Exclude<SendStatus["state"], "sent">, string> = {
	queued: "queued",
	sending: "sending…",
	unlinked: "waiting for report",
	failed: "failed",
};

export function MatchCard({
	match,
	send,
	onSend,
	live = false,
	inProgress = false,
	skipReason,
	justFormed = false,
	children,
}: {
	match: ScannerMatch;
	/** the match's /ingest status, aggregated from its source events */
	send?: SendStatus;
	/** when set, shows a Send/Retry button for this match */
	onSend?: () => void;
	/** still being played: no closing scoreboard yet and the scan is running */
	live?: boolean;
	/** the newest match, still being formulated — shows an "in progress" chip; at most one card */
	inProgress?: boolean;
	/** set = ingestSkipReasons held the match back from /ingest */
	skipReason?: IngestSkipReason;
	/** the scan just formed this match — play the enter animation */
	justFormed?: boolean;
	/** expandable detail content, typically the source event cards */
	children?: React.ReactNode;
}) {
	const [expanded, setExpanded] = useState(false);
	// fixed at mount: re-rendering must not cut the animation short, and a card
	// remounting for another reason (switching lobby tabs) must not replay it
	const [enter] = useState(justFormed);

	// one-shot flash animations only on a state *change*, so already-sent
	// matches don't replay the glow on every mount
	const [prevSendState, setPrevSendState] = useState(send?.state);
	const [flash, setFlash] = useState<"sent" | "failed" | null>(null);
	if (prevSendState !== send?.state) {
		setPrevSendState(send?.state);
		setFlash(
			send?.state === "sent" || send?.state === "failed" ? send.state : null,
		);
	}

	const meta = [
		modeLabel(match.mode),
		skipReason === "lobby" ? lobbyLabel(match.lobby) : null,
		match.startsAt !== null ? timeRangeLabel(match) : null,
		match.replayCode,
		match.cast ? "cast" : null,
	]
		.filter(Boolean)
		.join(" · ");

	const inner = (
		<>
			<div className={styles.main}>
				{match.mode !== null ? (
					<ModeImage mode={match.mode} size={30} className={styles.mode} />
				) : null}
				<div className={styles.headline}>
					<div className={styles.title}>
						<div className={styles.stage}>
							{stageLabel(match.stage) ?? "Unknown stage"}
						</div>
						<StatusChip send={send} skipReason={skipReason} live={live} />
					</div>
					{meta ? <div className={styles.meta}>{meta}</div> : null}
					<TeamWeapons match={match} />
				</div>
				<div className={styles.side}>
					{live ? (
						<span className={clsx(styles.chip, styles.live)}>
							<span className={styles.dot} />
							live
						</span>
					) : (
						<Score match={match} inProgress={inProgress} />
					)}
					{onSend && send?.state !== "sent" && send?.state !== "sending" ? (
						<button type="button" onClick={onSend}>
							{send?.state === "failed" || send?.state === "unlinked"
								? "Retry"
								: "Send"}
						</button>
					) : null}
					{children ? (
						<SendouButton
							variant="minimal"
							size="small"
							shape="circle"
							icon={<ChevronDown />}
							className={clsx(styles.expand, { [styles.expanded]: expanded })}
							aria-expanded={expanded}
							aria-label={expanded ? "Hide events" : "Show events"}
							onPress={() => setExpanded(!expanded)}
						/>
					) : null}
				</div>
			</div>
			{send?.state === "failed" && send.error ? (
				<div className={styles.error}>{send.error}</div>
			) : null}
		</>
	);

	const className = clsx(
		styles.matchCard,
		send?.state ? SEND_STATE_CLASS[send.state] : null,
		{
			[styles.enter]: enter,
			[styles.live]: live,
			[styles.flashSent]: flash === "sent",
			[styles.flashFailed]: flash === "failed",
		},
	);

	const card =
		match.stage !== null ? (
			<StageBannerBox stageId={match.stage} className={className}>
				{inner}
			</StageBannerBox>
		) : (
			<div className={className}>{inner}</div>
		);

	if (!children) return card;
	return (
		<div className={styles.group}>
			{card}
			{expanded ? <div className={styles.events}>{children}</div> : null}
		</div>
	);
}

/** Labeled rule above the newest card of each set in the feed. */
export function SetDivider({ number }: { number: number }) {
	return <div className={styles.setDivider}>Set {number}</div>;
}

function timeRangeLabel(match: ScannerMatch): string {
	const start = formatTime(match.startsAt!);
	return match.endsAt !== null && match.endsAt !== match.startsAt
		? `${start}–${formatTime(match.endsAt)}`
		: start;
}

function Score({
	match,
	inProgress,
}: {
	match: ScannerMatch;
	inProgress: boolean;
}) {
	if (match.matchScores === null) {
		if (!inProgress) return null;
		return (
			<span className={clsx(styles.chip, styles.inProgress)}>
				<span className={styles.dot} />
				in progress
			</span>
		);
	}
	const objectiveScores = matchScoresFromObjective(
		match.objective?.samples ?? [],
	);
	const [left, right] = displayOrder(match);

	return (
		<div className={styles.matchScore}>
			<span className={winnerClass(match, left)}>
				{scoreLabel(match.matchScores[left], objectiveScores[left])}
			</span>
			<span> – </span>
			<span className={winnerClass(match, right)}>
				{scoreLabel(match.matchScores[right], objectiveScores[right])}
			</span>
		</div>
	);
}

/**
 * `teams` order is winner-first on a scoreboard-closed match, so it flips
 * between games. The card keeps the scan's own side (alpha) left and the
 * enemy right for every match so consecutive games line up; footage with no
 * POV seat read (casts) keeps `teams` order.
 */
function displayOrder(match: ScannerMatch): [0 | 1, 0 | 1] {
	return match.pov?.team === 1 ? [1, 0] : [0, 1];
}

function winnerClass(match: ScannerMatch, team: 0 | 1): string | undefined {
	if (match.winner === null) return undefined;
	return match.winner === team ? styles.win : styles.lose;
}

/**
 * A 100 only happens on a knockout, shown the way players say it. A knockout's
 * loser gets no score, so the objective counter's last read stands in —
 * parenthesized, since the scan may have lost sight of the counter early.
 */
function scoreLabel(
	score: number | null,
	objectiveScore: number | null,
): string {
	if (score !== null && score > 0) {
		return score === KO_MATCH_SCORE ? "KO" : String(score);
	}
	if (objectiveScore !== null) {
		return objectiveScore === KO_MATCH_SCORE ? "(KO)" : `(${objectiveScore})`;
	}

	return score === null ? "?" : String(score);
}

interface TeamWeapon {
	weaponId: MainWeaponId;
	/** the scan's own player — highlighted among the eight */
	pov: boolean;
	/** head/clothes/shoes mains; null when no death screen revealed the build */
	mainAbilities: AbilityWithUnknown[] | null;
}

function TeamWeapons({ match }: { match: ScannerMatch }) {
	const weaponsOf = (team: 0 | 1): TeamWeapon[] =>
		match.teams[team].players
			.map((player, index) => ({
				weaponId: player.weaponId,
				pov: match.pov?.team === team && match.pov.index === index,
				mainAbilities: mainAbilities(player),
			}))
			.filter((weapon): weapon is TeamWeapon => weapon.weaponId !== null);
	const [left, right] = displayOrder(match);
	const leftWeapons = weaponsOf(left);
	const rightWeapons = weaponsOf(right);
	if (leftWeapons.length + rightWeapons.length === 0) return null;
	// one read build is enough to show the arcs; the rest fall back to unknowns
	const withAbilities = [...leftWeapons, ...rightWeapons].some(
		(weapon) => weapon.mainAbilities !== null,
	);

	return (
		<div
			className={clsx(styles.weapons, {
				[styles.withAbilities]: withAbilities,
			})}
		>
			{leftWeapons.length > 0 ? (
				<WeaponRow weapons={leftWeapons} withAbilities={withAbilities} />
			) : null}
			{leftWeapons.length > 0 && rightWeapons.length > 0 ? (
				<span className={styles.vs}>vs</span>
			) : null}
			{rightWeapons.length > 0 ? (
				<WeaponRow weapons={rightWeapons} withAbilities={withAbilities} />
			) : null}
		</div>
	);
}

/** The three gear mains of a build, or null when none were read; partial builds keep unknown slots. */
function mainAbilities(
	player: ScannerMatchPlayer,
): AbilityWithUnknown[] | null {
	const mains = UNKNOWN_MAIN_ABILITIES.map(
		(unknown, slot) => player.abilities?.[slot]?.[0] ?? unknown,
	);
	return mains.some((ability) => ability !== "UNKNOWN") ? mains : null;
}

/** One team's weapons, kept together when the card is too narrow for both. */
function WeaponRow({
	weapons,
	withAbilities,
}: {
	weapons: TeamWeapon[];
	withAbilities: boolean;
}) {
	return (
		<div className={styles.weaponRow}>
			{weapons.map((weapon, i) => (
				<div
					key={i}
					className={clsx(styles.weaponSlot, {
						[styles.withAbilities]: withAbilities,
					})}
				>
					<WeaponImage
						weaponSplId={weapon.weaponId}
						variant="build"
						size={28}
						className={clsx(styles.weapon, { [styles.pov]: weapon.pov })}
					/>
					{withAbilities ? (
						<AbilityArc
							abilities={weapon.mainAbilities ?? UNKNOWN_MAIN_ABILITIES}
						/>
					) : null}
				</div>
			))}
		</div>
	);
}

/** Gear mains laid out as a half-moon hugging the weapon's lower edge. */
function AbilityArc({ abilities }: { abilities: AbilityWithUnknown[] }) {
	return (
		<div className={styles.abilityArc}>
			{abilities.map((ability, i) => (
				<span
					key={i}
					className={styles.arcSlot}
					style={
						{ "--arc-angle": ABILITY_ARC_ANGLES[i] } as React.CSSProperties
					}
				>
					<Ability
						ability={ability}
						size="TINY"
						className={styles.arcAbility}
					/>
				</span>
			))}
		</div>
	);
}

function StatusChip({
	send,
	skipReason,
	live,
}: {
	send?: SendStatus;
	skipReason?: IngestSkipReason;
	live: boolean;
}) {
	const formatSentAt = useEventTimeFormatter();
	if (skipReason) {
		return (
			<span className={styles.chip}>
				{skipReason === "disconnect" ? "disconnect" : "not ingested"}
			</span>
		);
	}
	if (send?.state === "sent") {
		return (
			<span
				className={clsx(styles.chip, styles.sent)}
				title={`ingested ${formatSentAt(send.at)}`}
			>
				✓
				{send.link ? (
					<a
						href={ingestedMatchUrl(send.link)}
						target="_blank"
						rel="noreferrer"
					>
						{ingestedMatchLabel(send.link)}
					</a>
				) : null}
			</span>
		);
	}
	if (send) {
		return (
			<span
				className={clsx(styles.chip, SEND_STATE_CLASS[send.state])}
				title={send.error}
			>
				{send.state === "queued" || send.state === "sending" ? (
					<span className={styles.dot} />
				) : null}
				{SEND_CHIP_LABELS[send.state]}
			</span>
		);
	}
	if (live) return null;
	return <span className={styles.chip}>not sent</span>;
}

function ingestedMatchUrl(link: IngestedMatchLink): string {
	return link.type === "tournament"
		? tournamentMatchPage({
				tournamentId: link.tournamentId,
				matchId: link.matchId,
			})
		: sendouQMatchPage(link.groupMatchId);
}

function ingestedMatchLabel(link: IngestedMatchLink): string {
	return link.type === "tournament"
		? `Match ID #${link.matchId}`
		: `SQ Match ID #${link.groupMatchId}`;
}
