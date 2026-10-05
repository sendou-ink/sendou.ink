import * as PersistedState from "~/modules/persisted-state/persisted-state";
import { clipVolumePersisted } from "./clip-volume";

/** Autoplaying clip player that starts at, and remembers, the last volume and mute state used. */
export function ClipVideo({
	src,
	className,
}: {
	src: string;
	className?: string;
}) {
	return (
		// biome-ignore lint/a11y/useMediaCaption: game footage has no captions
		<video
			ref={applySavedVolume}
			className={className}
			src={src}
			controls
			autoPlay
			playsInline
			onVolumeChange={(event) =>
				PersistedState.write(clipVolumePersisted, {
					volume: event.currentTarget.volume,
					muted: event.currentTarget.muted,
				})
			}
		/>
	);
}

function applySavedVolume(video: HTMLVideoElement | null) {
	if (!video) return;

	const { volume, muted } = PersistedState.read(clipVolumePersisted);
	video.volume = volume;
	video.muted = muted;
}
