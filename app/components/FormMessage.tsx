import clsx from "clsx";
import type * as React from "react";

export function FormMessage({
	children,
	type,
	className,
	spaced = true,
	id,
}: {
	children: React.ReactNode;
	type: "error" | "info";
	className?: string;
	spaced?: boolean;
	id?: string;
}) {
	return (
		<div
			id={id}
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
