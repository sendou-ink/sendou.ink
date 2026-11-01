import type * as React from "react";
import { useTranslation } from "react-i18next";
import { useCamera } from "../broadcast-hooks";
import type {
	BroadcastBracketMatch,
	BroadcastBracketRound,
	BroadcastBracketSide,
	BroadcastState,
	BroadcastView,
	ProducerState,
} from "../broadcast-types";
import { scenePart } from "../broadcast-utils";
import styles from "./BracketScene.module.css";
import { HoldScene } from "./HoldScene";
import { SceneBackdrop } from "./SceneBackdrop";
import { TeamLogo } from "./TeamLogo";

const part = scenePart("bracket");

/**
 * Full screen of a double elimination bracket, the part of it the producer focused on: by default the rounds
 * still being played. Scaled to fill the screen along with its header, then zoomed in on the featured match after
 * a moment, leaving the header out of view.
 */
export function BracketScene({
	state,
	view,
}: {
	state: BroadcastState;
	view: BroadcastView;
}) {
	const bracket = state.bracket[view];
	const cameraRef = useCamera<HTMLDivElement>({
		content: bracket,
		zoomTarget: "[data-featured]",
		zoomedOut: "header",
	});

	if (!bracket || bracket.sides.length === 0) {
		return <HoldScene scene="bracket" state={state} view={view} />;
	}

	return (
		<div className={styles.bracket}>
			<SceneBackdrop />
			<div className={styles.stage}>
				<div ref={cameraRef} className={styles.camera}>
					<header className={styles.header} {...part("header")}>
						<img
							className={styles.tournamentLogo}
							src={state.tournament.logoUrl}
							alt=""
							{...part("tournament-logo")}
						/>
						<div className={styles.headerText}>
							<div
								className={styles.tournamentName}
								{...part("tournament-name")}
							>
								{state.tournament.name}
							</div>
							<h1 className={styles.bracketName} {...part("bracket-name")}>
								{bracket.name}
							</h1>
						</div>
					</header>
					<div className={styles.sides}>
						{bracket.sides.map((side) => (
							<Side key={side.type} side={side} producer={state[view]} />
						))}
					</div>
				</div>
			</div>
		</div>
	);
}

function Side({
	side,
	producer,
}: {
	side: BroadcastBracketSide;
	producer: Pick<ProducerState, "swapSides">;
}) {
	return (
		<section
			className={styles.side}
			data-side={side.type}
			style={{ "--slots": side.slotCount } as React.CSSProperties}
			{...part("side")}
		>
			{side.rounds.map((round) => (
				<Round key={round.id} round={round} producer={producer} />
			))}
		</section>
	);
}

function Round({
	round,
	producer,
}: {
	round: BroadcastBracketRound;
	producer: Pick<ProducerState, "swapSides">;
}) {
	return (
		<div
			className={styles.round}
			data-connector={round.connector ?? undefined}
			{...part("round")}
		>
			<div className={styles.roundName} {...part("round-name")}>
				{round.name}
			</div>
			<ol className={styles.slots}>
				{round.matches.map((match, matchIdx) => (
					<li
						key={match?.id ?? `bye-${matchIdx}`}
						className={styles.slot}
						data-bye={match ? undefined : true}
						data-fed={match?.isFed || undefined}
					>
						{match ? <Match match={match} producer={producer} /> : null}
					</li>
				))}
			</ol>
		</div>
	);
}

function Match({
	match,
	producer,
}: {
	match: BroadcastBracketMatch;
	producer: Pick<ProducerState, "swapSides">;
}) {
	const { t } = useTranslation(["broadcast"]);

	return (
		<div
			className={styles.match}
			data-status={matchStatus(match)}
			data-featured={match.isFeatured || undefined}
			{...part("match")}
		>
			{([0, 1] as const).map((index) => {
				const team = match.teams[index];

				return (
					<div
						key={index}
						className={styles.team}
						data-result={
							match.winner === null
								? undefined
								: match.winner === index
									? "win"
									: "loss"
						}
						// the featured match's teams in the colors of their sides on the other scenes
						data-team={
							match.isFeatured
								? (index === 0) !== producer.swapSides
									? "a"
									: "b"
								: undefined
						}
						data-tbd={team ? undefined : true}
						{...part("team")}
					>
						{team ? (
							<TeamLogo
								team={team}
								className={styles.logo}
								{...part("team-logo")}
							/>
						) : (
							<span className={styles.logo} />
						)}
						{typeof team?.seed === "number" ? (
							<span className={styles.seed} {...part("team-seed")}>
								{team.seed}
							</span>
						) : null}
						<span className={styles.name} {...part("team-name")}>
							{team?.name ?? t("broadcast:overlay.tbd")}
						</span>
						<span className={styles.score} {...part("team-score")}>
							{match.scores?.[index]}
						</span>
					</div>
				);
			})}
		</div>
	);
}

function matchStatus(match: BroadcastBracketMatch) {
	if (match.winner !== null) return "over";
	if (match.scores) return "ongoing";
	if (match.teams[0] && match.teams[1]) return "ready";

	return "waiting";
}
