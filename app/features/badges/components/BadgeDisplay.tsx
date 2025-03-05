import clsx from "clsx";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "~/components/Badge";
import { Button } from "~/components/Button";
import { TrashIcon } from "~/components/icons/Trash";
import type { Tables } from "~/db/tables";
import type { Unpacked } from "~/utils/types";
import { badgeExplanationText } from "../badges-utils";

interface BadgeDisplayProps {
	badges: Array<Omit<Tables["Badge"], "authorId"> & { count?: number }>;
	onBadgeRemove?: (badgeId: number) => void;
}

export function BadgeDisplay({
	badges: _badges,
	onBadgeRemove,
}: BadgeDisplayProps) {
	const { t } = useTranslation("badges");
	const [badges, setBadges] = React.useState(_badges);

	const [bigBadge, ...smallBadges] = badges;
	if (!bigBadge) return null;

	const setBadgeFirst = (badge: Unpacked<BadgeDisplayProps["badges"]>) => {
		setBadges(
			badges.map((b, i) => {
				if (i === 0) return badge;
				if (b.id === badge.id) return badges[0];

				return b;
			}),
		);
	};

	return (
		<div>
			<div
				className={clsx("badge-display__badges", {
					"justify-center": smallBadges.length === 0,
				})}
			>
				<Badge badge={bigBadge} size={125} isAnimated />
				{smallBadges.length > 0 ? (
					<div className="badge-display__small-badges">
						{smallBadges.map((badge) => (
							<div
								key={badge.id}
								className="badge-display__small-badge-container"
							>
								<Badge
									badge={badge}
									onClick={() => setBadgeFirst(badge)}
									size={48}
									isAnimated
								/>
								{badge.count && badge.count > 1 ? (
									<div className="badge-display__small-badge-count">
										×{badge.count}
									</div>
								) : null}
							</div>
						))}
					</div>
				) : null}
			</div>
			<div className="badge-display__badge-explanation">
				{badgeExplanationText(t, bigBadge)}
				{onBadgeRemove ? (
					<Button
						icon={<TrashIcon />}
						variant="minimal-destructive"
						onClick={() => onBadgeRemove(bigBadge.id)}
					/>
				) : null}
			</div>
		</div>
	);
}
