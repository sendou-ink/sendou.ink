import clsx from "clsx";
import { X } from "lucide-react";
import React from "react";
import { useTranslation } from "react-i18next";
import { SendouButton } from "~/components/elements/Button";
import type { CalendarEventTag } from "~/features/calendar/calendar-types";
import { tags as allTags } from "../calendar-constants";
import styles from "./Tags.module.css";

export function Tags({
	tags,
	onDelete,
	small = false,
	centered = false,
	maxVisible,
}: {
	tags: Array<CalendarEventTag>;
	small?: boolean;
	centered?: boolean;
	/** Rest are collapsed into a "+N" indicator; undefined shows all. */
	maxVisible?: number;

	/** Undefined hides the delete buttons. */
	onDelete?: (tag: CalendarEventTag) => void;
}) {
	const { t } = useTranslation();

	if (tags.length === 0) return null;

	const visibleTags = maxVisible ? tags.slice(0, maxVisible) : tags;
	const hiddenCount = tags.length - visibleTags.length;

	return (
		<ul
			className={clsx(styles.tags, {
				[styles.small]: small,
				[styles.centered]: centered,
			})}
		>
			{visibleTags.map((tag) => (
				<React.Fragment key={tag}>
					<li
						style={{ backgroundColor: allTags[tag].color }}
						className={styles.tag}
					>
						{t(`tag.name.${tag}`)}
						{onDelete ? (
							<SendouButton
								onPress={() => onDelete(tag)}
								className={styles.tagDeleteButton}
								icon={<X />}
								variant="minimal"
								aria-label="Remove date"
								size="small"
							/>
						) : null}
					</li>
				</React.Fragment>
			))}
			{hiddenCount > 0 ? (
				<li className={styles.overflowTag}>+{hiddenCount}</li>
			) : null}
		</ul>
	);
}
