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
}: {
	children: React.ReactNode;
	trigger: React.ReactNode;
	popoverClassName?: string;
	placement?: PopoverProps["placement"];
}) {
	return (
		<DialogTrigger>
			{trigger}
			<Popover
				className={clsx("sendou-popover-content", popoverClassName)}
				placement={placement}
			>
				<Dialog>{children}</Dialog>
			</Popover>
		</DialogTrigger>
	);
}
