import clsx from "clsx";
import { Music } from "lucide-react";
import * as React from "react";
import { BroadcastClipsContext } from "~/features/broadcast/broadcast-clips-context";
import { useServerNow } from "~/features/broadcast/broadcast-hooks";
import { combineStyles } from "~/features/broadcast/broadcast-utils";
import * as MusicPlayback from "~/features/broadcast/core/MusicPlayback";
import type { CastBroadcastState } from "../broadcast-cast-types";
import { scenePart } from "../broadcast-cast-utils";
import layout from "./NowPlaying.layout.module.css";
import look from "./NowPlaying.module.css";

const styles = combineStyles(look, layout);

const part = scenePart("nowPlaying");

/**
 * One line behind a note icon: the title and artist of the track the producer's music is playing or, while none plays
 * (paused or no music) the producer's text, e.g. what plays on their own computer. It stays put as the tracks change, only its words fading over. Nothing
 * without either.
 */
export function NowPlaying({
	state,
	className,
}: {
	state: CastBroadcastState;
	className?: string;
}) {
	const { clockOffsetMs } = React.useContext(BroadcastClipsContext);
	const now = useServerNow(clockOffsetMs);
	const playing = now === null ? null : MusicPlayback.current(state.music, now);
	const track = playing && !playing.isPaused ? playing.track : null;
	const text = state.settings.nowPlaying;

	if (!track && !text) return null;

	return (
		<div
			className={clsx(styles.nowPlaying, className)}
			data-source={track ? "track" : "text"}
			{...part("now-playing")}
		>
			<Music
				className={styles.icon}
				aria-hidden
				{...part("now-playing-icon")}
			/>
			{track ? (
				<span key={track.id} className={styles.words}>
					<span className={styles.title} {...part("now-playing-title")}>
						{track.title}
					</span>
					{track.artist ? (
						<span className={styles.artist} {...part("now-playing-artist")}>
							{track.artist}
						</span>
					) : null}
				</span>
			) : (
				<span
					key="text"
					className={clsx(styles.words, styles.text)}
					{...part("now-playing-text")}
				>
					{text}
				</span>
			)}
		</div>
	);
}
