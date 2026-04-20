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
// xxx: check result confirm visiblity for all, needs to be obvious that they still need to report score.
// xxx: maybe also handle redirect when user answer to continue on match page is pending

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
