import { Mic } from "lucide-react";
import type * as React from "react";
import { useTranslation } from "react-i18next";
import { ModeImage, StageImage } from "~/components/Image";
import type {
	BroadcastMap,
	BroadcastView,
} from "~/features/broadcast/broadcast-types";
import {
	combineStyles,
	gameInk,
	inkColorVars,
	type MatchSide,
	matchSides,
	roundLabel,
} from "~/features/broadcast/broadcast-utils";
import { SetLength } from "~/features/broadcast/components/SetLength";
import { TeamLogo } from "~/features/broadcast/components/TeamLogo";
import type { CastBroadcastState } from "../broadcast-cast-types";
import { pronounsLabel, scenePart } from "../broadcast-cast-utils";
import layout from "./GameScene.layout.module.css";
import look from "./GameScene.module.css";
import { Ticker } from "./Ticker";

const styles = combineStyles(look, layout);

const part = scenePart("game");

/**
 * Over the game feed, clear of the game's own HUD: the round and casters in the top left corner, each new game's map
 * under them for its first seconds, and a bar along the bottom with the teams in the game's ink colors, their set
 * scores and rosters, the other matches' ticker scrolling between them.
 */
export function GameScene({
	state,
	view,
}: {
	state: CastBroadcastState;
	view: BroadcastView;
}) {
	const match = state.match;
	const progress = match?.progress[view];

	return (
		<>
			<div className={styles.corner}>
				<InfoCard state={state} />
				{progress?.currentMap ? (
					<MapIntro
						// a new game shows its map again
						key={`${progress.gameNumber}-${progress.currentMap.mode}-${progress.currentMap.stageId}`}
						map={progress.currentMap}
						gameNumber={progress.gameNumber}
					/>
				) : null}
			</div>
			{match || state.otherMatches.length > 0 ? (
				<div
					className={styles.scoreboard}
					style={inkColorVars({
						ink: gameInk(state, view),
						swapSides: state[view].swapSides,
					})}
					{...part("scoreboard")}
				>
					{match
						? matchSides(match, view, state[view]).map((side) => (
								<TeamPanel key={side.side} side={side} />
							))
						: null}
					<Ticker
						matches={state.otherMatches}
						variant="bar"
						className={styles.ticker}
					/>
				</div>
			) : null}
		</>
	);
}

function InfoCard({ state }: { state: CastBroadcastState }) {
	const match = state.match;

	return (
		<div className={styles.infoCard} {...part("info-bar")}>
			<div className={styles.tournamentLogoFrame}>
				<img
					className={styles.tournamentLogo}
					src={state.tournament.logoUrl}
					alt=""
					{...part("tournament-logo")}
				/>
			</div>
			<div className={styles.infoRows}>
				<div className={styles.roundRow} {...part("round")}>
					<span className={styles.roundName}>
						{match
							? roundLabel(match) || state.tournament.name
							: state.tournament.name}
					</span>
					{match ? (
						<span className={styles.setLength} {...part("set-length")}>
							<SetLength match={match} />
						</span>
					) : null}
				</div>
				{state.casters.length > 0 ? (
					<div className={styles.castersRow} {...part("casters")}>
						<Mic className={styles.micIcon} />
						{state.casters.map((caster) => (
							<span
								key={caster.userId}
								className={styles.caster}
								{...part("caster")}
							>
								{caster.name}
								{caster.pronouns ? (
									<span
										className={styles.pronouns}
										{...part("caster-pronouns")}
									>
										{pronounsLabel(caster.pronouns)}
									</span>
								) : null}
							</span>
						))}
					</div>
				) : null}
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

function TeamPanel({ side }: { side: MatchSide }) {
	const { t } = useTranslation(["broadcast"]);
	const players = side.team?.players ?? [];

	return (
		<div
			className={styles.team}
			data-team={side.side}
			data-winner={side.isWinner || undefined}
			data-loser={side.isLoser || undefined}
			{...part("team")}
		>
			{players.length > 0 ? (
				<ul className={styles.roster} {...part("roster")}>
					{players.map((player, i) => (
						<li
							key={player.userId}
							className={styles.player}
							style={{ "--i": i } as React.CSSProperties}
							{...part("player")}
						>
							<span {...part("player-name")}>{player.name}</span>
						</li>
					))}
				</ul>
			) : null}
			<div className={styles.nameplate}>
				<div className={styles.logoCell}>
					<TeamLogo
						team={side.team}
						className={styles.teamLogo}
						{...part("team-logo")}
					/>
				</div>
				<div className={styles.teamTitle}>
					{typeof side.team?.seed === "number" ? (
						<span className={styles.seed} {...part("team-seed")}>
							{side.team.seed}
						</span>
					) : null}
					<span className={styles.teamName} {...part("team-name")}>
						{side.team?.name ?? t("broadcast:overlay.tbd")}
					</span>
				</div>
				<div className={styles.score} {...part("team-score")}>
					<span className={styles.scoreEntrance}>
						<span
							// remounts to pop when the score changes
							key={side.score}
							className={styles.scoreValue}
						>
							{side.score}
						</span>
					</span>
				</div>
			</div>
		</div>
	);
}
