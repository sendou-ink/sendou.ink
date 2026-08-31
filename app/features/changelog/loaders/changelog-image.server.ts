import type { LoaderFunctionArgs } from "react-router";
import { changelogSearchParams } from "../changelog-search-params";
import * as Entries from "../core/entries.server";

export const loader = ({ request }: LoaderFunctionArgs) => {
	const { since } = changelogSearchParams.parse(request);

	return {
		headSha: Entries.headSha(),
		entries: since ? Entries.entriesSince(since) : Entries.allEntries(),
	};
};
