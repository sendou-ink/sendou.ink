import clsx from "clsx";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import styles from "./ExpandableText.module.css";

/** Server-side guess of whether the two line clamp cuts the text, corrected by measuring once mounted */
const OVERFLOW_GUESS = { length: 80, lines: 2 };

export function ExpandableText({
	text,
	className,
}: {
	text: string;
	className?: string;
}) {
	const { t } = useTranslation(["common"]);
	const [isExpanded, setIsExpanded] = useState(false);
	const [isOverflowing, setIsOverflowing] = useState(
		() =>
			text.length > OVERFLOW_GUESS.length ||
			text.split("\n").length > OVERFLOW_GUESS.lines,
	);

	const measureRef = (node: HTMLDivElement | null) => {
		if (!node || isExpanded) return;
		setIsOverflowing(node.scrollHeight - node.clientHeight > 1);
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
