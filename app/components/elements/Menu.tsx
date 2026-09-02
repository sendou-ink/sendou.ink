import clsx from "clsx";
import * as React from "react";
import { Link } from "react-router";
import { Image } from "../Image";
import styles from "./Menu.module.css";
import { isOwnToggle, useAnchorSafeId } from "./Popover";
import { useCloseOnScrollClip } from "./popover-scroll-close";

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

	// an eager menu can be open before hydration, its toggle event long gone
	React.useEffect(() => {
		if (popoverRef.current?.matches(":popover-open")) setOpen(true);
	}, []);

	useCloseOnScrollClip(open, popoverRef, () =>
		popoverRef.current?.hidePopover(),
	);

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
		const direction =
			event.key === "ArrowDown"
				? ("next" as const)
				: event.key === "ArrowUp"
					? ("previous" as const)
					: event.key === "Home"
						? ("first" as const)
						: event.key === "End"
							? ("last" as const)
							: null;
		if (!direction) return;
		event.preventDefault();
		focusItem(popoverRef.current, direction);
	};

	return (
		<>
			<span
				className={styles.triggerContainer}
				style={{ "--menu-anchor": anchorName } as React.CSSProperties}
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

function focusItem(
	popover: HTMLElement | null,
	target: "first" | "last" | "next" | "previous",
) {
	const elements = [
		...(popover?.querySelectorAll<HTMLElement>(
			'[role="menuitem"]:not([aria-disabled="true"])',
		) ?? []),
	];
	if (elements.length === 0) return;

	const activeIndex = elements.indexOf(document.activeElement as HTMLElement);
	const targetIndex =
		target === "first"
			? 0
			: target === "last"
				? elements.length - 1
				: target === "next"
					? (activeIndex + 1) % elements.length
					: (activeIndex - 1 + elements.length) % elements.length;

	elements[targetIndex].focus();
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
