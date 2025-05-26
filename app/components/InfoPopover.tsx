import clsx from "clsx";
import { Button } from "react-aria-components";
import { SendouPopover } from "./elements/Popover";

export function InfoPopover({
	children,
	tiny = false,
}: { children: React.ReactNode; tiny?: boolean }) {
	return (
		<SendouPopover
			trigger={
				<Button
					className={clsx("react-aria-Button", "info-popover__trigger", {
						"info-popover__trigger__tiny": tiny,
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
