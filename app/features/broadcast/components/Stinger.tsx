import type * as React from "react";
import { useEffect, useEffectEvent } from "react";
import { useTranslation } from "react-i18next";
import type {
	BroadcastMatch,
	BroadcastState,
	BroadcastView,
} from "../broadcast-types";
import {
	combineStyles,
	type MatchSide,
	matchSides,
	roundLabel,
	scenePart,
} from "../broadcast-utils";
import { SetLength } from "./SetLength";
import layout from "./Stinger.layout.module.css";
import look from "./Stinger.module.css";
import { TeamLogo } from "./TeamLogo";

const styles = combineStyles(look, layout);

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
 * Its timing is all CSS, scaled by `--bc-stinger-duration` and placed by `--bc-stinger-covered-at`/`--bc-stinger-reveal-at`/`--bc-stinger-entrance-at`.
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
			data-has-match={state.match ? true : undefined}
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
 * The teams facing each other over a header with the tournament, which going into the game also has the round.
 * Without a match, a title card of the tournament.
 */
function Card({ state, view }: { state: BroadcastState; view: BroadcastView }) {
	const { t } = useTranslation(["broadcast"]);
	const match = state.match;
	const sides = match ? matchSides(match, view, state[view]) : null;
	const showScores = (match?.progress[view].resultCount ?? 0) > 0;

	if (!match || !sides) {
		return (
			<div className={styles.card} {...part("stinger-card")}>
				<div className={styles.titleCard} {...part("stinger-title-card")}>
					<img
						className={styles.titleCardLogo}
						src={state.tournament.logoUrl}
						alt=""
						{...part("stinger-tournament-logo")}
					/>
					<div
						className={styles.titleCardName}
						{...part("stinger-tournament-name")}
					>
						{state.tournament.name}
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className={styles.card} {...part("stinger-card")}>
			<div className={styles.teams} {...part("stinger-teams")}>
				<StingerTeam side={sides[0]} showScore={showScores} />
				<span className={styles.versus} {...part("stinger-vs")}>
					{t("broadcast:overlay.vs")}
				</span>
				<StingerTeam side={sides[1]} showScore={showScores} />
			</div>
			<StingerHeader
				state={state}
				match={match}
				showRound={state[view].scene === "game"}
			/>
		</div>
	);
}

function StingerHeader({
	state,
	match,
	showRound,
}: {
	state: BroadcastState;
	match: BroadcastMatch;
	showRound: boolean;
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
				{showRound ? (
					<div className={styles.round} {...part("stinger-round")}>
						{roundLabel(match)}
						<span className={styles.setLength} {...part("stinger-set-length")}>
							<SetLength match={match} />
						</span>
					</div>
				) : null}
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
