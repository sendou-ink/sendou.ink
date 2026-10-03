import clsx from "clsx";
import { Search as SearchIcon } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import type { MetaFunction } from "react-router";
import { Link, useLoaderData } from "react-router";
import { BackLink } from "~/components/BackLink";
import { CircleBackdrop } from "~/components/CircleBackdrop";
import { EmptyState } from "~/components/EmptyState";
import { Image, SpecialWeaponImage, SubWeaponImage } from "~/components/Image";
import { Input } from "~/components/Input";
import { Main } from "~/components/Main";
import { WeaponPoolBanner } from "~/components/WeaponPoolBanner";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { filterWeapon } from "~/modules/in-game-lists/utils";
import {
	weaponCategories,
	weaponIdToArrayWithAlts,
	weaponIdToBaseWeaponId,
} from "~/modules/in-game-lists/weapon-ids";
import { useSearchParam } from "~/modules/search-params/hooks";
import * as SearchParams from "~/modules/search-params/search-params";
import { metaTags, ogPageImage, type SerializeFrom } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import {
	BUILDS_PAGE,
	mainWeaponImageUrl,
	mySlugify,
	navIconUrl,
	weaponBuildPage,
	weaponCategoryUrl,
} from "~/utils/urls";
import { buildsIndexSearchParams } from "../builds-search-params";
import { loader } from "../loaders/builds.server";

import styles from "./builds.module.css";

export { loader };

export const shouldRevalidate = SearchParams.skipSearchOnlyRevalidation;

const DEFAULT_CATEGORY = weaponCategories[0].name;

type BuildsWeapon = SerializeFrom<typeof loader>["weapons"][number];

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
	const { t } = useTranslation(["common", "weapons"]);
	const data = useLoaderData<typeof loader>();
	const [selectedCategory] = useSearchParam(
		buildsIndexSearchParams,
		"category",
	);
	const [searchTerm, setSearchTerm] = React.useState("");

	const isSearching = searchTerm.trim().length > 0;
	const category = selectedCategory ?? DEFAULT_CATEGORY;
	const isPickingCategory = !isSearching && !selectedCategory;

	const matchesSearch = (weaponId: MainWeaponId) =>
		weaponIdToArrayWithAlts(weaponId).some((id) =>
			filterWeapon({
				weapon: { type: "MAIN", id },
				weaponName: t(`weapons:MAIN_${id}`),
				searchTerm: searchTerm.trim(),
			}),
		);

	const weaponsById = new Map(
		data.weapons.map((weapon) => [weapon.id, weapon]),
	);
	const shownWeapons = weaponCategories
		.filter((c) => isSearching || c.name === category)
		.flatMap((c) => c.weaponIds)
		.filter((weaponId) => !isSearching || matchesSearch(weaponId))
		.flatMap((weaponId) => weaponsById.get(weaponId) ?? []);

	return (
		<Main bigger>
			<div className={styles.container}>
				<div
					className={clsx(styles.layout, {
						[styles.pickingCategory]: isPickingCategory,
					})}
				>
					<Input
						className={styles.search}
						icon={<SearchIcon />}
						value={searchTerm}
						onChange={(e) => setSearchTerm(e.target.value)}
						placeholder={t("common:forms.weaponSearch.search.placeholder")}
						aria-label={t("common:forms.weaponSearch.search.placeholder")}
					/>
					{selectedCategory && !isSearching ? (
						<div className={styles.categoryHeader}>
							<h2 className={styles.categoryHeaderTitle}>
								<Image
									path={weaponCategoryUrl(selectedCategory)}
									size={28}
									alt=""
								/>
								{t(`common:weapon.category.${selectedCategory}`)}
							</h2>
							<BackLink
								to={buildsIndexSearchParams.href(BUILDS_PAGE, {
									category: null,
								})}
								replace
								defaultShouldRevalidate={false}
							>
								{t("common:actions.back")}
							</BackLink>
						</div>
					) : null}
					<div className={styles.weapons}>
						{shownWeapons.length === 0 ? (
							<div className={styles.noResults}>
								<EmptyState navItem="builds">
									{t("common:noResults")}
								</EmptyState>
							</div>
						) : (
							groupByFamily(shownWeapons).map((family) => (
								<div key={family[0].id} className={styles.family}>
									{family.map((weapon) => (
										<WeaponRow key={weapon.id} weapon={weapon} />
									))}
								</div>
							))
						)}
					</div>
					<nav className={styles.categories}>
						{weaponCategories.map((weaponCategory) => {
							const isActive = !isSearching && weaponCategory.name === category;

							return (
								<Link
									key={weaponCategory.name}
									to={buildsIndexSearchParams.href(BUILDS_PAGE, {
										category: weaponCategory.name,
									})}
									defaultShouldRevalidate={false}
									className={clsx(styles.category, {
										[styles.categoryActive]: isActive,
									})}
									aria-current={isActive ? "true" : undefined}
									onClick={() => setSearchTerm("")}
								>
									<Image
										path={weaponCategoryUrl(weaponCategory.name)}
										size={32}
										alt=""
									/>
									{t(`common:weapon.category.${weaponCategory.name}`)}
								</Link>
							);
						})}
					</nav>
					{data.weaponPoolIds.length > 0 ? (
						<div className={styles.weaponPool}>
							<WeaponPoolBanner
								weaponIds={data.weaponPoolIds}
								weaponHref={(weaponId) =>
									weaponBuildPage(
										mySlugify(t(`weapons:MAIN_${weaponId}`, { lng: "en" })),
									)
								}
							/>
						</div>
					) : null}
				</div>
			</div>
		</Main>
	);
}

function WeaponRow({ weapon }: { weapon: BuildsWeapon }) {
	const { t } = useTranslation(["weapons", "builds"]);

	return (
		<Link
			to={weaponBuildPage(
				mySlugify(t(`weapons:MAIN_${weapon.id}`, { lng: "en" })),
			)}
			className={styles.weapon}
			data-testid={`weapon-${weapon.id}-link`}
		>
			<CircleBackdrop className={styles.weaponImageBackdrop}>
				<Image path={mainWeaponImageUrl(weapon.id)} size={46} alt="" />
			</CircleBackdrop>
			<span className={styles.weaponInfo}>
				<span>{t(`weapons:MAIN_${weapon.id}`)}</span>
				<span className={styles.weaponDetails}>
					<SubWeaponImage subWeaponId={weapon.subWeaponId} size={20} />
					<SpecialWeaponImage
						specialWeaponId={weapon.specialWeaponId}
						size={20}
					/>
					<span className={styles.buildCount}>
						{t("builds:weaponBuildCount", { count: weapon.buildCount })}
					</span>
				</span>
			</span>
		</Link>
	);
}

function groupByFamily(weapons: BuildsWeapon[]) {
	const families: BuildsWeapon[][] = [];

	for (const weapon of weapons) {
		const previousFamily = families.at(-1);
		if (
			previousFamily &&
			weaponIdToBaseWeaponId(previousFamily[0].id) ===
				weaponIdToBaseWeaponId(weapon.id)
		) {
			previousFamily.push(weapon);
		} else {
			families.push([weapon]);
		}
	}

	return families;
}
