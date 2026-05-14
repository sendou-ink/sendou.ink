import type * as React from "react";
import { useDateTimeFormat } from "~/hooks/intl/useDateTimeFormat";

export function RelativeTime({
	children,
	timestamp,
}: {
	children: React.ReactNode;
	timestamp: number;
}) {
	const { formatter } = useDateTimeFormat({
		hour: "numeric",
		minute: "numeric",
		day: "numeric",
		month: "numeric",
		timeZoneName: "short",
	});

	return (
		<abbr title={formatter.format(timestamp) ?? undefined}>{children}</abbr>
	);
}
