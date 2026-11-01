import * as React from "react";
import { useTranslation } from "react-i18next";
import { ModeImage } from "~/components/Image";
import { BroadcastClipsContext } from "../broadcast-clips-context";
import type { BroadcastState, BroadcastView } from "../broadcast-types";
import { scenePart } from "../broadcast-utils";
import styles from "./ReplaysScene.module.css";

const part = scenePart("replays");

/**
 * Over the replay footage: a frame around the screen and a replay bug telling which game is replayed. The footage is
 * the picked clip once the overlay has received it, otherwise whatever OBS has under the overlay.
 */
export function ReplaysScene({
	state,
	view,
}: {
	state: BroadcastState;
	view: BroadcastView;
}) {
	const { t } = useTranslation(["broadcast", "game-misc"]);
	const progress = state.match?.progress[view];
	const lastPlayed = progress?.games[progress.resultCount - 1];
	const clips = React.useContext(BroadcastClipsContext);
	const clipId = state[view].clipId;
	const clipUrl = clipId ? clips.urls.get(clipId) : undefined;

	return (
		<div className={styles.replays}>
			{clipUrl ? (
				<video
					key={clipUrl}
					ref={playWithMutedFallback}
					className={styles.clip}
					src={clipUrl}
					muted={clips.isMuted}
					playsInline
					{...part("clip")}
				/>
			) : null}
			{(["tl", "tr", "bl", "br"] as const).map((corner) => (
				<span
					key={corner}
					className={styles.corner}
					data-corner={corner}
					{...part("corner")}
				/>
			))}
			<div className={styles.bug} {...part("replay-bug")}>
				<span className={styles.dot} {...part("replay-dot")} />
				<span className={styles.label} {...part("replay-label")}>
					{t("broadcast:overlay.title.replays")}
				</span>
				{lastPlayed?.map ? (
					<span className={styles.game} {...part("game")}>
						<ModeImage mode={lastPlayed.map.mode} size={26} loading="eager" />
						{t("broadcast:overlay.game", { number: progress?.resultCount })} ·{" "}
						{t(`game-misc:STAGE_${lastPlayed.map.stageId}`)}
					</span>
				) : null}
			</div>
		</div>
	);
}

/** OBS plays with sound on its own, a browser tab outside it only muted until interacted with. */
function playWithMutedFallback(video: HTMLVideoElement | null) {
	video?.play().catch(() => {
		video.muted = true;
		void video.play();
	});
}
