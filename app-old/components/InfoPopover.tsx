import clsx from "clsx";
import { SendouButton } from "./elements/Button";
import { SendouPopover } from "./elements/Popover";

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
