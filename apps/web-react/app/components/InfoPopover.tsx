import clsx from "clsx";
import { Button } from "react-aria-components";
import { SendouPopover } from "./elements/Popover";
import styles from "./InfoPopover.module.css";

export function InfoPopover({
	children,
	tiny = false,
	className,
}: {
	children: React.ReactNode;
	tiny?: boolean;
	className?: string;
}) {
	return (
		<SendouPopover
			trigger={
				<Button
					className={clsx(styles.trigger, className, {
						[styles.triggerTiny]: tiny,
					})}
				>
					?
				</Button>
			}
		>
			{children}
		</SendouPopover>
	);
}
