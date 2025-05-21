import clsx from "clsx";
import React from "react";
import { useTranslation } from "react-i18next";
import { Badge, type BadgeProps } from "~/components/Badge";
import { Button } from "~/components/Button";
import { CrossIcon } from "~/components/icons/Cross";
import type { CalendarEventTag } from "~/db/tables";
import { tags as allTags } from "../calendar-constants";

// xxx: retire sz only, tw only tags and only infer + show maps on the calendar?

export function Tags({
	tags,
	badges,
	onDelete,
	small = false,
	centered = false,
}: {
	tags: Array<CalendarEventTag>;
	badges?: Array<BadgeProps["badge"]>;
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
						className={clsx("calendar__event__tag", {
							"calendar__event__badge-tag": tag === "BADGE",
						})}
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
						{tag === "BADGE" && badges && (
							<div className="calendar__event__tag-badges">
								{badges.map((badge) => (
									<Badge key={badge.code} badge={badge} size={20} isAnimated />
								))}
							</div>
						)}
					</li>
				</React.Fragment>
			))}
		</ul>
	);
}
