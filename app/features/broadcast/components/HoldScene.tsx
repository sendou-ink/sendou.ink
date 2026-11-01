import * as React from "react";
import { useTranslation } from "react-i18next";
import { BroadcastClipsContext } from "../broadcast-clips-context";
import { useServerNow } from "../broadcast-hooks";
import type {
	BroadcastScene,
	BroadcastState,
	BroadcastView,
} from "../broadcast-types";
import { formatClock, scenePart } from "../broadcast-utils";
import * as Producer from "../core/Producer";
import styles from "./HoldScene.module.css";
import { Matchup } from "./Matchup";
import { SceneBackdrop } from "./SceneBackdrop";
import { Ticker } from "./Ticker";

const part = scenePart("hold");

/** Full screen of the scenes without gameplay (starting soon, break, technical difficulties, ending): a big title, the headline, the featured match and the other matches' ticker. Starting soon given a duration counts it down. Also the scenes' fallback when they have nothing to show. */
export function HoldScene({
	scene,
	state,
	view,
}: {
	scene: BroadcastScene;
	state: BroadcastState;
	view: BroadcastView;
}) {
	const { t } = useTranslation(["broadcast"]);
	const match = state.match;
	const isOver = match?.progress[view].isOver ?? false;
	const headline =
		state.settings.headline ||
		(scene === "technical" ? t("broadcast:overlay.standBy") : null);
	const showsMatch = match && (scene !== "ending" || isOver);

	return (
		<div className={styles.hold}>
			<SceneBackdrop variant={scene === "technical" ? "alert" : undefined} />
			<div className={styles.content}>
				<img
					className={styles.tournamentLogo}
					src={state.tournament.logoUrl}
					alt=""
					{...part("tournament-logo")}
				/>
				<div className={styles.eyebrow} {...part("tournament-name")}>
					{state.tournament.name}
				</div>
				<h1 className={styles.title} {...part("title")}>
					{t(`broadcast:overlay.title.${scene}`)}
				</h1>
				{scene === "starting" ? <Countdown state={state} view={view} /> : null}
				{headline ? (
					<p className={styles.headline} {...part("headline")}>
						{headline}
					</p>
				) : null}
			</div>
			{showsMatch ? (
				<div className={styles.matchup}>
					<div className={styles.matchupLabel} {...part("matchup-label")}>
						{isOver
							? t("broadcast:overlay.final")
							: match.progress[view].resultCount > 0
								? t("broadcast:overlay.nowPlaying")
								: t("broadcast:overlay.upNext")}
					</div>
					<Matchup match={match} view={view} producer={state[view]} />
				</div>
			) : null}
			<Ticker matches={state.otherMatches} className={styles.ticker} />
		</div>
	);
}

/** Time left of the scene on air, the whole duration on next. */
function Countdown({
	state,
	view,
}: {
	state: BroadcastState;
	view: BroadcastView;
}) {
	const { clockOffsetMs } = React.useContext(BroadcastClipsContext);
	const now = useServerNow(clockOffsetMs);
	const lengthMs = Producer.lengthMs(state[view]);
	const endsAt = view === "live" ? Producer.liveEndsAt(state) : null;

	if (lengthMs === null) return null;

	const remainingMs =
		endsAt === null ? lengthMs : now === null ? null : endsAt - now;

	return (
		<div className={styles.countdown} {...part("countdown")}>
			{remainingMs === null ? null : formatClock(remainingMs)}
		</div>
	);
}
