import type { MetaFunction } from "@remix-run/node";
import { Link } from "@remix-run/react";
import { useTranslation } from "react-i18next";
import { Image } from "~/components/Image";
import { Main } from "~/components/Main";
import type { MainWeaponId } from "~/modules/in-game-lists";
import { weaponCategories, weaponIdIsNotAlt } from "~/modules/in-game-lists";
import type { SendouRouteHandle } from "~/utils/remix.server";
import {
	BUILDS_PAGE,
	mainWeaponImageUrl,
	mySlugify,
	navIconUrl,
	weaponBuildPage,
	weaponCategoryUrl,
} from "~/utils/urls";
import { metaTags } from "../../../utils/remix";

import "~/styles/builds.css";

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "Builds",
		ogTitle: "Splatoon 3 builds for all weapons",
		description:
			"View Splatoon 3 builds for all weapons by the best players. Includes collection of user submitted builds and an aggregation of ability stats.",
		location: args.location,
	});
};

export const handle: SendouRouteHandle = {
	i18n: "weapons",
	breadcrumb: () => ({
		imgPath: navIconUrl("builds"),
		href: BUILDS_PAGE,
		type: "IMAGE",
	}),
};

export default function BuildsPage() {
	const { t } = useTranslation(["common", "weapons"]);

	const weaponIdToSlug = (weaponId: MainWeaponId) => {
		return mySlugify(t(`weapons:MAIN_${weaponId}`, { lng: "en" }));
	};

	return (
		<Main className="stack md">
			{weaponCategories.map((category) => (
				<div key={category.name} className="builds__category">
					<div className="builds__category__header">
						<Image
							path={weaponCategoryUrl(category.name)}
							width={40}
							height={40}
							alt={t(`common:weapon.category.${category.name}`)}
						/>
						{t(`common:weapon.category.${category.name}`)}
					</div>
					<div className="builds__category__weapons">
						{(category.weaponIds as readonly MainWeaponId[])
							.filter(weaponIdIsNotAlt)
							.sort((a, b) =>
								t(`weapons:MAIN_${a}`).localeCompare(t(`weapons:MAIN_${b}`)),
							)
							.map((weaponId) => (
								<Link
									key={weaponId}
									to={weaponBuildPage(weaponIdToSlug(weaponId))}
									className="builds__category__weapon"
									data-testid={`weapon-${weaponId}-link`}
								>
									<Image
										className="builds__category__weapon__img"
										path={mainWeaponImageUrl(weaponId)}
										width={28}
										height={28}
										alt={t(`weapons:MAIN_${weaponId}`)}
									/>
									{t(`weapons:MAIN_${weaponId}`)}
								</Link>
							))}
					</div>
				</div>
			))}
		</Main>
	);
}
