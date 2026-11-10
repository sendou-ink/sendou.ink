import { combineStyles } from "~/features/broadcast/broadcast-utils";
import type { StageId } from "~/modules/in-game-lists/types";
import { stageVideoUrl } from "~/utils/urls";
import layout from "./SceneBackdrop.layout.module.css";
import look from "./SceneBackdrop.module.css";

const styles = combineStyles(look, layout);

/** Background of the full screen scenes, plain by default so themes can bring their own. */
export function SceneBackdrop({
	variant,
	stageId,
}: {
	/** `alert` adds warning stripes, e.g. for technical difficulties. */
	variant?: "alert";
	/** Plays a flyover of the stage behind the scene. */
	stageId?: StageId;
}) {
	return (
		<div
			className={styles.backdrop}
			data-variant={variant}
			data-part="backdrop"
		>
			{typeof stageId === "number" ? (
				<>
					<video
						key={stageId}
						src={stageVideoUrl(stageId)}
						className={styles.video}
						autoPlay
						muted
						loop
						playsInline
						data-part="backdrop-video"
					/>
					<div className={styles.vignette} data-part="backdrop-vignette" />
				</>
			) : null}
			{variant === "alert" ? <div className={styles.alertStripes} /> : null}
		</div>
	);
}
