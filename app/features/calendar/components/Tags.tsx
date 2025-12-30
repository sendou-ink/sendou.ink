import clsx from "clsx";
import React from "react";
import { useTranslation } from "react-i18next";
import { SendouButton } from "~/components/elements/Button";
import { CrossIcon } from "~/components/icons/Cross";
import type { CalendarEventTag } from "~/db/tables";
import { tags as allTags } from "../calendar-constants";
import styles from "./Tags.module.css";

export function Tags({
	tags,
	onDelete,
	small = false,
	centered = false,
}: {
	tags: Array<CalendarEventTag>;
	small?: boolean;
	centered?: boolean;

	/** Called when tag delete button clicked. If undefined delete buttons won't be shown. */
	onDelete?: (tag: CalendarEventTag) => void;
}) {
	const { t } = useTranslation();

	if (tags.length === 0) return null;

	return (
		<ul
			className={clsx(styles.tags, {
				[styles.small]: small,
				[styles.centered]: centered,
			})}
		>
			{tags.map((tag) => (
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
								icon={<CrossIcon />}
								variant="minimal"
								aria-label="Remove date"
								size="small"
							/>
						) : null}
					</li>
				</React.Fragment>
			))}
		</ul>
	);
}
