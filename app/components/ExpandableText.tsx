import clsx from "clsx";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import styles from "./ExpandableText.module.css";

export function ExpandableText({
	text,
	className,
}: {
	text: string;
	className?: string;
}) {
	const { t } = useTranslation(["common"]);
	const [isExpanded, setIsExpanded] = useState(false);
	const [isOverflowing, setIsOverflowing] = useState(false);

	const measureRef = (node: HTMLDivElement | null) => {
		if (!node) return;
		if (node.scrollHeight - node.clientHeight > 1) {
			setIsOverflowing(true);
		}
	};

	return (
		<div className={clsx(styles.container, className)}>
			<div ref={measureRef} className={clsx(!isExpanded && styles.clampedText)}>
				{text}
			</div>
			{isOverflowing ? (
				<button
					type="button"
					onClick={() => setIsExpanded(!isExpanded)}
					className={styles.expandButton}
				>
					{isExpanded
						? t("common:actions.showLess")
						: t("common:actions.showMore")}
				</button>
			) : null}
		</div>
	);
}
