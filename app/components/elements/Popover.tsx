import clsx from "clsx";
import * as React from "react";
import styles from "./Popover.module.css";
import { useCloseOnScrollClip } from "./popover-scroll-close";

export type PopoverPlacement =
	| "top"
	| "bottom"
	| "right"
	| "bottom start"
	| "bottom end";

/** `useId` values hold characters CSS idents can't (e.g. `:`), strip them for anchor names. */
export function useAnchorSafeId() {
	return React.useId().replace(/[^a-zA-Z0-9-]/g, "");
}

/**
 * `toggle` does not bubble natively but React propagates it anyway, so an
 * overlay nested inside another (a select in a popover, a menu in a dialog)
 * would otherwise open and close its ancestor along with itself.
 */
export function isOwnToggle(event: React.ToggleEvent<HTMLElement>) {
	return event.target === event.currentTarget;
}

/**
 * A reusable popover component that wraps around a trigger element (SendouButton).
 * Renders through the native popover API with CSS anchor positioning.
 * Supports controlled and uncontrolled open states.
 *
 * With `eager` the content is rendered while closed too, so the popover opens
 * with its content before hydration (and without JavaScript altogether).
 *
 * @example
 * ```tsx
 * <SendouPopover
 *   trigger={<SendouButton>Click me</SendouButton>}
 * >
 *   Popover content goes here!
 * </SendouPopover>
 * ```
 */
export function SendouPopover({
	children,
	trigger,
	popoverClassName,
	placement,
	onOpenChange,
	isOpen,
	eager,
}: {
	children: React.ReactNode;
	trigger: React.ReactElement<Record<string, unknown>>;
	popoverClassName?: string;
	placement?: PopoverPlacement;
	onOpenChange?: (isOpen: boolean) => void;
	isOpen?: boolean;
	eager?: boolean;
}) {
	const uid = useAnchorSafeId();
	const popoverId = `${uid}-popover`;
	const anchorName = `--popover-anchor-${uid}`;

	const [isControlled] = React.useState(isOpen !== undefined);
	const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
	const open = isControlled ? Boolean(isOpen) : uncontrolledOpen;

	const popoverRef = React.useRef<HTMLDivElement>(null);

	const setOpen = (next: boolean) => {
		if (!isControlled) {
			setUncontrolledOpen(next);
		}
		onOpenChange?.(next);
	};
	const setOpenRef = React.useRef(setOpen);
	setOpenRef.current = setOpen;

	const hasSyncedRef = React.useRef(false);
	React.useEffect(() => {
		const popover = popoverRef.current;
		if (!popover) return;
		const domOpen = popover.matches(":popover-open");
		const isFirstSync = !hasSyncedRef.current;
		hasSyncedRef.current = true;

		if (domOpen === open) return;
		// opened before hydration: adopt it rather than closing it under the user
		if (isFirstSync && domOpen) {
			setOpenRef.current(true);
			return;
		}
		if (open) {
			popover.showPopover();
		} else {
			popover.hidePopover();
		}
	}, [open]);

	useCloseOnScrollClip(open, popoverRef, () => setOpen(false));

	const onToggle = (event: React.ToggleEvent<HTMLDivElement>) => {
		if (!isOwnToggle(event)) return;

		const next = event.newState === "open";
		if (next !== open) {
			setOpen(next);
		}
		if (next) {
			popoverRef.current?.focus();
		}
	};

	return (
		<>
			<span
				className={styles.triggerContainer}
				style={{ "--popover-anchor": anchorName } as React.CSSProperties}
			>
				{React.cloneElement(trigger, {
					popoverTarget: popoverId,
					"aria-haspopup": "dialog",
				})}
			</span>
			<div
				ref={popoverRef}
				id={popoverId}
				popover="auto"
				className={clsx(styles.content, popoverClassName)}
				style={{ positionAnchor: anchorName } as React.CSSProperties}
				role="dialog"
				tabIndex={-1}
				data-placement={placement}
				onToggle={onToggle}
			>
				{open || eager ? children : null}
			</div>
		</>
	);
}

/**
 * Popover anchored to a trigger rendered outside of it, with its open state
 * controlled by the caller. Prefer `SendouPopover` when the trigger can be
 * passed in.
 */
export function SendouAnchoredPopover({
	children,
	isOpen,
	onOpenChange,
	triggerRef,
	"aria-label": ariaLabel,
}: {
	children: React.ReactNode;
	isOpen: boolean;
	onOpenChange: (isOpen: boolean) => void;
	triggerRef: React.RefObject<HTMLElement | null>;
	"aria-label"?: string;
}) {
	const uid = useAnchorSafeId();
	const anchorName = `--popover-anchor-${uid}`;

	const popoverRef = React.useRef<HTMLDivElement>(null);

	React.useEffect(() => {
		const trigger = triggerRef.current;
		const popover = popoverRef.current;
		if (!popover) return;

		if (isOpen) {
			trigger?.style.setProperty("anchor-name", anchorName);
			if (!popover.matches(":popover-open")) {
				popover.showPopover();
			}
		} else if (popover.matches(":popover-open")) {
			popover.hidePopover();
		}

		return () => {
			trigger?.style.removeProperty("anchor-name");
		};
	}, [isOpen, triggerRef, anchorName]);

	useCloseOnScrollClip(isOpen, popoverRef, () => onOpenChange(false));

	const onToggle = (event: React.ToggleEvent<HTMLDivElement>) => {
		if (!isOwnToggle(event)) return;

		const next = event.newState === "open";
		if (next !== isOpen) {
			onOpenChange(next);
		}
		if (next) {
			popoverRef.current?.focus();
		}
	};

	return (
		<div
			ref={popoverRef}
			popover="auto"
			className={styles.content}
			style={{ positionAnchor: anchorName } as React.CSSProperties}
			role="dialog"
			tabIndex={-1}
			aria-label={ariaLabel}
			onToggle={onToggle}
		>
			{isOpen ? children : null}
		</div>
	);
}
