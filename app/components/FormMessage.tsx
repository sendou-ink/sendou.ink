import clsx from "clsx";
import type * as React from "react";

export function FormMessage({
	children,
	type,
	className,
	spaced = true,
}: {
	children: React.ReactNode;
	type: "error" | "info";
	className?: string;
	spaced?: boolean;
}) {
	return (
		<div
			className={clsx(
				{ "info-message": type === "info", "error-message": type === "error" },
				{ "no-margin": !spaced },
				className,
			)}
		>
			{children}
		</div>
	);
}
