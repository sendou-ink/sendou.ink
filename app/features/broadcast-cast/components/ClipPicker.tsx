import { useTranslation } from "react-i18next";
import { formatClock } from "~/features/broadcast/broadcast-utils";
import type { ScannerClip } from "~/features/scanner/store/clips";
import { useFormatDistanceToNow } from "~/hooks/intl/useFormatDistanceToNow";
import { broadcastClipOf, broadcastClipTitle } from "../broadcast-cast-clips";
import type { BroadcastClip } from "../broadcast-cast-types";
import styles from "./ClipPicker.module.css";

/**
 * The replays scene's footage: the OBS footage or one of the clips this browser's scanner cut, newest first. The
 * picked clip stays listed after the scanner dropped it, without its thumbnail.
 */
export function ClipPicker({
	picked,
	clips,
	onPick,
}: {
	picked: BroadcastClip | null;
	clips: ScannerClip[];
	onPick: (clip: BroadcastClip | null) => void;
}) {
	const { t } = useTranslation(["broadcast"]);
	const options = clips.map((clip) => ({
		clip: broadcastClipOf(clip),
		scannerClip: clip,
	}));
	const isPickedGone =
		picked !== null && !options.some(({ clip }) => clip.id === picked.id);

	return (
		<div
			role="radiogroup"
			aria-label={t("broadcast:dashboard.clips.label")}
			className={styles.list}
		>
			<label className={styles.option}>
				<input
					type="radio"
					name="broadcast-clip"
					checked={picked === null}
					onChange={() => onPick(null)}
				/>
				<span className={styles.title}>
					{t("broadcast:dashboard.clips.none")}
				</span>
			</label>
			{isPickedGone ? (
				<ClipOption clip={picked} isPicked onPick={onPick} />
			) : null}
			{options.map(({ clip, scannerClip }) => (
				<ClipOption
					key={clip.id}
					clip={clip}
					scannerClip={scannerClip}
					isPicked={picked?.id === clip.id}
					onPick={onPick}
				/>
			))}
		</div>
	);
}

function ClipOption({
	clip,
	scannerClip,
	isPicked,
	onPick,
}: {
	clip: BroadcastClip;
	scannerClip?: ScannerClip;
	isPicked: boolean;
	onPick: (clip: BroadcastClip) => void;
}) {
	const { t } = useTranslation(["broadcast", "game-misc"]);
	const formatDistanceToNow = useFormatDistanceToNow();

	return (
		<label className={styles.option}>
			<input
				type="radio"
				name="broadcast-clip"
				checked={isPicked}
				onChange={() => onPick(clip)}
			/>
			{scannerClip?.thumbnail ? (
				<img src={scannerClip.thumbnail} alt="" className={styles.thumbnail} />
			) : (
				<span className={styles.thumbnail} />
			)}
			<span className="stack xxxs">
				<span className={styles.title}>{broadcastClipTitle(t, clip)}</span>
				<span className={styles.meta}>
					{[
						scannerClip?.stage
							? t(`game-misc:STAGE_${scannerClip.stage}`)
							: null,
						formatClock(clip.durationMs),
						scannerClip
							? formatDistanceToNow(new Date(scannerClip.createdAt), {
									addSuffix: true,
								})
							: null,
					]
						.filter(Boolean)
						.join(" · ")}
				</span>
			</span>
		</label>
	);
}
