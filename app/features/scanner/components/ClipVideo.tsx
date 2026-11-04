import type { Ref } from "react";
import * as PersistedState from "~/modules/persisted-state/persisted-state";
import { clipVolumePersisted } from "./clip-volume";

/** Autoplaying clip player that starts at, and remembers, the last volume and mute state used. */
export function ClipVideo({
	src,
	className,
	ref,
	controls = true,
	autoPlay = true,
	startAt,
	onDurationChange,
}: {
	src: string;
	className?: string;
	ref?: Ref<HTMLVideoElement>;
	controls?: boolean;
	autoPlay?: boolean;
	/** seconds a newly loaded source starts at */
	startAt?: number;
	onDurationChange?: (duration: number) => void;
}) {
	return (
		// biome-ignore lint/a11y/useMediaCaption: game footage has no captions
		<video
			ref={(video) => {
				applySavedVolume(video);
				if (typeof ref === "function") ref(video);
				else if (ref) ref.current = video;
			}}
			className={className}
			src={src}
			controls={controls}
			autoPlay={autoPlay}
			playsInline
			onLoadedMetadata={(event) => {
				if (startAt !== undefined) event.currentTarget.currentTime = startAt;
			}}
			onVolumeChange={(event) =>
				PersistedState.write(clipVolumePersisted, {
					volume: event.currentTarget.volume,
					muted: event.currentTarget.muted,
				})
			}
			onDurationChange={(event) => {
				const { duration } = event.currentTarget;
				if (Number.isFinite(duration)) onDurationChange?.(duration);
			}}
		/>
	);
}

function applySavedVolume(video: HTMLVideoElement | null) {
	if (!video) return;

	const { volume, muted } = PersistedState.read(clipVolumePersisted);
	video.volume = volume;
	video.muted = muted;
}
