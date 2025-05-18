import type * as React from "react";
import { useIsMounted } from "~/hooks/useIsMounted";

export function RelativeTime({
	children,
	timestamp,
}: {
	children: React.ReactNode;
	timestamp: number;
}) {
	const isMounted = useIsMounted();

	return (
		<abbr
			title={
				isMounted
					? new Date(timestamp).toLocaleString("en-US", {
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
