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
import { StageBannerBox } from "~/components/StageBannerBox";
import type { ScannerMatch } from "../core/scanner-match";
import type { SendStatus } from "../store/events";
import { formatTime } from "./format";
import { lobbyLabel, modeLabel, stageLabel } from "./labels";

const SEND_CHIP_LABELS: Record<SendStatus["state"], string> = {
	queued: "queued",
	sending: "sending…",
	sent: "ingested",
	failed: "failed",
};

export function MatchCard({
	match,
	send,
	onSend,
	live = false,
	ingestable = true,
	children,
}: {
	match: ScannerMatch;
	/** the match's /ingest status, aggregated from its source events */
	send?: SendStatus;
	/** when set, shows a Send/Retry button for this match */
	onSend?: () => void;
	/** still being played: no closing scoreboard yet and the scan is running */
	live?: boolean;
	/** false = isIngestableMatch rejected it (not a private battle) */
	ingestable?: boolean;
	/** expandable detail content, typically the source event cards */
	children?: React.ReactNode;
}) {
	const [expanded, setExpanded] = useState(false);

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
		ingestable ? null : lobbyLabel(match.lobby),
		match.startsAt !== null ? timeRangeLabel(match) : null,
		match.matchScores
			? `set ${match.matchScores[0] ?? "?"}–${match.matchScores[1] ?? "?"}`
			: null,
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
					<div className="match-stage">
						{stageLabel(match.stage) ?? "Unknown stage"}
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
						<Score match={match} />
					)}
					<StatusChip send={send} ingestable={ingestable} live={live} />
					{onSend && send?.state !== "sent" && send?.state !== "sending" ? (
						<button type="button" onClick={onSend}>
							{send?.state === "failed" ? "Retry" : "Send"}
						</button>
					) : null}
				</div>
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
			{send?.state === "failed" && send.error ? (
				<div className="match-error">{send.error}</div>
			) : null}
		</>
	);

	const className = clsx("match-card", send?.state, {
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

function timeRangeLabel(match: ScannerMatch): string {
	const start = formatTime(match.startsAt!);
	return match.endsAt !== null && match.endsAt !== match.startsAt
		? `${start}–${formatTime(match.endsAt)}`
		: start;
}

function Score({ match }: { match: ScannerMatch }) {
	const [alpha, bravo] = match.teams;
	if (alpha.score === null && bravo.score === null) return null;

	// scoreboard-sourced matches list the winners first
	const winnerKnown = match.winner !== null;
	return (
		<div className="match-score">
			<span className={winnerKnown ? "win" : undefined}>
				{alpha.score ?? "?"}
			</span>
			<span className="sep"> – </span>
			<span className={winnerKnown ? "lose" : undefined}>
				{bravo.score ?? "?"}
			</span>
		</div>
	);
}

function TeamWeapons({ match }: { match: ScannerMatch }) {
	const weaponsOf = (team: 0 | 1) =>
		match.teams[team].players
			.map((player, index) => ({
				weaponId: player.weaponId,
				pov: match.pov?.team === team && match.pov.index === index,
			}))
			.filter((weapon) => weapon.weaponId !== null);
	const alpha = weaponsOf(0);
	const bravo = weaponsOf(1);
	if (alpha.length + bravo.length === 0) return null;

	return (
		<div className="match-weapons">
			{alpha.map((weapon, i) => (
				<WeaponImage
					key={i}
					weaponSplId={weapon.weaponId!}
					variant="build"
					size={22}
					className={clsx("weapon-icon", { pov: weapon.pov })}
				/>
			))}
			{alpha.length > 0 && bravo.length > 0 ? (
				<span className="vs">vs</span>
			) : null}
			{bravo.map((weapon, i) => (
				<WeaponImage
					key={i}
					weaponSplId={weapon.weaponId!}
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
	ingestable,
	live,
}: {
	send?: SendStatus;
	ingestable: boolean;
	live: boolean;
}) {
	if (!ingestable) return <span className="match-chip">not ingested</span>;
	if (send) {
		return (
			<span className={clsx("match-chip", send.state)} title={send.error}>
				{send.state === "queued" || send.state === "sending" ? (
					<span className="dot" />
				) : null}
				{send.state === "sent" ? "✓ " : null}
				{SEND_CHIP_LABELS[send.state]}
				{send.state === "sent"
					? ` ${new Date(send.at).toLocaleTimeString()}`
					: null}
			</span>
		);
	}
	if (live) return null;
	return <span className="match-chip">not sent</span>;
}
