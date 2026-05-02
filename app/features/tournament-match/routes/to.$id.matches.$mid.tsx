import { useLoaderData } from "react-router";
import { containerClassName } from "~/components/Main";
import { MatchPage } from "~/components/match-page/MatchPage";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { action } from "../actions/to.$id.matches.$mid.server";
import { TournamentMatchBanner } from "../components/TournamentMatchBanner";
import { TournamentMatchHeader } from "../components/TournamentMatchHeader";
import { TournamentMatchTabs } from "../components/TournamentMatchTabs";
import { loader } from "../loaders/to.$id.matches.$mid.server";
import { MatchPageProvider } from "../match-page-context";

export { action, loader };

export const handle: SendouRouteHandle = {
	i18n: ["q"],
};

export default function TournamentMatchPage() {
	const data = useLoaderData<typeof loader>();

	return (
		<MatchPageProvider data={data}>
			<MatchPage className={containerClassName("normal")}>
				<TournamentMatchHeader data={data} />
				<TournamentMatchBanner data={data} />
				<TournamentMatchTabs data={data} />
			</MatchPage>
		</MatchPageProvider>
	);
}
