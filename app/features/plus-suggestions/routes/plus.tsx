import { Outlet } from "@remix-run/react";
import { Main } from "~/components/Main";
import { SubNav, SubNavLink } from "~/components/SubNav";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { navIconUrl, plusSuggestionPage } from "~/utils/urls";

import "~/styles/plus.css";

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
		<Main>
			<SubNav>
				<SubNavLink to="suggestions">Suggestions</SubNavLink>
				<SubNavLink to="voting/results">Results</SubNavLink>
				<SubNavLink to="voting">Voting</SubNavLink>
			</SubNav>
			<Outlet />
		</Main>
	);
}
