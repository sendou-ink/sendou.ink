import clsx from "clsx";
import type * as React from "react";

export function FormMessage({
	children,
	type,
	className,
}: {
	children: React.ReactNode;
	type: "error" | "info";
	className?: string;
}) {
	return (
		<div
			className={clsx(
				{ "info-message": type === "info", "error-message": type === "error" },
				className,
			)}
		>
			{children}
		</div>
	);
}
