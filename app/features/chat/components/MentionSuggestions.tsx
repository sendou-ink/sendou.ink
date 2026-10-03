import clsx from "clsx";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Avatar } from "~/components/Avatar";
import { useFloatingLayer } from "~/components/elements/useFloatingLayer";
import { useIsomorphicLayoutEffect } from "~/hooks/useIsomorphicLayoutEffect";
import type { CommonUser } from "~/utils/kysely.server";
import styles from "./MentionSuggestions.module.css";

export function MentionSuggestions({
	id,
	anchorRef,
	users,
	activeUserId,
	onSelect,
}: {
	id: string;
	anchorRef: React.RefObject<HTMLElement | null>;
	users: CommonUser[];
	activeUserId: number | null;
	onSelect: (user: CommonUser) => void;
}) {
	const { t } = useTranslation(["common"]);
	const popoverRef = React.useRef<HTMLDivElement>(null);
	const isOpen = users.length > 0;

	useIsomorphicLayoutEffect(() => {
		const popover = popoverRef.current;
		if (!popover) return;

		if (isOpen && !popover.matches(":popover-open")) {
			popover.showPopover();
		} else if (!isOpen && popover.matches(":popover-open")) {
			popover.hidePopover();
		}
	}, [isOpen]);

	useFloatingLayer({
		isOpen,
		floatingRef: popoverRef,
		getAnchor: () => anchorRef.current,
		placement: "top",
	});

	return (
		<div ref={popoverRef} popover="manual" className={styles.popover}>
			<div
				id={id}
				role="listbox"
				aria-label={t("common:chat.mention.suggestions")}
			>
				{users.map((user) => (
					<div
						key={user.id}
						id={mentionSuggestionId(id, user.id)}
						role="option"
						tabIndex={-1}
						aria-selected={user.id === activeUserId}
						className={clsx(styles.option, {
							[styles.optionActive]: user.id === activeUserId,
						})}
						onPointerDown={(event) => event.preventDefault()}
						onClick={() => onSelect(user)}
					>
						<Avatar user={user} size="xxxs" />
						<span className={styles.username}>{user.username}</span>
					</div>
				))}
			</div>
		</div>
	);
}

export function mentionSuggestionId(listboxId: string, userId: number) {
	return `${listboxId}-${userId}`;
}
