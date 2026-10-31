import styles from "./SceneBackdrop.module.css";

/** Background of the full screen scenes, plain by default so themes can bring their own. */
export function SceneBackdrop({
	variant,
}: {
	/** `alert` adds warning stripes, e.g. for technical difficulties. */
	variant?: "alert";
}) {
	return (
		<div
			className={styles.backdrop}
			data-variant={variant}
			data-part="backdrop"
		>
			{variant === "alert" ? <div className={styles.alertStripes} /> : null}
		</div>
	);
}
