import clsx from "clsx";
import type * as React from "react";

export function Details({
	children,
	className,
}: {
	children: React.ReactNode;
	className?: string;
}) {
	return <details className={className}>{children}</details>;
}

export function Summary({
	children,
	className,
}: {
	children: React.ReactNode;
	className?: string;
}) {
	return <summary className={clsx("summary", className)}>{children}</summary>;
}
