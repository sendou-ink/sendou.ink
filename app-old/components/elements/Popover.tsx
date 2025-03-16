import clsx from "clsx";
import {
	Dialog,
	DialogTrigger,
	Popover,
	type PopoverProps,
} from "react-aria-components";

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
				className={clsx("sendou-popover-content", popoverClassName)}
				placement={placement}
				onOpenChange={onOpenChange}
			>
				<Dialog>{children}</Dialog>
			</Popover>
		</DialogTrigger>
	);
}
