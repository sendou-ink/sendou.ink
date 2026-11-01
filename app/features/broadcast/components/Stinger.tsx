import type * as React from "react";
import { useEffect, useEffectEvent } from "react";
import { useTranslation } from "react-i18next";
import type {
	BroadcastMatch,
	BroadcastState,
	BroadcastView,
} from "../broadcast-types";
import {
	inkColorVars,
	type MatchSide,
	matchSides,
	roundLabel,
	scenePart,
} from "../broadcast-utils";
import { SetLength } from "./SetLength";
import styles from "./Stinger.module.css";
import { TeamLogo } from "./TeamLogo";

const part = scenePart("stinger");

// a theme turning the animations off would otherwise leave the stinger covering the screen for good
const STINGER_FALLBACK_MS = 10_000;

/** In stacking order, the first two team colored. The default design shows only those, custom CSS can show the rest. */
const PANELS: Array<"a" | "b" | null> = [
	"a",
	"b",
	null,
	null,
	null,
	null,
	null,
	null,
];

/**
 * Full screen transition with the upcoming match's teams, replacing a pre-rendered stinger video. Calls `onCovered`
 * once nothing of the scene underneath shows, the moment to change it, and `onDone` once the new scene is revealed.
 * Its timing is all CSS, scaled by `--bc-stinger-duration` and placed by `--bc-stinger-covered-at`/`--bc-stinger-reveal-at`.
 */
export function Stinger({
	state,
	view,
	onCovered,
	onDone,
}: {
	/** The state going on air. */
	state: BroadcastState;
	view: BroadcastView;
	onCovered: () => void;
	onDone: () => void;
}) {
	const fallback = useEffectEvent(() => {
		onCovered();
		onDone();
	});
	useEffect(() => {
		const timeout = setTimeout(fallback, STINGER_FALLBACK_MS);
		return () => clearTimeout(timeout);
	}, []);

	return (
		<div
			className={styles.stinger}
			style={inkColorVars(state[view])}
			{...part("stinger")}
			onAnimationEnd={(event) => {
				if (event.target === event.currentTarget) onDone();
			}}
		>
			<span
				className={styles.coverClock}
				onAnimationEnd={(event) => {
					event.stopPropagation();
					onCovered();
				}}
			/>
			<Panels />
			<Card state={state} view={view} />
		</div>
	);
}

/** The full screen shapes covering the scene, team colored ones carry the team in `data-team`. */
function Panels() {
	return PANELS.map((team, i) => (
		<div
			key={i}
			className={styles.panel}
			data-team={team ?? undefined}
			data-index={i}
			style={{ "--i": i, "--j": PANELS.length - 1 - i } as React.CSSProperties}
			{...part("stinger-panel")}
		/>
	));
}

/**
 * The teams facing each other with the tournament's logo under them, only the logo without a match.
 * Going into the game the logo is on a header at the bottom, with the tournament and the round.
 */
function Card({ state, view }: { state: BroadcastState; view: BroadcastView }) {
	const { t } = useTranslation(["broadcast"]);
	const match = state.match;
	const sides = match ? matchSides(match, view, state[view]) : null;
	const showScores = (match?.progress[view].resultCount ?? 0) > 0;

	return (
		<div
			className={styles.card}
			data-has-teams={sides ? true : undefined}
			{...part("stinger-card")}
		>
			{sides ? (
				<div className={styles.teams} {...part("stinger-teams")}>
					<StingerTeam side={sides[0]} showScore={showScores} />
					<span className={styles.versus} {...part("stinger-vs")}>
						{t("broadcast:overlay.vs")}
					</span>
					<StingerTeam side={sides[1]} showScore={showScores} />
				</div>
			) : null}
			{match && state[view].scene === "game" ? (
				<StingerHeader state={state} match={match} />
			) : (
				<img
					className={styles.tournamentLogo}
					src={state.tournament.logoUrl}
					alt=""
					{...part("stinger-tournament-logo")}
				/>
			)}
		</div>
	);
}

function StingerHeader({
	state,
	match,
}: {
	state: BroadcastState;
	match: BroadcastMatch;
}) {
	return (
		<div className={styles.header} {...part("stinger-header")}>
			<img
				className={styles.headerLogo}
				src={state.tournament.logoUrl}
				alt=""
				{...part("stinger-tournament-logo")}
			/>
			<div className={styles.headerText}>
				<div
					className={styles.tournamentName}
					{...part("stinger-tournament-name")}
				>
					{state.tournament.name}
				</div>
				<div className={styles.round} {...part("stinger-round")}>
					{roundLabel(match)}
					<span className={styles.setLength} {...part("stinger-set-length")}>
						<SetLength match={match} />
					</span>
				</div>
			</div>
		</div>
	);
}

function StingerTeam({
	side,
	showScore,
}: {
	side: MatchSide;
	showScore: boolean;
}) {
	const { t } = useTranslation(["broadcast"]);

	return (
		<div
			className={styles.team}
			data-team={side.side}
			{...part("stinger-team")}
		>
			<TeamLogo
				team={side.team}
				className={styles.teamLogo}
				{...part("stinger-team-logo")}
			/>
			<span className={styles.teamName} {...part("stinger-team-name")}>
				{side.team?.name ?? t("broadcast:overlay.tbd")}
			</span>
			{showScore ? (
				<span className={styles.teamScore} {...part("stinger-team-score")}>
					{side.score}
				</span>
			) : null}
		</div>
	);
}
