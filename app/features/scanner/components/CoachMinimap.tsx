/**
 * Coach mode's map as the POV player last opened it in the game the video is
 * in, and how long before the video's time that was. It fills whichever place
 * it has, beside the video or swapped into the video's; clicking it swaps.
 * When given, a corner button opens the map in the map planner.
 */
import { Image } from "~/components/Image";
import { navIconUrl } from "~/utils/urls";
import { formatClock } from "../core/format";
import styles from "./CoachMinimap.module.css";
import type { VodMinimapUrl } from "./vod-data";

export function CoachMinimap({
	minimap,
	currentTime,
	isInGame,
	onSwap,
	onOpenPlanner,
}: {
	/** the latest of the game's minimaps up to the video's time */
	minimap: VodMinimapUrl | undefined;
	/** seconds into the video the player is at */
	currentTime: number;
	isInGame: boolean;
	/** undefined when there's no video or no map to swap */
	onSwap: (() => void) | undefined;
	onOpenPlanner?: () => void;
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

	return (
		<div className={styles.minimap}>
			{onSwap ? (
				<button
					type="button"
					className={styles.swap}
					title="Swap with the video"
					onClick={onSwap}
				>
					{content}
				</button>
			) : (
				content
			)}
			{onOpenPlanner ? (
				<button
					type="button"
					className={styles.planner}
					title="Open the map in the map planner in a new tab"
					onClick={onOpenPlanner}
				>
					<Image path={navIconUrl("plans")} alt="" size={20} />
					Planner
				</button>
			) : null}
		</div>
	);
}

function seenAgo(seconds: number): string {
	if (seconds < 1) return "now";
	if (seconds < 60) return `${Math.floor(seconds)}s ago`;
	return `${formatClock(seconds)} ago`;
}
