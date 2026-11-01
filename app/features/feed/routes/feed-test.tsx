import * as React from "react";
import { useLoaderData } from "react-router";
import { SendouSwitch } from "~/components/elements/Switch";
import { Main } from "~/components/Main";
import { useUser } from "~/features/auth/core/user";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { Feed } from "../components/Feed";
import { feedSearchParams } from "../feed-search-params";
import { isFeedTester } from "../feed-utils";
import { loader } from "../loaders/feed-test.server";

export { loader };

export const handle: SendouRouteHandle = {
	i18n: ["art", "builds", "gear", "trophies"],
};

export const shouldRevalidate = feedSearchParams.shouldRevalidate;

export default function FeedTestPage() {
	const data = useLoaderData<typeof loader>();
	const [showRankingMath, setShowRankingMath] = React.useState(false);
	const user = useUser();

	return (
		<Main bigger>
			<Feed
				data={data}
				canViewAs={isFeedTester(user)}
				scoreShown={showRankingMath}
				headerEnd={
					<SendouSwitch
						isSelected={showRankingMath}
						onChange={setShowRankingMath}
						size="small"
					>
						Show ranking math
					</SendouSwitch>
				}
				footer={
					<p className="text-xs text-lighter">
						Dev test page: every item type with matching rows in the database,
						seen as {data.viewer.username} with {data.friendCount} friends,
						falling back to anyone's rows when there are none for them. Times
						are relative to shortly after the latest SendouQ match. For
						production data run the dev server with DB_PATH=db-sandbox.sqlite3
						and VITE_PROD_MODE=true.
					</p>
				}
			/>
		</Main>
	);
}
