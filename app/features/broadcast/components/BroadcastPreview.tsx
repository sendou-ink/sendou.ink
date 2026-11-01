import type * as React from "react";
import { useTranslation } from "react-i18next";
import styles from "./BroadcastPreview.module.css";

/** An overlay page scaled down to the container's width, exactly as it airs, over a stand-in for the gameplay footage. */
export function BroadcastPreview({
	src,
	title,
	iframeRef,
}: {
	src: string;
	title: string;
	/** e.g. to post the overlay a message */
	iframeRef?: React.Ref<HTMLIFrameElement>;
}) {
	const { t } = useTranslation(["broadcast"]);

	return (
		<div className={styles.preview}>
			<span className={styles.gameplay}>
				{t("broadcast:dashboard.gameplay")}
			</span>
			<iframe
				ref={iframeRef}
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
