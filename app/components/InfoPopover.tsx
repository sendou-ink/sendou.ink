import clsx from "clsx";
import { Button } from "react-aria-components";
import { SendouPopover } from "./elements/Popover";

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
					className={clsx(
						"react-aria-Button",
						"info-popover__trigger",
						className,
						{
							"info-popover__trigger__tiny": tiny,
						},
					)}
				>
					?
				</Button>
			}
		>
			{children}
		</SendouPopover>
	);
}
