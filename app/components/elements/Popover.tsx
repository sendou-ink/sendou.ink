import clsx from "clsx";
import {
	Dialog,
	DialogTrigger,
	Popover,
	type PopoverProps,
} from "react-aria-components";
import styles from "./Popover.module.css";

/**
 * A reusable popover component that wraps around a trigger element (SendouButton or Button from React Aria Components library).
 * Supports controlled and uncontrolled open states.
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
}: {
	children: React.ReactNode;
	trigger: React.ReactNode;
	popoverClassName?: string;
	placement?: PopoverProps["placement"];
	onOpenChange?: PopoverProps["onOpenChange"];
	isOpen?: boolean;
}) {
	return (
		<DialogTrigger isOpen={isOpen}>
			{trigger}
			<Popover
				className={clsx(styles.content, popoverClassName)}
				placement={placement}
				onOpenChange={onOpenChange}
			>
				<Dialog className={styles.dialog}>{children}</Dialog>
			</Popover>
		</DialogTrigger>
	);
}
