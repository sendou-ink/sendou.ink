import type { LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as FeedPage from "../core/FeedPage.server";
import { feedSearchParams } from "../feed-search-params";
import { isFeedTester } from "../feed-utils";

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const user = requireUser();
	const { viewAs } = feedSearchParams.parse(request);

	return FeedPage.load({
		viewerId: viewAs && isFeedTester(user) ? viewAs : user.id,
		userId: user.id,
		mode: "TEST",
	});
};
