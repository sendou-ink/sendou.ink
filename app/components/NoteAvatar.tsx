import clsx from "clsx";
import { Check, Minus, X } from "lucide-react";
import type * as React from "react";
import type { Tables } from "~/db/tables";
import styles from "./NoteAvatar.module.css";

type Sentiment = Tables["PrivateUserNote"]["sentiment"];

const BADGE_CLASS: Record<Sentiment, string> = {
	POSITIVE: styles.positive,
	NEUTRAL: styles.neutral,
	NEGATIVE: styles.negative,
};

const BADGE_ICON: Record<Sentiment, React.ReactNode> = {
	POSITIVE: <Check />,
	NEUTRAL: <Minus />,
	NEGATIVE: <X />,
};

const SIZE_CLASS = {
	xs: styles.badgeXs,
	sm: styles.badgeSm,
	md: styles.badgeMd,
} as const;

/**
 * Overlays a sentiment badge (check / cross / dash) on the bottom-left of the wrapped avatar;
 * `size` matches the avatar. `onClick` is kept out of the tab order, so only use it as a shortcut
 * to an action also available elsewhere.
 */
export function NoteAvatar({
	sentiment,
	size = "md",
	className,
	onClick,
	children,
}: {
	sentiment?: Sentiment | null;
	size?: keyof typeof SIZE_CLASS;
	className?: string;
	onClick?: () => void;
	children: React.ReactNode;
}) {
	const Wrapper = onClick ? "button" : "div";

	return (
		<Wrapper
			type={onClick ? "button" : undefined}
			className={clsx(styles.wrapper, className, {
				[styles.clickable]: onClick,
			})}
			onClick={onClick}
			tabIndex={onClick ? -1 : undefined}
		>
			{children}
			{sentiment ? (
				<span
					className={clsx(
						styles.badge,
						SIZE_CLASS[size],
						BADGE_CLASS[sentiment],
					)}
					aria-hidden
				>
					{BADGE_ICON[sentiment]}
				</span>
			) : null}
		</Wrapper>
	);
}
