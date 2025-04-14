import clsx from "clsx";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "~/components/Badge";
import { Button } from "~/components/Button";
import { SendouButton } from "~/components/elements/Button";
import { TrashIcon } from "~/components/icons/Trash";
import type { Tables } from "~/db/tables";
import { usePagination } from "~/hooks/usePagination";
import type { Unpacked } from "~/utils/types";
import { badgeExplanationText } from "../badges-utils";
import styles from "./BadgeDisplay.module.css";

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

	const {
		itemsToDisplay,
		everythingVisible,
		currentPage,
		pagesCount,
		setPage,
	} = usePagination({
		items: smallBadges,
		pageSize: 9,
		scrollToTop: false,
	});

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
			<div className={styles.badgeExplanation}>
				{badgeExplanationText(t, bigBadge)}
				{onBadgeRemove ? (
					<Button
						icon={<TrashIcon />}
						variant="minimal-destructive"
						onClick={() => onBadgeRemove(bigBadge.id)}
					/>
				) : null}
			</div>
			<div
				className={clsx(styles.badges, {
					"justify-center": smallBadges.length === 0,
				})}
			>
				<Badge badge={bigBadge} size={125} isAnimated />
				{smallBadges.length > 0 ? (
					<div className={styles.smallBadges}>
						{itemsToDisplay.map((badge) => (
							<div key={badge.id} className={styles.smallBadgeContainer}>
								<Badge
									badge={badge}
									onClick={() => setBadgeFirst(badge)}
									size={48}
									isAnimated
								/>
								{badge.count && badge.count > 1 ? (
									<div className={styles.smallBadgeCount}>×{badge.count}</div>
								) : null}
							</div>
						))}
					</div>
				) : null}
			</div>
			{!everythingVisible ? (
				<BadgePagination
					pagesCount={pagesCount}
					currentPage={currentPage}
					setPage={setPage}
				/>
			) : null}
		</div>
	);
}

interface BadgePaginationProps {
	pagesCount: number;
	currentPage: number;
	setPage: (page: number) => void;
}

function BadgePagination({
	pagesCount,
	currentPage,
	setPage,
}: BadgePaginationProps) {
	return (
		<div className={styles.pagination}>
			{Array.from({ length: pagesCount }, (_, i) => (
				<SendouButton
					key={i}
					variant="minimal"
					aria-label={`Badges page ${i + 1}`}
					onPress={() => setPage(i + 1)}
					className={clsx(styles.paginationButton, {
						[styles.paginationButtonActive]: currentPage === i + 1,
					})}
				>
					{i + 1}
				</SendouButton>
			))}
		</div>
	);
}
