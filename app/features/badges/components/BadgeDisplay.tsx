import clsx from "clsx";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "~/components/Badge";
import { Button } from "~/components/Button";
import { SendouButton } from "~/components/elements/Button";
import { TrashIcon } from "~/components/icons/Trash";
import type { Tables } from "~/db/tables";
import { BADGE } from "~/features/badges/badges-constants";
import { usePagination } from "~/hooks/usePagination";
import type { Unpacked } from "~/utils/types";
import { badgeExplanationText } from "../badges-utils";
import styles from "./BadgeDisplay.module.css";

export interface BadgeDisplayProps {
	badges: Array<Omit<Tables["Badge"], "authorId"> & { count?: number }>;
	onChange?: (badgeIds: number[]) => void;
	children?: React.ReactNode;
	showText?: boolean;
	className?: string;
}

export function BadgeDisplay({
	badges: _badges,
	onChange,
	children,
	showText = true,
	className,
}: BadgeDisplayProps) {
	const { t } = useTranslation("badges");
	const [badges, setBadges] = React.useState(_badges);

	const [bigBadge, ...smallBadges] = badges;

	const isPaginated = !onChange;

	const {
		itemsToDisplay,
		everythingVisible,
		currentPage,
		pagesCount,
		setPage,
	} = usePagination({
		items: smallBadges,
		pageSize: isPaginated ? BADGE.SMALL_BADGES_PER_DISPLAY_PAGE : 1000,
		scrollToTop: false,
	});

	if (!bigBadge) return null;

	const setBadgeFirst = (badge: Unpacked<BadgeDisplayProps["badges"]>) => {
		const newBadges = badges.map((b, i) => {
			if (i === 0) return badge;
			if (b.id === badge.id) return badges[0];

			return b;
		});

		setBadges(newBadges);
		onChange?.(newBadges.map((b) => b.id));
	};

	return (
		<div data-testid="badge-display">
			{isPaginated && showText ? (
				<div className={styles.badgeExplanation}>
					{badgeExplanationText(t, bigBadge)}
				</div>
			) : null}
			<div
				className={clsx(className, styles.badges, {
					"justify-center": smallBadges.length === 0,
				})}
			>
				<Badge badge={bigBadge} size={125} isAnimated />
				{!children && smallBadges.length > 0 ? (
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
				{children}
			</div>
			{!isPaginated ? (
				<div className={styles.badgeExplanation}>
					{badgeExplanationText(t, bigBadge)}
					{onChange ? (
						<Button
							icon={<TrashIcon />}
							variant="minimal-destructive"
							onClick={() =>
								onChange(
									badges.filter((b) => b.id !== bigBadge.id).map((b) => b.id),
								)
							}
						/>
					) : null}
				</div>
			) : null}
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
					data-testid="badge-pagination-button"
				>
					{i + 1}
				</SendouButton>
			))}
		</div>
	);
}
