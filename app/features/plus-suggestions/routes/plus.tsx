import { Outlet } from "react-router";
import { AddNewButton } from "~/components/AddNewButton";
import { Main } from "~/components/Main";
import { SubNav, SubNavLink } from "~/components/SubNav";
import type { SendouRouteHandle } from "~/utils/remix.server";
import {
	navIconUrl,
	plusSuggestionPage,
	plusSuggestionsNewPage,
} from "~/utils/urls";

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
		<Main className="stack md">
			<div className="stack items-end">
				<AddNewButton navIcon="plus" to={plusSuggestionsNewPage()} />
			</div>
			<SubNav>
				<SubNavLink to="suggestions">Suggestions</SubNavLink>
				<SubNavLink to="voting/results">Results</SubNavLink>
				<SubNavLink to="voting">Voting</SubNavLink>
			</SubNav>
			<Outlet />
		</Main>
	);
}
