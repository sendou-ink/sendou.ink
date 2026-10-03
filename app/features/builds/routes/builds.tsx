import { useTranslation } from "react-i18next";
import type { MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { CircleBackdrop } from "~/components/CircleBackdrop";
import { Image } from "~/components/Image";
import { Main } from "~/components/Main";
import { WeaponLanding } from "~/components/WeaponLanding";
import { weaponLandingSearchParams } from "~/components/weapon-landing-search-params";
import * as SearchParams from "~/modules/search-params/search-params";
import { metaTags, ogPageImage } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import {
	BUILDS_PAGE,
	mySlugify,
	navIconUrl,
	weaponBuildPage,
} from "~/utils/urls";
import { loader } from "../loaders/builds.server";

export { loader };

export const shouldRevalidate = SearchParams.skipSearchOnlyRevalidation;

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "Builds",
		ogTitle: "Splatoon 3 builds for all weapons",
		description:
			"View Splatoon 3 builds for all weapons by the best players. Includes collection of user submitted builds and an aggregation of ability stats.",
		image: ogPageImage("builds"),
		location: args.location,
	});
};

export const handle: SendouRouteHandle = {
	i18n: ["weapons", "builds"],
	breadcrumb: () => ({
		imgPath: navIconUrl("builds"),
		href: BUILDS_PAGE,
		type: "IMAGE",
	}),
};

export default function BuildsPage() {
	const { t } = useTranslation(["common", "weapons", "builds"]);
	const data = useLoaderData<typeof loader>();

	return (
		<Main bigger>
			<WeaponLanding
				image={
					<CircleBackdrop>
						<Image path={navIconUrl("builds")} size={36} alt="" />
					</CircleBackdrop>
				}
				title={t("common:pages.builds")}
				backTo="/"
				weapons={data.weapons}
				weaponPoolIds={data.weaponPoolIds}
				weaponHref={(weaponId) =>
					weaponBuildPage(
						mySlugify(t(`weapons:MAIN_${weaponId}`, { lng: "en" })),
					)
				}
				categoryHref={(category) =>
					weaponLandingSearchParams.href(BUILDS_PAGE, { category })
				}
				weaponSuffix={(weapon) =>
					t("builds:weaponBuildCount", { count: weapon.buildCount })
				}
				navItem="builds"
			/>
		</Main>
	);
}
