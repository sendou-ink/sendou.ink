import { useLoaderData } from "react-router";
import { Main } from "~/components/Main";
import { MatchPage } from "~/components/match-page/MatchPage";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { action } from "../actions/q.match.$id.server";
import { SendouQMatchBanner } from "../components/SendouQMatchBanner";
import { SendouQMatchHeader } from "../components/SendouQMatchHeader";
import { SendouQMatchTabs } from "../components/SendouQMatchTabs";
import { loader } from "../loaders/q.match.$id.server";

export { action, loader };

export const handle: SendouRouteHandle = {
	i18n: ["q"],
};

// xxx: translate all & check for unused translations
// xxx: "This score will end the set. Please confirm." -> "This score will end the set. Please confirm below." and up top
// xxx: check result confirm visiblity for all, needs to be obvious that they still need to report score.

export default function SendouQMatchPage() {
	const data = useLoaderData<typeof loader>();

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
