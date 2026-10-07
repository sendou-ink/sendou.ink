import clsx from "clsx";
import * as React from "react";
import { useFloatingLayer } from "~/components/elements/useFloatingLayer";
import { useIsomorphicLayoutEffect } from "~/hooks/useIsomorphicLayoutEffect";
import styles from "./ComposerSuggestions.module.css";

export interface ComposerSuggestion {
	key: string;
	label: string;
	image: React.ReactNode;
}

export function ComposerSuggestions<T extends ComposerSuggestion>({
	id,
	anchorRef,
	suggestions,
	activeKey,
	onSelect,
	"aria-label": ariaLabel,
}: {
	id: string;
	anchorRef: React.RefObject<HTMLElement | null>;
	suggestions: T[];
	activeKey: string | null;
	onSelect: (suggestion: T) => void;
	"aria-label": string;
}) {
	const popoverRef = React.useRef<HTMLDivElement>(null);
	const isOpen = suggestions.length > 0;

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
			<div id={id} role="listbox" aria-label={ariaLabel}>
				{suggestions.map((suggestion) => (
					<div
						key={suggestion.key}
						id={composerSuggestionId(id, suggestion.key)}
						role="option"
						tabIndex={-1}
						aria-selected={suggestion.key === activeKey}
						className={clsx(styles.option, {
							[styles.optionActive]: suggestion.key === activeKey,
						})}
						onPointerDown={(event) => event.preventDefault()}
						onClick={() => onSelect(suggestion)}
					>
						{suggestion.image}
						<span className={styles.label}>{suggestion.label}</span>
					</div>
				))}
			</div>
		</div>
	);
}

export function composerSuggestionId(listboxId: string, key: string) {
	return `${listboxId}-${key}`;
}
