import { useTranslation } from "react-i18next";
import { ModeImage } from "~/components/Image";
import type {
	BroadcastMatch,
	BroadcastState,
	BroadcastTeam,
	BroadcastView,
} from "../broadcast-types";
import { scenePart, teamsBySide } from "../broadcast-utils";
import styles from "./GameScene.module.css";

const part = scenePart("game");

/** Scorebug shown over the game feed: teams, set score, game count, current map and round. */
export function GameScene({
	state,
	view,
}: {
	state: BroadcastState;
	view: BroadcastView;
}) {
	const { t } = useTranslation(["broadcast", "game-misc"]);

	const match = state.match;
	if (!match) return null;

	const progress = match.progress[view];
	const isSwapped = state[view].swapSides;
	const [left, right] = teamsBySide(match, isSwapped);
	const [leftScore, rightScore] = isSwapped
		? [progress.scores[1], progress.scores[0]]
		: progress.scores;

	return (
		<div className={styles.scorebug} {...part("scorebug")}>
			<TeamPlate team={left} score={leftScore} side="a" />
			<img
				className={styles.tournamentLogo}
				src={state.tournament.logoUrl}
				alt=""
				{...part("tournament-logo")}
			/>
			<div className={styles.gameInfo} {...part("game-info")}>
				{match.roundName ? (
					<div className={styles.round} {...part("round")}>
						{match.roundName}
					</div>
				) : null}
				<div className={styles.gameCount} {...part("game-count")}>
					{t("broadcast:overlay.game", { number: progress.gameNumber })} ·{" "}
					<SetLength match={match} />
				</div>
				{progress.currentMap ? (
					<div className={styles.map}>
						<span {...part("mode")}>
							<ModeImage
								mode={progress.currentMap.mode}
								size={28}
								loading="eager"
							/>
						</span>
						<span {...part("stage")}>
							{t(`game-misc:STAGE_${progress.currentMap.stageId}`)}
						</span>
					</div>
				) : null}
			</div>
			<TeamPlate team={right} score={rightScore} side="b" />
		</div>
	);
}

/** "Bo5" or "Play all 3". */
export function SetLength({
	match,
}: {
	match: Pick<BroadcastMatch, "countType" | "count">;
}) {
	const { t } = useTranslation(["broadcast"]);

	return match.countType === "BEST_OF"
		? t("broadcast:overlay.bestOf", { count: match.count })
		: t("broadcast:overlay.playAll", { count: match.count });
}

function TeamPlate({
	team,
	score,
	side,
}: {
	team: BroadcastTeam | null;
	score: number;
	side: "a" | "b";
}) {
	const { t } = useTranslation(["broadcast"]);

	return (
		<div className={styles.team} data-team={side} {...part("team")}>
			{team?.logoUrl ? (
				<img
					className={styles.teamLogo}
					src={team.logoUrl}
					alt=""
					{...part("team-logo")}
				/>
			) : null}
			<div className={styles.teamName} {...part("team-name")}>
				{team?.name ?? t("broadcast:overlay.tbd")}
			</div>
			<div className={styles.teamScore} {...part("team-score")}>
				{score}
			</div>
		</div>
	);
}
