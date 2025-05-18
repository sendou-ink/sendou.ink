import clsx from "clsx";

export function Divider({
	children,
	className,
	smallText,
}: {
	children?: React.ReactNode;
	className?: string;
	smallText?: boolean;
}) {
	return (
		<div className={clsx("divider", className, { "text-sm": smallText })}>
			{children}
		</div>
	);
}
