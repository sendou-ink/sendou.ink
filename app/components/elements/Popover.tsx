import clsx from "clsx";
import {
	Dialog,
	DialogTrigger,
	Popover,
	type PopoverProps,
} from "react-aria-components";
import styles from "./Popover.module.css";

/** Popover opened by `trigger` (a SendouButton or React Aria Button); controlled or uncontrolled. */
export function SendouPopover({
	children,
	trigger,
	popoverClassName,
	placement,
	onOpenChange,
	isOpen,
}: {
	children: React.ReactNode;
	trigger: React.ReactNode;
	popoverClassName?: string;
	placement?: PopoverProps["placement"];
	onOpenChange?: PopoverProps["onOpenChange"];
	isOpen?: boolean;
}) {
	return (
		<DialogTrigger isOpen={isOpen} onOpenChange={onOpenChange}>
			{trigger}
			<Popover
				className={clsx(styles.content, popoverClassName)}
				placement={placement}
			>
				<Dialog className={styles.dialog}>{children}</Dialog>
			</Popover>
		</DialogTrigger>
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
	return (
		<Popover
			isOpen={isOpen}
			className={styles.content}
			onOpenChange={onOpenChange}
			triggerRef={triggerRef}
		>
			<Dialog className={styles.dialog} aria-label={ariaLabel}>
				{children}
			</Dialog>
		</Popover>
	);
}
