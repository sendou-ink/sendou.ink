import type * as React from "react";
import { useEffect, useEffectEvent } from "react";
import { useTranslation } from "react-i18next";
import type {
	BroadcastMatch,
	BroadcastStingerVariant,
	BroadcastView,
} from "~/features/broadcast/broadcast-types";
import {
	combineStyles,
	type MatchSide,
	matchSides,
	roundLabel,
} from "~/features/broadcast/broadcast-utils";
import { SetLength } from "~/features/broadcast/components/SetLength";
import { TeamLogo } from "~/features/broadcast/components/TeamLogo";
import { CAST_PRODUCER_RULES } from "../broadcast-cast-constants";
import type { CastBroadcastState, CastScene } from "../broadcast-cast-types";
import { scenePart } from "../broadcast-cast-utils";
import layout from "./Stinger.layout.module.css";
import look from "./Stinger.module.css";

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

/** Rows drifting behind the tournament's title card, each its text this many times over. */
const TITLE_BACKDROP_ROW_COUNT = 3;
const TITLE_BACKDROP_REPEATS = 4;

/**
 * Full screen transition replacing a pre-rendered stinger video, in `data-variant`: going into or out of the game the
 * featured match's teams, otherwise (and without a match) a title card of the tournament. Calls `onCovered`
 * once nothing of the scene underneath shows, the moment to change it, and `onDone` once the new scene is revealed.
 * Its timing is all CSS, scaled by `--bc-stinger-duration` and placed by `--bc-stinger-covered-at`/`--bc-stinger-reveal-at`/`--bc-stinger-entrance-at`.
 */
export function Stinger({
	state,
	view,
	fromScene,
	variant = isIntoOrOutOfGame(fromScene, state[view].scene)
		? "teams"
		: "tournament",
	onCovered,
	onDone,
}: {
	/** The state going on air. */
	state: CastBroadcastState;
	view: BroadcastView;
	/** The scene the stinger covers. */
	fromScene: CastScene;
	variant?: BroadcastStingerVariant;
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

	const teamsMatch = variant === "teams" ? state.match : null;

	return (
		<div
			className={styles.stinger}
			data-variant={teamsMatch ? "teams" : "tournament"}
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
			{teamsMatch ? (
				<TeamsCard state={state} view={view} match={teamsMatch} />
			) : (
				<TitleCard state={state} />
			)}
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

/** The teams facing each other over a header with the tournament, which going into the game also has the round. */
function TeamsCard({
	state,
	view,
	match,
}: {
	state: CastBroadcastState;
	view: BroadcastView;
	match: BroadcastMatch;
}) {
	const { t } = useTranslation(["broadcast"]);
	const sides = matchSides(match, view, state[view]);
	const showScores = match.progress[view].resultCount > 0;

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

/**
 * The tournament's logo and name on the theme's own colors instead of the teams', drifting behind in rows its name
 * alternating with its organization's.
 */
function TitleCard({ state }: { state: CastBroadcastState }) {
	const { name, organizationName } = state.tournament;
	const backdropRows = Array.from(
		{ length: TITLE_BACKDROP_ROW_COUNT },
		(_, row) => {
			const text = organizationName && row % 2 === 1 ? organizationName : name;

			return Array.from({ length: TITLE_BACKDROP_REPEATS }, () => text).join(
				" · ",
			);
		},
	);

	return (
		<div className={styles.card} {...part("stinger-card")}>
			<div
				className={styles.titleBackdrop}
				aria-hidden
				{...part("stinger-title-backdrop")}
			>
				{backdropRows.map((text, row) => (
					<div
						key={row}
						className={styles.titleBackdropRow}
						data-index={row}
						{...part("stinger-title-backdrop-row")}
					>
						{text}
					</div>
				))}
			</div>
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

function StingerHeader({
	state,
	match,
	showRound,
}: {
	state: CastBroadcastState;
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

function isIntoOrOutOfGame(fromScene: CastScene, toScene: CastScene) {
	return (
		fromScene === CAST_PRODUCER_RULES.gameScene ||
		toScene === CAST_PRODUCER_RULES.gameScene
	);
}
