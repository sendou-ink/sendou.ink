import { useLoaderData } from "react-router";
import type { loader } from "./loaders/index.server";

/** The front page loader data of the regular front page, the one shown when the feed isn't. */
export function useFrontPageData() {
	const data = useLoaderData<typeof loader>();
	if (data.feed) {
		throw new Error("Front page data used while the feed is shown");
	}

	return data;
}
