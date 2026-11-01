import * as React from "react";
import { useTranslation } from "react-i18next";
import { ModeImage } from "~/components/Image";
import { BroadcastClipsContext } from "../broadcast-clips-context";
import type { BroadcastState, BroadcastView } from "../broadcast-types";
import { scenePart } from "../broadcast-utils";
import * as Producer from "../core/Producer";
import styles from "./ReplaysScene.module.css";

const part = scenePart("replays");

// a clip mounting this late after it went on air (e.g. the page reloaded or the clip arrived late) jumps ahead
const CLIP_CATCH_UP_THRESHOLD_MS = 1_500;

/**
 * Over the replay footage: a frame around the screen and a replay bug telling which game is replayed. The footage is
 * the picked clip once the overlay has received it, otherwise whatever OBS has under the overlay. On air the clip
 * plays from where it is by the time it went on air, so it ends when the next scene is timed to go on air.
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
	const startedAt = view === "live" ? Producer.liveStartedAt(state) : null;

	return (
		<div className={styles.replays}>
			{clipUrl ? (
				<ClipVideo
					key={clipUrl}
					url={clipUrl}
					isMuted={clips.isMuted}
					startedAt={
						startedAt === null ? null : startedAt - clips.clockOffsetMs
					}
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

function ClipVideo({
	url,
	isMuted,
	startedAt,
}: {
	url: string;
	isMuted: boolean;
	/** When the clip went on air in this clock (epoch ms), `null` plays it from the start. */
	startedAt: number | null;
}) {
	const [startSeconds] = React.useState(() => {
		const lateMs = startedAt === null ? 0 : Date.now() - startedAt;

		return lateMs > CLIP_CATCH_UP_THRESHOLD_MS ? lateMs / 1000 : 0;
	});

	return (
		<video
			ref={playWithMutedFallback}
			className={styles.clip}
			src={url}
			muted={isMuted}
			playsInline
			onLoadedMetadata={(event) => {
				// past its end it stays on the last frame
				if (startSeconds > 0) event.currentTarget.currentTime = startSeconds;
			}}
			{...part("clip")}
		/>
	);
}

/** OBS plays with sound on its own, a browser tab outside it only muted until interacted with. */
function playWithMutedFallback(video: HTMLVideoElement | null) {
	video?.play().catch(() => {
		video.muted = true;
		void video.play();
	});
}
