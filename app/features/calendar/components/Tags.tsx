import clsx from "clsx";
import React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "~/components/Button";
import { CrossIcon } from "~/components/icons/Cross";
import type { CalendarEventTag } from "~/db/tables";
import { persistedTags as allTags } from "../calendar-constants";

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
		<ul className={clsx("calendar__event__tags", { small, centered })}>
			{tags.map((tag) => (
				<React.Fragment key={tag}>
					<li
						style={{ backgroundColor: allTags[tag].color }}
						className="calendar__event__tag"
					>
						{t(`tag.name.${tag}`)}
						{onDelete && (
							<Button
								onClick={() => onDelete(tag)}
								className="calendar__event__tag-delete-button"
								icon={<CrossIcon />}
								variant="minimal"
								aria-label="Remove date"
								size="tiny"
							/>
						)}
					</li>
				</React.Fragment>
			))}
		</ul>
	);
}
