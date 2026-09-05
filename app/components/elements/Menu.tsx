import clsx from "clsx";
import * as React from "react";
import { Link } from "react-router";
import {
	type FocusMove,
	focusMoveForKey,
	rovingFocusIndex,
} from "~/utils/roving-focus";
import { Image } from "../Image";
import { useAnchorPositioning } from "./anchor-positioning";
import styles from "./Menu.module.css";
import { focusLeftTo, isOwnToggle, useAnchorSafeId } from "./Popover";
import { useCloseOnScrollClip } from "./useCloseOnScrollClip";

type MenuPlacement = "bottom start" | "bottom end" | "bottom right";

interface SendouMenuProps {
	trigger: React.ReactElement<Record<string, unknown>>;
	scrolling?: boolean;
	opensLeft?: boolean;
	children: React.ReactNode;
	popoverClassName?: string;
	placement?: MenuPlacement;
	/** Render the items while closed too, so the menu works before hydration (and without JavaScript). */
	eager?: boolean;
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
	eager,
}: SendouMenuProps) {
	const uid = useAnchorSafeId();
	const popoverId = `${uid}-menu`;
	const anchorName = `--menu-anchor-${uid}`;

	const [open, setOpen] = React.useState(false);
	const popoverRef = React.useRef<HTMLDivElement>(null);
	const triggerContainerRef = React.useRef<HTMLSpanElement>(null);

	// an eager menu can be open before hydration, its toggle event long gone
	React.useEffect(() => {
		if (popoverRef.current?.matches(":popover-open")) setOpen(true);
	}, []);

	useCloseOnScrollClip(open, popoverRef, () =>
		popoverRef.current?.hidePopover(),
	);
	useAnchorPositioning({
		isOpen: open,
		popoverRef,
		getAnchor: () => triggerContainerRef.current?.firstElementChild ?? null,
		placement:
			opensLeft || (placement && placement !== "bottom start")
				? "bottom end"
				: "bottom start",
	});

	const onToggle = (event: React.ToggleEvent<HTMLDivElement>) => {
		if (!isOwnToggle(event)) return;

		const next = event.newState === "open";
		if (next === open) return;
		setOpen(next);

		if (next) {
			requestAnimationFrame(() => popoverRef.current?.focus());
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
				style={{ "--menu-anchor": anchorName } as React.CSSProperties}
				onBlur={onBlur}
			>
				{React.cloneElement(trigger, {
					popoverTarget: popoverId,
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
				className={clsx(styles.popover, "scrollbar", popoverClassName, {
					[styles.scrolling]: scrolling,
					[styles.opensLeft]: opensLeft,
				})}
				style={{ positionAnchor: anchorName } as React.CSSProperties}
				data-placement={placement}
				onToggle={onToggle}
				onKeyDown={onKeyDown}
				onBlur={onBlur}
			>
				<div className={styles.itemsContainer} role="menu">
					{open || eager ? (
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
			<Link to={props.href} {...linkProps}>
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
