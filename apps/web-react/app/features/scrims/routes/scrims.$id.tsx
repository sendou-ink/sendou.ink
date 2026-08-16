import { Main } from "~/components/Main";
import { MatchPage } from "~/components/match-page/MatchPage";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { navIconUrl, scrimsPage } from "../../../utils/urls";
import { action } from "../actions/scrims.$id.server";
import { ScrimMatchBanner } from "../components/ScrimMatchBanner";
import { ScrimMatchHeader } from "../components/ScrimMatchHeader";
import { ScrimMatchTabs } from "../components/ScrimMatchTabs";
import { loader } from "../loaders/scrims.$id.server";

export { action, loader };

export const handle: SendouRouteHandle = {
	i18n: ["scrims", "q", "user"],
	breadcrumb: () => ({
		imgPath: navIconUrl("scrims"),
		href: scrimsPage(),
		type: "IMAGE",
	}),
};

export default function ScrimPage() {
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
