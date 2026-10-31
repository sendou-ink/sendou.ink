import type * as React from "react";
import { useTranslation } from "react-i18next";
import { ModeImage, StageImage } from "~/components/Image";
import type {
	BroadcastGame,
	BroadcastState,
	BroadcastView,
} from "../broadcast-types";
import {
	type MatchSide,
	matchSides,
	roundLabel,
	scenePart,
} from "../broadcast-utils";
import { HoldScene } from "./HoldScene";
import styles from "./MapsScene.module.css";
import { SceneBackdrop } from "./SceneBackdrop";
import { SetLength } from "./SetLength";
import { TeamLogo } from "./TeamLogo";

const part = scenePart("maps");

/** Full screen between games: the set score and every game of the set with its map, who won it and which is next. */
export function MapsScene({
	state,
	view,
}: {
	state: BroadcastState;
	view: BroadcastView;
}) {
	const match = state.match;
	if (!match) {
		return <HoldScene scene="maps" state={state} view={view} />;
	}

	const progress = match.progress[view];
	const sides = matchSides(match, view, state[view]);

	return (
		<div className={styles.maps}>
			<SceneBackdrop />
			<header className={styles.header} {...part("header")}>
				<div className={styles.eyebrow} {...part("round")}>
					{roundLabel(match) || state.tournament.name} ·{" "}
					<SetLength match={match} />
				</div>
				<div className={styles.scoreline}>
					<HeaderTeam side={sides[0]} />
					<div className={styles.scores} {...part("score")}>
						<span data-team={sides[0].side}>{sides[0].score}</span>
						<span className={styles.dash}>–</span>
						<span data-team={sides[1].side}>{sides[1].score}</span>
					</div>
					<HeaderTeam side={sides[1]} />
				</div>
			</header>
			<ol
				className={styles.games}
				style={{ "--count": progress.games.length } as React.CSSProperties}
			>
				{progress.games.map((game, i) => (
					<GameCard
						key={i}
						game={game}
						number={i + 1}
						isCurrent={!progress.isOver && progress.gameNumber === i + 1}
						isSkipped={progress.isOver && game.winner === null}
						winner={sides.find((side) => side.index === game.winner) ?? null}
						style={{ "--i": i } as React.CSSProperties}
					/>
				))}
			</ol>
		</div>
	);
}

function HeaderTeam({ side }: { side: MatchSide }) {
	const { t } = useTranslation(["broadcast"]);

	return (
		<div className={styles.headerTeam} data-team={side.side} {...part("team")}>
			<TeamLogo
				team={side.team}
				className={styles.headerLogo}
				{...part("team-logo")}
			/>
			<span className={styles.headerName} {...part("team-name")}>
				{side.team?.name ?? t("broadcast:overlay.tbd")}
			</span>
		</div>
	);
}

function GameCard({
	game,
	number,
	isCurrent,
	isSkipped,
	winner,
	style,
}: {
	game: BroadcastGame;
	number: number;
	isCurrent: boolean;
	/** The set ended before it. */
	isSkipped: boolean;
	winner: MatchSide | null;
	style: React.CSSProperties;
}) {
	const { t } = useTranslation(["broadcast", "game-misc"]);

	return (
		<li
			className={styles.game}
			data-team={winner?.side}
			data-status={
				winner
					? "played"
					: isCurrent
						? "current"
						: isSkipped
							? "skipped"
							: "upcoming"
			}
			data-unknown={game.map ? undefined : true}
			style={style}
			{...part("game")}
		>
			<div className={styles.stage}>
				{game.map ? (
					<StageImage
						stageId={game.map.stageId}
						width={320}
						loading="eager"
						className={styles.stageImage}
						containerClassName={styles.stageImage}
					/>
				) : isSkipped ? null : (
					<span className={styles.unknownMark}>?</span>
				)}
				<span className={styles.gameNumber} {...part("game-number")}>
					{number}
				</span>
				{isCurrent ? (
					<span className={styles.nextBadge} {...part("up-next")}>
						{t("broadcast:overlay.upNext")}
					</span>
				) : null}
			</div>
			<div className={styles.body}>
				{game.map ? (
					<>
						<span className={styles.mode} {...part("mode")}>
							<ModeImage mode={game.map.mode} size={30} loading="eager" />
							{t(`game-misc:MODE_LONG_${game.map.mode}`)}
						</span>
						<span className={styles.stageName} {...part("stage")}>
							{t(`game-misc:STAGE_${game.map.stageId}`)}
						</span>
					</>
				) : (
					<span className={styles.stageName}>
						{isSkipped
							? t("broadcast:overlay.notPlayed")
							: t("broadcast:overlay.toBeDecided")}
					</span>
				)}
			</div>
			{winner ? (
				<div className={styles.winner} {...part("winner")}>
					<TeamLogo team={winner.team} className={styles.winnerLogo} />
					<span className={styles.winnerName}>
						{winner.team?.name ?? t("broadcast:overlay.tbd")}
					</span>
				</div>
			) : null}
		</li>
	);
}
