import type { MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { Main } from "~/components/Main";
import { MatchPage } from "~/components/match-page/MatchPage";
import { useLiveRevalidation } from "~/features/chat/chat-hooks";
import { metaTags, ogPageImage, type SerializeFrom } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { navIconUrl, SENDOUQ_PAGE } from "~/utils/urls";
import { action } from "../actions/q.match.$id.server";
import { SendouQMatchBanner } from "../components/SendouQMatchBanner";
import { SendouQMatchHeader } from "../components/SendouQMatchHeader";
import { SendouQMatchTabs } from "../components/SendouQMatchTabs";
import { loader } from "../loaders/q.match.$id.server";

export { action, loader };

export const meta: MetaFunction = (args) => {
	const data = args.loaderData as SerializeFrom<typeof loader> | null;

	if (!data) return [];

	return metaTags({
		title: `SendouQ - Match #${data.match.id}`,
		description: `${new Intl.ListFormat("en-US").format(
			data.match.groupAlpha.members.map((m) => m.username),
		)} vs. ${new Intl.ListFormat("en-US").format(
			data.match.groupBravo.members.map((m) => m.username),
		)}`,
		image: ogPageImage("sendouq"),
		location: args.location,
	});
};

export const handle: SendouRouteHandle = {
	i18n: ["q", "user"],
	breadcrumb: () => ({
		imgPath: navIconUrl("sendouq"),
		href: SENDOUQ_PAGE,
		type: "IMAGE",
	}),
};

export default function SendouQMatchPage() {
	const data = useLoaderData<typeof loader>();

	// the page's updates are broadcast to its chat room, subscribed to by the chat
	// provider via the loader's chatRooms rather than by a topic of our own
	useLiveRevalidation();

	return (
		<Main>
			<MatchPage>
				<SendouQMatchHeader data={data} />
				<SendouQMatchBanner data={data} />
				<SendouQMatchTabs data={data} />
			</MatchPage>
		</Main>
	);
}
