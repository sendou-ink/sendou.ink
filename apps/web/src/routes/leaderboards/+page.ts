import { LEADERBOARDS_PAGE, navIconUrl } from "#lib/utils/urls.ts";
import type { PageLoad } from "./$types";

export const load: PageLoad = () => {
	return {
		breadcrumbs: [
			{
				type: "IMAGE" as const,
				imgPath: navIconUrl("leaderboards"),
				href: LEADERBOARDS_PAGE,
			},
		],
	};
};
