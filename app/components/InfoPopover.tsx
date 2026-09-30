import clsx from "clsx";
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
				<button
					type="button"
					className={clsx(styles.trigger, className, {
						[styles.triggerTiny]: tiny,
					})}
				>
					?
				</button>
			}
		>
			{children}
		</SendouPopover>
	);
}
