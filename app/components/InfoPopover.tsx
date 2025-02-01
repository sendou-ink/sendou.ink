import clsx from "clsx";
import { SendouPopover } from "./elements/Popover";
import { SendouButton } from "./elements/Button";

export function InfoPopover({
	children,
	tiny = false,
}: { children: React.ReactNode; tiny?: boolean }) {
	return (
		<SendouPopover
			trigger={
				<SendouButton
					className={clsx("info-popover__trigger", {
						"info-popover__trigger__tiny": tiny,
					})}
				>
					?
				</SendouButton>
			}
		>
			{children}
		</SendouPopover>
	);
}
