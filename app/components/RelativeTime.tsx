import type * as React from "react";
import { useHydrated } from "~/hooks/useHydrated";
import { useTimeFormat } from "~/hooks/useTimeFormat";

export function RelativeTime({
	children,
	timestamp,
}: {
	children: React.ReactNode;
	timestamp: number;
}) {
	const isHydrated = useHydrated();
	const { formatDateTime } = useTimeFormat();

	return (
		<abbr
			title={
				isHydrated
					? formatDateTime(new Date(timestamp), {
							hour: "numeric",
							minute: "numeric",
							day: "numeric",
							month: "numeric",
							timeZoneName: "short",
						})
					: undefined
			}
		>
			{children}
		</abbr>
	);
}
