import clsx from "clsx";
import * as React from "react";
import { flushSync } from "react-dom";
import { useIsomorphicLayoutEffect } from "~/hooks/useIsomorphicLayoutEffect";
import { useTopLayerViewTransitionStyle } from "~/utils/view-transition";
import {
	type AnchorPlacement,
	useAnchorPositioning,
} from "./anchor-positioning";
import styles from "./Popover.module.css";
import { useCloseOnScrollClip } from "./useCloseOnScrollClip";

export type PopoverPlacement = AnchorPlacement;

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
 * Shows a popover once React has committed `open`, so content mounted only
 * while open is in the popover's first painted frame instead of appearing a
 * frame after it. Returns the `beforetoggle` handler for the popover: the
 * browser's own open (the trigger's `popoverTarget`) is cancelled there and
 * redone through `onOpen` in the next frame, still before it paints, as a
 * popover cannot be shown from inside the show operation being cancelled.
 * Call it before `useAnchorPositioning` so the popover is showing by the time
 * that measures it.
 */
export function useShowPopoverOnOpen({
	popoverRef,
	open,
	onOpen,
}: {
	popoverRef: React.RefObject<HTMLElement | null>;
	open: boolean;
	onOpen: () => void;
}) {
	const showingRef = React.useRef(false);
	const onOpenRef = React.useRef(onOpen);
	onOpenRef.current = onOpen;

	useIsomorphicLayoutEffect(() => {
		const popover = popoverRef.current;
		if (!open || !popover || popover.matches(":popover-open")) return;
		showingRef.current = true;
		popover.showPopover();
		showingRef.current = false;
	}, [open, popoverRef]);

	return (event: React.ToggleEvent<HTMLElement>) => {
		if (
			!isOwnToggle(event) ||
			event.newState !== "open" ||
			showingRef.current
		) {
			return;
		}
		event.preventDefault();
		requestAnimationFrame(() => flushSync(() => onOpenRef.current()));
	};
}

/**
 * Whether a focusout moved focus to an element outside all of `containers`,
 * so an overlay tabbed out of can close. Focus lost to nowhere (a click on a
 * non-focusable spot) does not count: native light dismiss covers pointers.
 */
export function focusLeftTo(
	event: React.FocusEvent,
	containers: Array<Element | null | undefined>,
) {
	const next = event.relatedTarget;
	if (!(next instanceof Node)) return false;
	return !containers.some((container) => container?.contains(next));
}

/**
 * Popover opened by `trigger` (a SendouButton); controlled or uncontrolled. Renders through the
 * native popover API with CSS anchor positioning.
 *
 * With `eager` the content is rendered while closed too, so the popover opens with its content
 * before hydration (and without JavaScript altogether).
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
	const triggerContainerRef = React.useRef<HTMLSpanElement>(null);
	const topLayerStyle = useTopLayerViewTransitionStyle();

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
		if (!open) {
			popover.hidePopover();
		}
	}, [open]);

	const onBeforeToggle = useShowPopoverOnOpen({
		popoverRef,
		open,
		onOpen: () => setOpen(true),
	});
	useCloseOnScrollClip(open, popoverRef, () => setOpen(false));
	useAnchorPositioning({
		isOpen: open,
		popoverRef,
		getAnchor: () => triggerContainerRef.current?.firstElementChild ?? null,
		placement,
		constrainHeight: true,
	});

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

	const onBlur = (event: React.FocusEvent) => {
		if (
			open &&
			focusLeftTo(event, [triggerContainerRef.current, popoverRef.current])
		) {
			popoverRef.current?.hidePopover();
		}
	};

	return (
		<>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: only observes focus leaving the trigger */}
			<span
				ref={triggerContainerRef}
				className={styles.triggerContainer}
				style={{ "--popover-anchor": anchorName } as React.CSSProperties}
				onBlur={onBlur}
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
				style={
					{
						positionAnchor: anchorName,
						...topLayerStyle,
					} as React.CSSProperties
				}
				role="dialog"
				tabIndex={-1}
				data-placement={placement}
				onBeforeToggle={onBeforeToggle}
				onToggle={onToggle}
				onBlur={onBlur}
			>
				{open || eager ? children : null}
			</div>
		</>
	);
}

/** Controlled popover anchored to a trigger rendered outside of it. Prefer `SendouPopover` when the trigger can be passed in. */
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
	const topLayerStyle = useTopLayerViewTransitionStyle();

	// before the positioning effect, so the content is placed by its first paint
	useIsomorphicLayoutEffect(() => {
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
	useAnchorPositioning({
		isOpen,
		popoverRef,
		getAnchor: () => triggerRef.current,
		constrainHeight: true,
	});

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
			style={
				{ positionAnchor: anchorName, ...topLayerStyle } as React.CSSProperties
			}
			role="dialog"
			tabIndex={-1}
			aria-label={ariaLabel}
			onToggle={onToggle}
		>
			{isOpen ? children : null}
		</div>
	);
}
