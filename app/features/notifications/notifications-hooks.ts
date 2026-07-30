import * as React from "react";
import { useFetcher } from "react-router";
import { NOTIFICATIONS_MARK_AS_SEEN_ROUTE } from "~/utils/urls";

export function useMarkNotificationsAsSeen(unseenIds: number[]) {
	const fetcher = useFetcher();
	const submittedIdsRef = React.useRef(new Set<number>());

	const { submit } = fetcher;
	React.useEffect(() => {
		// a submit while one is in flight would abort it; ids arriving mid-flight
		// get submitted when the fetcher returns to idle
		if (fetcher.state !== "idle") return;

		const idsToSubmit = unseenIds.filter(
			(id) => !submittedIdsRef.current.has(id),
		);
		if (idsToSubmit.length === 0) return;

		for (const id of idsToSubmit) {
			submittedIdsRef.current.add(id);
		}

		submit(
			{ notificationIds: idsToSubmit },
			{
				method: "post",
				encType: "application/json",
				action: NOTIFICATIONS_MARK_AS_SEEN_ROUTE,
			},
		);
	}, [submit, unseenIds, fetcher.state]);
}
