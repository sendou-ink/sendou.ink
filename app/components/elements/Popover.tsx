import clsx from "clsx";
import { Dialog, DialogTrigger, Popover } from "react-aria-components";

export function SendouPopover({
	children,
	trigger,
	popoverClassName,
}: {
	children: React.ReactNode;
	trigger: React.ReactNode;
	popoverClassName?: string;
}) {
	return (
		<DialogTrigger>
			{trigger}
			<Popover className={clsx("popover-content", popoverClassName)}>
				<Dialog>{children}</Dialog>
			</Popover>
		</DialogTrigger>
	);
}
