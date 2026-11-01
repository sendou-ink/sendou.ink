import { Mic } from "lucide-react";
import type * as React from "react";
import { useTranslation } from "react-i18next";
import { ModeImage, StageImage } from "~/components/Image";
import type {
	BroadcastMap,
	BroadcastState,
	BroadcastView,
} from "../broadcast-types";
import {
	type MatchSide,
	matchSides,
	pronounsLabel,
	scenePart,
} from "../broadcast-utils";
import styles from "./GameScene.module.css";
import { SetLength } from "./SetLength";

const part = scenePart("game");

/**
 * Over the game feed, clear of the game's own HUD: the teams and set score in their ink colors in the top left
 * corner, the casters and round in the bottom right one. Each new game shows its map under the score for a while.
 */
export function GameScene({
	state,
	view,
}: {
	state: BroadcastState;
	view: BroadcastView;
}) {
	const match = state.match;
	const progress = match?.progress[view];

	return (
		<>
			{match && progress ? (
				<div className={styles.scoreboard} {...part("scoreboard")}>
					{matchSides(match, view, state[view]).map((side, i) => (
						<TeamRow
							key={side.side}
							side={side}
							style={{ "--i": i } as React.CSSProperties}
						/>
					))}
					{progress.currentMap ? (
						<MapIntro
							// a new game shows its map again
							key={`${progress.gameNumber}-${progress.currentMap.mode}-${progress.currentMap.stageId}`}
							map={progress.currentMap}
							gameNumber={progress.gameNumber}
						/>
					) : null}
				</div>
			) : null}
			<InfoBar state={state} />
		</>
	);
}

function TeamRow({
	side,
	style,
}: {
	side: MatchSide;
	style: React.CSSProperties;
}) {
	const { t } = useTranslation(["broadcast"]);

	return (
		<div
			className={styles.row}
			data-team={side.side}
			data-winner={side.isWinner || undefined}
			data-loser={side.isLoser || undefined}
			style={style}
			{...part("team")}
		>
			<div className={styles.teamName} {...part("team-name")}>
				{side.team?.name ?? t("broadcast:overlay.tbd")}
			</div>
			<div className={styles.score} {...part("team-score")}>
				<span
					// remounts to pop when the score changes
					key={side.score}
					className={styles.scoreValue}
				>
					{side.score}
				</span>
			</div>
		</div>
	);
}

function InfoBar({ state }: { state: BroadcastState }) {
	const match = state.match;
	const casters = state.casters
		.map((caster) =>
			caster.pronouns
				? `${caster.name} (${pronounsLabel(caster.pronouns)})`
				: caster.name,
		)
		.join(" // ");

	return (
		<div className={styles.infoBar} {...part("info-bar")}>
			{casters ? (
				<div className={styles.infoRow} {...part("info-row")}>
					<span className={styles.infoText} {...part("casters")}>
						{casters}
					</span>
					<span className={styles.infoIcon} {...part("mic")}>
						<Mic />
					</span>
				</div>
			) : null}
			<div className={styles.infoRow} {...part("info-row")}>
				<span className={styles.infoText} {...part("round")}>
					{match ? (
						<>
							{match.roundName ?? match.bracketName ?? state.tournament.name} /{" "}
							<SetLength match={match} />
						</>
					) : (
						state.tournament.name
					)}
				</span>
				<img
					className={styles.infoIcon}
					src={state.tournament.logoUrl}
					alt=""
					{...part("tournament-logo")}
				/>
			</div>
		</div>
	);
}

function MapIntro({
	map,
	gameNumber,
}: {
	map: BroadcastMap;
	gameNumber: number;
}) {
	const { t } = useTranslation(["broadcast", "game-misc"]);

	return (
		<div className={styles.mapIntro} {...part("map-intro")}>
			<StageImage
				stageId={map.stageId}
				width={480}
				loading="eager"
				className={styles.mapIntroImage}
				containerClassName={styles.mapIntroImage}
			/>
			<div className={styles.mapIntroText}>
				<span className={styles.mapIntroGame} {...part("game-number")}>
					{t("broadcast:overlay.game", { number: gameNumber })}
				</span>
				<span className={styles.mapIntroMode} {...part("mode")}>
					<ModeImage mode={map.mode} size={28} loading="eager" />
					{t(`game-misc:MODE_LONG_${map.mode}`)}
				</span>
				<span className={styles.mapIntroStage} {...part("stage")}>
					{t(`game-misc:STAGE_${map.stageId}`)}
				</span>
			</div>
		</div>
	);
}
