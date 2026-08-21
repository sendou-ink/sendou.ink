import { Outlet } from "react-router";
import { Main } from "~/components/Main";
import { SubNav, SubNavLink } from "~/components/SubNav";
import { plusSuggestionPage } from "~/features/plus-suggestions/plus-suggestions-urls";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { navIconUrl } from "~/utils/urls";

export const handle: SendouRouteHandle = {
	navItemName: "plus",
	breadcrumb: () => ({
		imgPath: navIconUrl("plus"),
		href: plusSuggestionPage(),
		type: "IMAGE",
	}),
};

export default function PlusPageLayout() {
	return (
		<Main className="stack md">
			<SubNav>
				<SubNavLink to="suggestions">Suggestions</SubNavLink>
				<SubNavLink to="voting/results">Results</SubNavLink>
				<SubNavLink to="voting">Voting</SubNavLink>
			</SubNav>
			<Outlet />
		</Main>
	);
}
