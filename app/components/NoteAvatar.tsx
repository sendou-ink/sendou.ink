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
	sm: styles.badgeSm,
	md: styles.badgeMd,
} as const;

/**
 * Wraps an avatar (or any node) and overlays a sentiment badge on the bottom-left corner when
 * `sentiment` is set: POSITIVE → green check, NEGATIVE → red cross, NEUTRAL → grey dash. Renders the
 * children without a badge when `sentiment` is `null`/`undefined`. `size` scales the badge to match
 * the wrapped avatar (`sm` for small avatars, `md` for large ones).
 */
export function NoteAvatar({
	sentiment,
	size = "md",
	className,
	children,
}: {
	sentiment?: Sentiment | null;
	size?: keyof typeof SIZE_CLASS;
	className?: string;
	children: React.ReactNode;
}) {
	return (
		<div className={clsx(styles.wrapper, className)}>
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
		</div>
	);
}
