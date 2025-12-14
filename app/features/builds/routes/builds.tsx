import type { MetaFunction } from "@remix-run/node";
import { Link } from "@remix-run/react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { AddNewButton } from "~/components/AddNewButton";
import { Image } from "~/components/Image";
import { Main } from "~/components/Main";
import { useUser } from "~/features/auth/core/user";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import {
	weaponCategories,
	weaponIdToType,
} from "~/modules/in-game-lists/weapon-ids";
import type { SendouRouteHandle } from "~/utils/remix.server";
import {
	BUILDS_PAGE,
	mainWeaponImageUrl,
	mySlugify,
	navIconUrl,
	userNewBuildPage,
	weaponBuildPage,
	weaponCategoryUrl,
} from "~/utils/urls";
import { metaTags } from "../../../utils/remix";

import styles from "./builds.module.css";

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
	const user = useUser();
	const { t } = useTranslation(["common", "weapons"]);

	const weaponIdToSlug = (weaponId: MainWeaponId) => {
		return mySlugify(t(`weapons:MAIN_${weaponId}`, { lng: "en" }));
	};

	return (
		<Main className="stack md">
			{user ? (
				<div className="stack items-end">
					<AddNewButton navIcon="builds" to={userNewBuildPage(user)} />
				</div>
			) : null}
			{weaponCategories.map((category) => (
				<div key={category.name} className={styles.category}>
					<div className={styles.categoryHeader}>
						<Image
							path={weaponCategoryUrl(category.name)}
							width={40}
							height={40}
							alt={t(`common:weapon.category.${category.name}`)}
						/>
						{t(`common:weapon.category.${category.name}`)}
					</div>
					<div className={styles.categoryWeapons}>
						{(category.weaponIds as readonly MainWeaponId[])
							.filter((weaponId) => weaponIdToType(weaponId) !== "ALT_SKIN")
							.map((weaponId, i) => (
								<React.Fragment key={weaponId}>
									{i !== 0 && weaponId % 10 === 0 ? (
										<WeaponFamilyDivider />
									) : null}
									<Link
										key={weaponId}
										to={weaponBuildPage(weaponIdToSlug(weaponId))}
										className={styles.categoryWeapon}
										data-testid={`weapon-${weaponId}-link`}
									>
										<Image
											className={styles.categoryWeaponImg}
											path={mainWeaponImageUrl(weaponId)}
											width={28}
											height={28}
											alt={t(`weapons:MAIN_${weaponId}`)}
										/>
										{t(`weapons:MAIN_${weaponId}`)}
									</Link>
								</React.Fragment>
							))}
					</div>
				</div>
			))}
		</Main>
	);
}

function WeaponFamilyDivider() {
	return <div className={styles.divider} />;
}
