import { useRevalidator } from "@remix-run/react";
import * as React from "react";
import { useVisibilityChange } from "./useVisibilityChange";

const UPDATE_EVERY_N_SECONDS = 30;
const wasUpdatedRecently = (lastUpdated: number) =>
	Date.now() - lastUpdated < UPDATE_EVERY_N_SECONDS * 1000;

export function useAutoRefresh(lastUpdated: number) {
	const { revalidate } = useRevalidator();
	const visibility = useVisibilityChange();

	React.useEffect(() => {
		// when user comes back to this tab
		if (visibility === "visible" && !wasUpdatedRecently(lastUpdated)) {
			revalidate();
		}

		const interval = setInterval(() => {
			if (visibility === "hidden" || wasUpdatedRecently(lastUpdated)) return;
			revalidate();
		}, UPDATE_EVERY_N_SECONDS * 1000);

		return () => {
			clearInterval(interval);
		};
	}, [visibility, revalidate, lastUpdated]);
}
