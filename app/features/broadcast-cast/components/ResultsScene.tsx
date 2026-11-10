import type * as React from "react";
import { useTranslation } from "react-i18next";
import * as R from "remeda";
import { Ability } from "~/components/Ability";
import { ModeImage, WeaponImage } from "~/components/Image";
import type { ObjectiveTimelineEvent } from "~/components/ObjectiveTimeline";
import { useFitText } from "~/features/broadcast/broadcast-hooks";
import type {
	BroadcastGame,
	BroadcastMap,
	BroadcastView,
	BroadcastWeaponImages,
	MatchProgress,
} from "~/features/broadcast/broadcast-types";
import {
	combineStyles,
	formatClock,
	gameInk,
	inkColorVars,
	type MatchSide,
	matchSides,
	roundLabel,
} from "~/features/broadcast/broadcast-utils";
import { TeamLogo } from "~/features/broadcast/components/TeamLogo";
import * as SetProgress from "~/features/broadcast/core/SetProgress";
import { stageVideoUrl } from "~/utils/urls";
import { BROADCAST_PROTOTYPE_GAME_RESULT } from "../broadcast-cast-constants";
import type {
	BroadcastGameResult,
	CastBroadcastState,
} from "../broadcast-cast-types";
import { controlShares, scenePart } from "../broadcast-cast-utils";
import { HoldScene } from "./HoldScene";
import layout from "./ResultsScene.layout.module.css";
import look from "./ResultsScene.module.css";
import { SceneBackdrop } from "./SceneBackdrop";

const styles = combineStyles(look, layout);

const part = scenePart("results");

/** The objective panel's inner width, so the chart is drawn at about the canvas' own pixels. */
const CHART_WIDTH = 1160;
const CHART_HEIGHT = 236;
const CHART_PLOT_TOP = 8;
const CHART_LANE_HEIGHT = 14;
const CHART_LANE_GAP = 12;
const CHART_LABELS_HEIGHT = 30;
const CHART_TICK_SECONDS = 60;
const FULL_COUNT = 100;

/**
 * Full screen after a game: the map in a tall panel on the left playing its flyover, on the right who won and by how
 * much, both teams' players with the weapons and main abilities they played and how the objective went.
 */
export function ResultsScene({
	state,
	view,
}: {
	state: CastBroadcastState;
	view: BroadcastView;
}) {
	const match = state.match;
	if (!match) {
		return <HoldScene scene="results" state={state} view={view} />;
	}

	// xxx: prototype, comes from the scanner eventually
	const result = BROADCAST_PROTOTYPE_GAME_RESULT;
	const sides = matchSides(match, view, state[view]);

	return (
		<div
			className={styles.results}
			// the game just played, still in its ink colors
			style={inkColorVars({
				ink: gameInk(state, view),
				swapSides: state[view].swapSides,
			})}
		>
			<SceneBackdrop />
			<MapPanel
				map={result.map}
				round={roundLabel(match)}
				winner={result.winner}
				progress={match.progress[view]}
				games={SetProgress.gamesUntilDecided({
					progress: match.progress[view],
					match,
					currentWinner: result.winner,
				})}
				sides={sides}
			/>
			<div className={styles.content}>
				<div className={styles.teams}>
					{sides.map((side, i) => (
						<ResultTeam
							key={side.side}
							side={side}
							result={result}
							weaponImages={state.settings.weaponImages}
							style={{ "--i": i } as React.CSSProperties}
						/>
					))}
				</div>
				<ObjectivePanel events={result.objective} sides={sides} />
			</div>
		</div>
	);
}

function MapPanel({
	map,
	round,
	winner,
	progress,
	games,
	sides,
}: {
	map: BroadcastMap;
	/** Bracket and round, empty when neither is known. */
	round: string;
	/** Of the game shown, which might not be reported yet. */
	winner: 0 | 1;
	progress: MatchProgress;
	/** Of the set, without the ones it ends before. */
	games: BroadcastGame[];
	sides: [MatchSide, MatchSide];
}) {
	const { t } = useTranslation(["broadcast", "game-misc"]);

	return (
		<div className={styles.map} {...part("map")}>
			<video
				key={map.stageId}
				src={stageVideoUrl(map.stageId)}
				className={styles.mapVideo}
				autoPlay
				muted
				loop
				playsInline
				{...part("map-video")}
			/>
			<div className={styles.mapInfo}>
				{round ? (
					<span className={styles.round} {...part("round")}>
						{round}
					</span>
				) : null}
				<ol className={styles.games} {...part("games")}>
					{games.map((game, i) => {
						const status = gameStatus({ progress, game, number: i + 1 });
						const gameWinner = status === "current" ? winner : game.winner;

						return (
							<li
								key={i}
								className={styles.game}
								data-status={status}
								data-team={
									sides.find((side) => side.index === gameWinner)?.side
								}
								{...part("game-number")}
							>
								{status === "current"
									? t("broadcast:overlay.game", { number: i + 1 })
									: i + 1}
							</li>
						);
					})}
				</ol>
				<span className={styles.mode} {...part("mode")}>
					<ModeImage mode={map.mode} size={36} loading="eager" />
					{t(`game-misc:MODE_LONG_${map.mode}`)}
				</span>
				<span className={styles.stage} {...part("stage")}>
					{t(`game-misc:STAGE_${map.stageId}`)}
				</span>
			</div>
		</div>
	);
}

function ResultTeam({
	side,
	result,
	weaponImages,
	style,
}: {
	side: MatchSide;
	result: BroadcastGameResult;
	weaponImages: BroadcastWeaponImages;
	style: React.CSSProperties;
}) {
	const { t } = useTranslation(["broadcast"]);
	const team = result.teams[side.index];
	const isWinner = result.winner === side.index;
	const name = side.team?.name ?? t("broadcast:overlay.tbd");
	const nameRef = useFitText<HTMLSpanElement>({ text: name });

	return (
		<section
			className={styles.team}
			data-team={side.side}
			data-winner={isWinner || undefined}
			style={style}
			{...part("team")}
		>
			<header className={styles.teamHeader} {...part("team-header")}>
				<TeamLogo
					team={side.team}
					className={styles.teamLogo}
					{...part("team-logo")}
				/>
				<span ref={nameRef} className={styles.teamName} {...part("team-name")}>
					{name}
				</span>
				<span className={styles.result} {...part("result")}>
					{isWinner ? t("broadcast:overlay.win") : t("broadcast:overlay.lose")}
				</span>
				<span className={styles.teamScore} {...part("team-score")}>
					{isWinner && result.isKnockout
						? t("broadcast:overlay.knockout")
						: team.score}
				</span>
			</header>
			<ul className={styles.players}>
				{team.players.map((player, i) => (
					<li
						key={i}
						className={styles.player}
						style={{ "--j": i } as React.CSSProperties}
						{...part("player")}
					>
						<span className={styles.weapon} {...part("player-weapon")}>
							<WeaponImage
								weaponSplId={player.weaponSplId}
								variant={weaponImages === "outlined" ? "badge" : "build"}
								size={72}
								loading="eager"
							/>
						</span>
						<span className={styles.playerName} {...part("player-name")}>
							{player.name}
						</span>
						<span className={styles.abilities} {...part("player-abilities")}>
							{player.abilities.map((ability, abilityIdx) => (
								<Ability key={abilityIdx} ability={ability} size="HUGE" />
							))}
						</span>
					</li>
				))}
			</ul>
		</section>
	);
}

function ObjectivePanel({
	events,
	sides,
}: {
	events: ObjectiveTimelineEvent[];
	sides: [MatchSide, MatchSide];
}) {
	const { t } = useTranslation(["broadcast"]);
	const shares = controlShares(events);

	return (
		<section className={styles.objective} {...part("objective")}>
			<div className={styles.control} {...part("control")}>
				<span className={styles.controlLabel}>
					{t("broadcast:overlay.control")}
				</span>
				<div className={styles.controlBar}>
					{sides.map((side) => (
						<span
							key={side.side}
							className={styles.controlShare}
							data-team={side.side}
							style={{ flexGrow: shares[side.index] }}
							{...part("control-share")}
						>
							{Math.round(shares[side.index] * 100)}%
						</span>
					))}
				</div>
			</div>
			<ObjectiveChart events={events} sides={sides} />
		</section>
	);
}

function ObjectiveChart({
	events,
	sides,
}: {
	events: ObjectiveTimelineEvent[];
	sides: [MatchSide, MatchSide];
}) {
	const sorted = events.toSorted((a, b) => a.t - b.t);
	const start = sorted[0]?.t ?? 0;
	const duration = Math.max((sorted.at(-1)?.t ?? 0) - start, 1);
	const plotBottom =
		CHART_HEIGHT - CHART_LABELS_HEIGHT - CHART_LANE_HEIGHT - CHART_LANE_GAP;
	const laneTop = plotBottom + CHART_LANE_GAP;

	const xAt = (t: number) => ((t - start) / duration) * CHART_WIDTH;
	const yAt = (count: number) =>
		CHART_PLOT_TOP +
		((FULL_COUNT - count) / FULL_COUNT) * (plotBottom - CHART_PLOT_TOP);
	const sideOfIndex = (index: 0 | 1) =>
		sides.find((side) => side.index === index)!.side;

	const ticks = R.range(1, Math.floor(duration / CHART_TICK_SECONDS) + 1).map(
		(multiple) => multiple * CHART_TICK_SECONDS,
	);

	return (
		<svg
			className={styles.chart}
			viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
			aria-hidden
			{...part("objective-chart")}
		>
			{[0, 50, 100].map((count) => (
				<line
					key={count}
					className={styles.gridLine}
					x1={0}
					y1={yAt(count)}
					x2={CHART_WIDTH}
					y2={yAt(count)}
				/>
			))}
			{sides.map((side) => (
				<polyline
					key={side.side}
					className={styles.line}
					data-team={side.side}
					points={linePoints(sorted, side.index)
						.map(({ t, count }) => `${xAt(t)},${yAt(count)}`)
						.join(" ")}
					{...part("objective-line")}
				/>
			))}
			{controlSpans(sorted).map((span) => (
				<rect
					key={span.from}
					className={styles.lane}
					data-team={sideOfIndex(span.control)}
					x={xAt(span.from)}
					y={laneTop}
					width={xAt(span.to) - xAt(span.from)}
					height={CHART_LANE_HEIGHT}
					rx={CHART_LANE_HEIGHT / 2}
					{...part("control-lane")}
				/>
			))}
			{ticks.map((seconds) => (
				<text
					key={seconds}
					className={styles.tick}
					x={xAt(start + seconds)}
					y={CHART_HEIGHT - 4}
					textAnchor={seconds === duration ? "end" : "middle"}
				>
					{formatClock(seconds * 1000)}
				</text>
			))}
		</svg>
	);
}

/** The game just played is `current`, it being the set's current one until its result is reported. */
function gameStatus({
	progress,
	game,
	number,
}: {
	progress: MatchProgress;
	game: BroadcastGame;
	number: number;
}) {
	if (number === progress.gameNumber) return "current";
	return game.winner !== null ? "played" : "upcoming";
}

/** Stretches of the game one team held the objective, a read's control lasting until the next read. */
function controlSpans(sorted: ObjectiveTimelineEvent[]) {
	const spans: Array<{ from: number; to: number; control: 0 | 1 }> = [];

	for (let i = 0; i < sorted.length - 1; i++) {
		const { t, data } = sorted[i]!;
		const to = sorted[i + 1]!.t;
		if (data.control === null) continue;

		const last = spans.at(-1);
		if (last && last.control === data.control && last.to === t) {
			last.to = to;
		} else {
			spans.push({ from: t, to, control: data.control });
		}
	}

	return spans;
}

/** The team's counter at each read, an unreadable count carrying the last one read. */
function linePoints(sorted: ObjectiveTimelineEvent[], index: 0 | 1) {
	const points: Array<{ t: number; count: number }> = [];
	let last: number | null = null;

	for (const event of sorted) {
		const count: number | null = event.data.score[index] ?? last;
		if (count === null) continue;

		points.push({ t: event.t, count });
		last = count;
	}

	return points;
}
