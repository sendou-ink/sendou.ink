import { useTranslation } from "react-i18next";
import { BROADCAST_CANVAS } from "../broadcast-constants";
import styles from "./BroadcastPreview.module.css";

/** An overlay page scaled down to the container's width, exactly as it airs, over a stand-in for the gameplay footage. */
export function BroadcastPreview({
	src,
	title,
}: {
	src: string;
	title: string;
}) {
	const { t } = useTranslation(["broadcast"]);

	return (
		<div className={styles.preview} ref={scaleToWidth}>
			<span className={styles.gameplay}>
				{t("broadcast:dashboard.gameplay")}
			</span>
			<iframe
				key={src}
				src={src}
				title={title}
				className={styles.iframe}
				// scripts render the overlay and keep it live, same origin lets them reach the stream
				sandbox="allow-scripts allow-same-origin"
			/>
		</div>
	);
}

function scaleToWidth(element: HTMLDivElement | null) {
	if (!element) return;

	const observer = new ResizeObserver(([entry]) => {
		element.style.setProperty(
			"--preview-scale",
			String(entry.contentRect.width / BROADCAST_CANVAS.width),
		);
	});
	observer.observe(element);

	return () => observer.disconnect();
}
