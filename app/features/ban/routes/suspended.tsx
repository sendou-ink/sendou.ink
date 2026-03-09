import { useLoaderData } from "react-router";
import { Main } from "~/components/Main";
import { useTimeFormat } from "~/hooks/useTimeFormat";
import { databaseTimestampToDate } from "~/utils/dates";

import { loader } from "../loaders/suspended.server";
export { loader };

export default function SuspendedPage() {
	const data = useLoaderData<typeof loader>();
	const { formatDateTime } = useTimeFormat();

	const ends = (() => {
		if (!data.banned || data.banned === 1) return null;

		return databaseTimestampToDate(data.banned);
	})();

	return (
		<Main>
			<h2>Account suspended</h2>
			{data.reason ? <div>Reason: {data.reason}</div> : null}
			{ends ? (
				<div suppressHydrationWarning>
					Ends:{" "}
					{formatDateTime(ends, {
						month: "long",
						day: "numeric",
						year: "numeric",
						hour: "numeric",
						minute: "numeric",
					})}
				</div>
			) : (
				<div>
					Ends: <i>no end time set</i>
				</div>
			)}
		</Main>
	);
}
