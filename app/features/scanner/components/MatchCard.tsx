/**
 * Glanceable card for one ScannerMatch in the live feed: stage banner
 * background, mode + stage, score, team weapons, and the match's /ingest
 * status. Expanding the card reveals the source event cards below it,
 * so the raw per-event view stays one click away.
 */

import clsx from "clsx";
import { ChevronDown } from "lucide-react";
import type * as React from "react";
import { useState } from "react";
import { SendouButton } from "~/components/elements/Button";
import { ModeImage, WeaponImage } from "~/components/Image";
import { matchScoresFromObjective } from "~/components/objective-timeline-utils";
import { StageBannerBox } from "~/components/StageBannerBox";
import type { IngestedMatchLink } from "~/features/scanner-ingest/scanner-ingest-schemas";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { sendouQMatchPage, tournamentMatchPage } from "~/utils/urls";
import type { IngestSkipReason } from "../core/match-builder";
import type { ScannerMatch } from "../core/scanner-match";
import type { SendStatus } from "../store/events";
import { formatTime } from "./format";
import { lobbyLabel, modeLabel, stageLabel } from "./labels";

/** the game score a knockout wins at */
const KO_MATCH_SCORE = 100;

const SEND_CHIP_LABELS: Record<Exclude<SendStatus["state"], "sent">, string> = {
	queued: "queued",
	sending: "sending…",
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
	/**
	 * the newest match, still being formulated (no result yet) — shows an
	 * "in progress" chip in the score slot; at most one card should get this
	 */
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
			<div className="match-card-main">
				{match.mode !== null ? (
					<ModeImage mode={match.mode} size={30} className="match-mode" />
				) : null}
				<div className="match-headline">
					<div className="match-title">
						<div className="match-stage">
							{stageLabel(match.stage) ?? "Unknown stage"}
						</div>
						<StatusChip send={send} skipReason={skipReason} live={live} />
					</div>
					{meta ? <div className="match-meta">{meta}</div> : null}
					<TeamWeapons match={match} />
				</div>
				<div className="match-side">
					{live ? (
						<span className="match-chip live">
							<span className="dot" />
							live
						</span>
					) : (
						<Score match={match} inProgress={inProgress} />
					)}
					{onSend && send?.state !== "sent" && send?.state !== "sending" ? (
						<button type="button" onClick={onSend}>
							{send?.state === "failed" ? "Retry" : "Send"}
						</button>
					) : null}
					{children ? (
						<SendouButton
							variant="minimal"
							size="small"
							shape="circle"
							icon={<ChevronDown />}
							className={clsx("match-expand", { expanded })}
							aria-expanded={expanded}
							aria-label={expanded ? "Hide events" : "Show events"}
							onPress={() => setExpanded(!expanded)}
						/>
					) : null}
				</div>
			</div>
			{send?.state === "failed" && send.error ? (
				<div className="match-error">{send.error}</div>
			) : null}
		</>
	);

	const className = clsx("match-card", send?.state, {
		enter,
		live,
		"flash-sent": flash === "sent",
		"flash-failed": flash === "failed",
	});

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
		<div className="match-card-group">
			{card}
			{expanded ? <div className="match-events">{children}</div> : null}
		</div>
	);
}

/** Labeled rule above the newest card of each set in the feed. */
export function SetDivider({ number }: { number: number }) {
	return <div className="set-divider">Set {number}</div>;
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
			<span className="match-chip in-progress">
				<span className="dot" />
				in progress
			</span>
		);
	}
	const [alpha, bravo] = match.matchScores;
	const objectiveScores = matchScoresFromObjective(
		match.objective?.samples ?? [],
	);

	// scoreboard-sourced matches list the winners first
	const winnerKnown = match.winner !== null;
	return (
		<div className="match-score">
			<span className={winnerKnown ? "win" : undefined}>
				{scoreLabel(alpha, objectiveScores[0])}
			</span>
			<span className="sep"> – </span>
			<span className={winnerKnown ? "lose" : undefined}>
				{scoreLabel(bravo, objectiveScores[1])}
			</span>
		</div>
	);
}

/**
 * A 100 only happens on a knockout, shown the way players say it. A knockout's
 * loser gets no score of its own, so the objective counter's last read stands
 * in — parenthesized, since the scan read it off the video and may have lost
 * sight of the counter before the game ended.
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
}

function TeamWeapons({ match }: { match: ScannerMatch }) {
	const weaponsOf = (team: 0 | 1): TeamWeapon[] =>
		match.teams[team].players
			.map((player, index) => ({
				weaponId: player.weaponId,
				pov: match.pov?.team === team && match.pov.index === index,
			}))
			.filter((weapon): weapon is TeamWeapon => weapon.weaponId !== null);
	const alpha = weaponsOf(0);
	const bravo = weaponsOf(1);
	if (alpha.length + bravo.length === 0) return null;

	return (
		<div className="match-weapons">
			{alpha.length > 0 ? <WeaponRow weapons={alpha} /> : null}
			{alpha.length > 0 && bravo.length > 0 ? (
				<span className="vs">vs</span>
			) : null}
			{bravo.length > 0 ? <WeaponRow weapons={bravo} /> : null}
		</div>
	);
}

/** One team's weapons, kept together when the card is too narrow for both. */
function WeaponRow({ weapons }: { weapons: TeamWeapon[] }) {
	return (
		<div className="weapon-row">
			{weapons.map((weapon, i) => (
				<WeaponImage
					key={i}
					weaponSplId={weapon.weaponId}
					variant="build"
					size={22}
					className={clsx("weapon-icon", { pov: weapon.pov })}
				/>
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
	if (skipReason) {
		return (
			<span className="match-chip">
				{skipReason === "disconnect" ? "disconnect" : "not ingested"}
			</span>
		);
	}
	if (send?.state === "sent") {
		return (
			<span
				className="match-chip sent"
				title={`ingested ${new Date(send.at).toLocaleTimeString()}`}
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
			<span className={clsx("match-chip", send.state)} title={send.error}>
				{send.state === "queued" || send.state === "sending" ? (
					<span className="dot" />
				) : null}
				{SEND_CHIP_LABELS[send.state]}
			</span>
		);
	}
	if (live) return null;
	return <span className="match-chip">not sent</span>;
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
