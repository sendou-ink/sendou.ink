/**
 * Coach mode's map as the POV player last opened it in the game the video is
 * in, and how long before the video's time that was. It fills whichever place
 * it has, beside the video or swapped into the video's; clicking it swaps.
 */
import { formatClock } from "../core/format";
import styles from "./CoachMinimap.module.css";
import type { VodMinimapUrl } from "./vod-data";

export function CoachMinimap({
	minimap,
	currentTime,
	isInGame,
	onSwap,
}: {
	/** the latest of the game's minimaps up to the video's time */
	minimap: VodMinimapUrl | undefined;
	/** seconds into the video the player is at */
	currentTime: number;
	isInGame: boolean;
	/** undefined when there's no video to swap with */
	onSwap: (() => void) | undefined;
}) {
	const content = minimap ? (
		<>
			<img
				className={styles.image}
				src={minimap.url}
				alt="The map when last opened"
			/>
			<span className={styles.ago}>
				Map · {seenAgo(currentTime - minimap.t)}
			</span>
		</>
	) : (
		<span className={styles.empty}>
			{isInGame ? "Map not opened yet this game" : "No game playing"}
		</span>
	);

	if (!onSwap) return <div className={styles.minimap}>{content}</div>;

	return (
		<button
			type="button"
			className={styles.minimap}
			title="Swap with the video"
			onClick={onSwap}
		>
			{content}
		</button>
	);
}

function seenAgo(seconds: number): string {
	if (seconds < 1) return "now";
	if (seconds < 60) return `${Math.floor(seconds)}s ago`;
	return `${formatClock(seconds)} ago`;
}
