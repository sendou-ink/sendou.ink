import * as React from "react";
import { useTranslation } from "react-i18next";
import { BroadcastClipsContext } from "../broadcast-clips-context";
import { useServerNow } from "../broadcast-hooks";
import type {
	BroadcastScene,
	BroadcastState,
	BroadcastView,
} from "../broadcast-types";
import { combineStyles, formatClock, scenePart } from "../broadcast-utils";
import * as Producer from "../core/Producer";
import layout from "./HoldScene.layout.module.css";
import look from "./HoldScene.module.css";
import { Matchup } from "./Matchup";
import { SceneBackdrop } from "./SceneBackdrop";
import { Ticker } from "./Ticker";

const styles = combineStyles(look, layout);

const part = scenePart("hold");

/** Full screen of the scenes without gameplay (starting soon, break, technical difficulties, ending): a big title, the headline and, on break, the next match and the other matches' ticker. Starting soon given a duration counts it down. Also the scenes' fallback when they have nothing to show. */
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
	const nextMatch =
		state.match && !state.match.progress[view].isOver ? state.match : null;
	const headline =
		state.settings.headline ||
		(scene === "technical" ? t("broadcast:overlay.standBy") : null);

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
			{scene === "break" && nextMatch ? (
				<div className={styles.matchup}>
					<div className={styles.matchupLabel} {...part("matchup-label")}>
						{t("broadcast:overlay.upNext")}
					</div>
					<Matchup
						match={nextMatch}
						view={view}
						producer={state[view]}
						showsScore={false}
					/>
				</div>
			) : null}
			{scene === "break" ? (
				<Ticker matches={state.otherMatches} className={styles.ticker} />
			) : null}
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
