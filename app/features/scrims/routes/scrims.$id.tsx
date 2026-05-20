import { useLoaderData } from "react-router";
import { Main } from "~/components/Main";
import { MatchPage } from "~/components/match-page/MatchPage";
import { useWebsocketRevalidation } from "~/features/chat/chat-hooks";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { navIconUrl, scrimsPage } from "../../../utils/urls";
import { action } from "../actions/scrims.$id.server";
import { ScrimMatchBanner } from "../components/ScrimMatchBanner";
import { ScrimMatchHeader } from "../components/ScrimMatchHeader";
import { ScrimMatchTabs } from "../components/ScrimMatchTabs";
import { loader } from "../loaders/scrims.$id.server";

export { action, loader };

export const handle: SendouRouteHandle = {
	i18n: ["scrims", "q"],
	breadcrumb: () => ({
		imgPath: navIconUrl("scrims"),
		href: scrimsPage(),
		type: "IMAGE",
	}),
};

// xxx: Top right maps link icon maybe out of place now?
export default function ScrimPage() {
	const data = useLoaderData<typeof loader>();

	// xxx: maybe not needed since we have the chat?
	useWebsocketRevalidation(
		data.post.chatCode ?? "",
		Boolean(data.post.chatCode),
	);

	return (
		<Main>
			<MatchPage>
				<ScrimMatchHeader />
				<ScrimMatchBanner />
				<ScrimMatchTabs />
			</MatchPage>
		</Main>
	);
}
