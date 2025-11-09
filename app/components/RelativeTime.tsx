import type * as React from "react";
import { useIsMounted } from "~/hooks/useIsMounted";
import { useTimeFormat } from "~/hooks/useTimeFormat";

export function RelativeTime({
	children,
	timestamp,
}: {
	children: React.ReactNode;
	timestamp: number;
}) {
	const isMounted = useIsMounted();
	const { formatDateTime } = useTimeFormat();

	return (
		<abbr
			title={
				isMounted
					? formatDateTime(new Date(timestamp), {
							hour: "numeric",
							minute: "numeric",
							day: "numeric",
							month: "long",
							timeZoneName: "short",
						})
					: undefined
			}
		>
			{children}
		</abbr>
	);
}
