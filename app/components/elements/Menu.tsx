import clsx from "clsx";
import * as React from "react";
import { Link } from "react-router";
import { useIsomorphicLayoutEffect } from "~/hooks/useIsomorphicLayoutEffect";
import { useLatestRef } from "~/hooks/useLatestRef";
import {
	type FocusMove,
	focusMoveForKey,
	rovingFocusIndex,
} from "~/utils/roving-focus";
import { Image } from "../Image";
import styles from "./Menu.module.css";
import {
	focusLeftTo,
	isOwnToggle,
	usePopoverTriggerPropsOnceHydrated,
	useShowPopoverOnOpen,
} from "./Popover";
import { useFloatingLayer } from "./useFloatingLayer";

type MenuPlacement = "bottom start" | "bottom end" | "bottom right";

interface SendouMenuProps {
	trigger: React.ReactElement<Record<string, unknown>>;
	scrolling?: boolean;
	opensLeft?: boolean;
	children: React.ReactNode;
	popoverClassName?: string;
	placement?: MenuPlacement;
}

const MenuContext = React.createContext<{ close: () => void }>({
	close: () => {},
});

export function SendouMenu({
	children,
	trigger,
	opensLeft,
	scrolling,
	placement,
	popoverClassName,
}: SendouMenuProps) {
	const popoverId = `${React.useId()}-menu`;
	const popoverTriggerProps = usePopoverTriggerPropsOnceHydrated(popoverId);

	const [open, setOpen] = React.useState(false);
	const popoverRef = React.useRef<HTMLDivElement>(null);
	const triggerContainerRef = React.useRef<HTMLSpanElement>(null);

	const onBeforeToggle = useShowPopoverOnOpen({
		popoverRef,
		open,
		onOpen: () => setOpen(true),
	});

	useFloatingLayer({
		isOpen: open,
		floatingRef: popoverRef,
		getAnchor: () => triggerContainerRef.current?.firstElementChild ?? null,
		placement:
			opensLeft || (placement && placement !== "bottom start")
				? "bottom end"
				: "bottom start",
	});

	const onToggle = (event: React.ToggleEvent<HTMLDivElement>) => {
		if (!isOwnToggle(event)) return;

		const next = event.newState === "open";
		if (next) {
			popoverRef.current?.focus();
		}
		if (next !== open) {
			setOpen(next);
		}
	};

	const onKeyDown = (event: React.KeyboardEvent) => {
		if (event.key === "Escape") {
			event.preventDefault();
			popoverRef.current?.hidePopover();
			return;
		}
		const move = focusMoveForKey(event.key);
		if (!move) return;
		event.preventDefault();
		focusItem(popoverRef.current, move);
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
				onBlur={onBlur}
			>
				{React.cloneElement(trigger, {
					...popoverTriggerProps,
					"aria-expanded": open,
					"aria-haspopup": "menu",
				})}
			</span>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: keydown steers the menu items inside */}
			<div
				ref={popoverRef}
				id={popoverId}
				popover="auto"
				tabIndex={-1}
				className={clsx(styles.popover, popoverClassName, {
					[styles.scrolling]: scrolling,
				})}
				onBeforeToggle={onBeforeToggle}
				onToggle={onToggle}
				onKeyDown={onKeyDown}
				onBlur={onBlur}
			>
				<div className={styles.itemsContainer} role="menu">
					{open ? (
						<MenuContext
							value={{ close: () => popoverRef.current?.hidePopover() }}
						>
							{children}
						</MenuContext>
					) : null}
				</div>
			</div>
		</>
	);
}

/**
 * A menu opened at a point of the page instead of by a trigger, e.g. by a right click. Shown
 * while rendered: the parent renders it to open it and stops rendering it on `onClose`, called
 * when an item is picked, on Escape, on a press anywhere outside it and when focus leaves it.
 */
export function SendouContextMenu({
	clientPoint,
	...rest
}: {
	/** Where the menu opens, in viewport pixels. */
	clientPoint: { x: number; y: number };
	onClose: () => void;
	children: React.ReactNode;
	"aria-label"?: string;
	"data-testid"?: string;
}) {
	return (
		<ContextMenuAtPoint
			key={`${clientPoint.x},${clientPoint.y}`}
			clientPoint={clientPoint}
			{...rest}
		/>
	);
}

function ContextMenuAtPoint({
	clientPoint,
	onClose,
	children,
	...rest
}: React.ComponentProps<typeof SendouContextMenu>) {
	const popoverRef = React.useRef<HTMLDivElement>(null);
	const anchorRef = React.useRef<HTMLSpanElement>(null);
	const onCloseRef = useLatestRef(onClose);

	useIsomorphicLayoutEffect(() => {
		const popover = popoverRef.current;
		if (!popover) return;

		popover.showPopover();
		popover.focus();

		const closeOnPressOutside = (event: PointerEvent) => {
			if (event.target instanceof Node && popover.contains(event.target)) {
				return;
			}
			onCloseRef.current();
		};
		const close = () => onCloseRef.current();
		document.addEventListener("pointerdown", closeOnPressOutside, true);
		window.addEventListener("blur", close);

		return () => {
			document.removeEventListener("pointerdown", closeOnPressOutside, true);
			window.removeEventListener("blur", close);
			if (popover.matches(":popover-open")) popover.hidePopover();
		};
	}, []);

	useFloatingLayer({
		isOpen: true,
		floatingRef: popoverRef,
		getAnchor: () => anchorRef.current,
		placement: "bottom start",
	});

	const onKeyDown = (event: React.KeyboardEvent) => {
		if (event.key === "Escape") {
			event.preventDefault();
			onClose();
			return;
		}
		const move = focusMoveForKey(event.key);
		if (!move) return;
		event.preventDefault();
		focusItem(popoverRef.current, move);
	};

	const onBlur = (event: React.FocusEvent) => {
		if (focusLeftTo(event, [popoverRef.current])) onClose();
	};

	return (
		<>
			<span
				ref={anchorRef}
				className={styles.contextMenuAnchor}
				style={{ left: clientPoint.x, top: clientPoint.y }}
			/>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: keydown steers the menu items inside */}
			<div
				ref={popoverRef}
				popover="manual"
				tabIndex={-1}
				className={styles.popover}
				onKeyDown={onKeyDown}
				onBlur={onBlur}
				data-testid={rest["data-testid"]}
			>
				<div
					className={styles.itemsContainer}
					role="menu"
					aria-label={rest["aria-label"]}
				>
					<MenuContext value={{ close: onClose }}>{children}</MenuContext>
				</div>
			</div>
		</>
	);
}

function focusItem(popover: HTMLElement | null, move: FocusMove) {
	const elements = [
		...(popover?.querySelectorAll<HTMLElement>(
			'[role="menuitem"]:not([aria-disabled="true"])',
		) ?? []),
	];
	if (elements.length === 0) return;

	const activeIndex = elements.indexOf(document.activeElement as HTMLElement);
	elements[
		rovingFocusIndex(move, activeIndex, elements.length, { wrap: true })
	].focus();
}

export interface SendouMenuItemProps {
	id?: string;
	children: React.ReactNode;
	onAction?: () => void;
	href?: string;
	target?: string;
	rel?: string;
	icon?: React.ReactNode;
	imagePath?: string;
	isActive?: boolean;
	isDestructive?: boolean;
	isDisabled?: boolean;
	"data-testid"?: string;
}

export function SendouMenuSection({
	children,
	headerText,
	headerClassName,
}: {
	children: React.ReactNode;
	headerText?: React.ReactNode;
	headerClassName?: string;
}) {
	return (
		// biome-ignore lint/a11y/useSemanticElements: a fieldset would carry form semantics this menu group does not have
		<div role="group">
			{headerText ? (
				<div className={clsx(styles.menuHeader, headerClassName)}>
					{headerText}
				</div>
			) : null}
			{children}
		</div>
	);
}

export function SendouMenuItem(props: SendouMenuItemProps) {
	const menu = React.use(MenuContext);

	const className = clsx(styles.item, {
		[styles.itemDisabled]: props.isDisabled,
		[styles.itemActive]: props.isActive,
		[styles.itemDestructive]: props.isDestructive,
	});

	const content = (
		<>
			{props.icon ? (
				<span className={styles.itemIcon}>{props.icon}</span>
			) : null}
			{props.imagePath ? (
				<Image
					path={props.imagePath}
					alt=""
					width={20}
					height={20}
					className={styles.itemImg}
				/>
			) : null}
			{props.children}
		</>
	);

	const act = (event: React.MouseEvent) => {
		if (props.isDisabled) {
			event.preventDefault();
			return;
		}
		menu.close();
		props.onAction?.();
	};

	if (props.href) {
		const linkProps = {
			id: props.id,
			role: "menuitem",
			tabIndex: -1,
			className,
			target: props.target,
			rel: props.rel,
			"aria-disabled": props.isDisabled || undefined,
			"data-testid": props["data-testid"],
			onClick: act,
		};

		return props.href.startsWith("/") ? (
			<Link to={props.href} prefetch="intent" {...linkProps}>
				{content}
			</Link>
		) : (
			<a href={props.href} {...linkProps}>
				{content}
			</a>
		);
	}

	return (
		<button
			type="button"
			id={props.id}
			role="menuitem"
			tabIndex={-1}
			className={className}
			aria-disabled={props.isDisabled || undefined}
			data-testid={props["data-testid"]}
			onClick={act}
		>
			{content}
		</button>
	);
}
