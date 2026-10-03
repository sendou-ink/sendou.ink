import clsx from "clsx";
import { Search as SearchIcon } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { BackLink } from "~/components/BackLink";
import { CircleBackdrop } from "~/components/CircleBackdrop";
import { EmptyState } from "~/components/EmptyState";
import { Image, SpecialWeaponImage, SubWeaponImage } from "~/components/Image";
import { Input } from "~/components/Input";
import { PageHeader } from "~/components/PageHeader";
import { WeaponPoolBanner } from "~/components/WeaponPoolBanner";
import type { AnyWeapon } from "~/features/build-analyzer/analyzer-types";
import type {
	MainWeaponId,
	SpecialWeaponId,
	SubWeaponId,
} from "~/modules/in-game-lists/types";
import { filterWeapon } from "~/modules/in-game-lists/utils";
import {
	SPLAT_BOMB_ID,
	TRIZOOKA_ID,
	weaponCategories,
	weaponIdToArrayWithAlts,
	weaponIdToBaseWeaponId,
} from "~/modules/in-game-lists/weapon-ids";
import { useSearchParam } from "~/modules/search-params/hooks";
import { mainWeaponImageUrl, weaponCategoryUrl } from "~/utils/urls";
import styles from "./WeaponLanding.module.css";
import { weaponLandingSearchParams } from "./weapon-landing-search-params";

const DEFAULT_CATEGORY = weaponCategories[0].name;

type WeaponLandingCategory = NonNullable<
	ReturnType<typeof weaponLandingSearchParams.parse>["category"]
>;

type SubOrSpecialWeapon = Extract<AnyWeapon, { type: "SUB" | "SPECIAL" }>;

interface WeaponLandingWeapon {
	id: MainWeaponId;
	subWeaponId: SubWeaponId;
	specialWeaponId: SpecialWeaponId;
}

/** Weapon picker page: header, search, browse by category and quick links to the user's weapon pool. Selected category lives in the `category` search param. */
export function WeaponLanding<W extends WeaponLandingWeapon>({
	title,
	image,
	backTo,
	weapons,
	weaponPoolIds,
	weaponHref,
	categoryHref,
	weaponSuffix,
	subSpecial,
	navItem,
}: {
	title: React.ReactNode;
	image: React.ReactNode;
	/** Where the header's back link leads, on narrow screens inside a category it leads back to the category list instead */
	backTo: string;
	/** Weapons to pick from, alt skins excluded */
	weapons: W[];
	weaponPoolIds: MainWeaponId[];
	weaponHref: (weaponId: MainWeaponId) => string;
	/** Href of the current page with the `category` search param set to the given value */
	categoryHref: (category: WeaponLandingCategory | null) => string;
	/** Extra info shown after the sub & special of each weapon */
	weaponSuffix?: (weapon: W) => React.ReactNode;
	/** Sub & special weapons to pick from, each shown in a category of their own */
	subSpecial?: {
		subWeaponIds: readonly SubWeaponId[];
		specialWeaponIds: readonly SpecialWeaponId[];
		href: (weapon: SubOrSpecialWeapon) => string;
	};
	/** Nav icon of the empty state shown when the search has no results */
	navItem: string;
}) {
	const { t } = useTranslation(["common", "weapons"]);
	const [rawCategory] = useSearchParam(weaponLandingSearchParams, "category");
	const [searchTerm, setSearchTerm] = React.useState("");

	const categories: WeaponLandingCategory[] = [
		...weaponCategories.map((weaponCategory) => weaponCategory.name),
		...(subSpecial ? (["SUBS", "SPECIALS"] as const) : []),
	];
	const selectedCategory =
		rawCategory && categories.includes(rawCategory) ? rawCategory : null;

	const isSearching = searchTerm.trim().length > 0;
	const category = selectedCategory ?? DEFAULT_CATEGORY;
	const isPickingCategory = !isSearching && !selectedCategory;
	const isInCategory = !isSearching && selectedCategory !== null;

	const matchesSearch = (weapon: AnyWeapon) =>
		filterWeapon({
			weapon,
			weaponName: t(`weapons:${weapon.type}_${weapon.id}` as never),
			searchTerm: searchTerm.trim(),
		});
	const isShown = (weaponCategory: WeaponLandingCategory) =>
		isSearching || weaponCategory === category;

	const weaponsById = new Map(weapons.map((weapon) => [weapon.id, weapon]));
	const shownWeapons = weaponCategories
		.filter((c) => isShown(c.name))
		.flatMap((c) => c.weaponIds)
		.filter(
			(weaponId) =>
				!isSearching ||
				weaponIdToArrayWithAlts(weaponId).some((id) =>
					matchesSearch({ type: "MAIN", id }),
				),
		)
		.flatMap((weaponId) => weaponsById.get(weaponId) ?? []);
	const shownSubSpecialFamilies: SubOrSpecialWeapon[][] = subSpecial
		? [
				isShown("SUBS")
					? subSpecial.subWeaponIds.map((id) => ({
							type: "SUB" as const,
							id,
						}))
					: [],
				isShown("SPECIALS")
					? subSpecial.specialWeaponIds.map((id) => ({
							type: "SPECIAL" as const,
							id,
						}))
					: [],
			]
				.map((family) =>
					family.filter((weapon) => !isSearching || matchesSearch(weapon)),
				)
				.filter((family) => family.length > 0)
		: [];

	return (
		<div className={styles.container} data-testid="weapon-landing">
			<PageHeader
				image={image}
				title={title}
				back={
					isInCategory ? (
						<>
							<div className={styles.narrowOnly}>
								<BackLink
									to={categoryHref(null)}
									replace
									defaultShouldRevalidate={false}
								/>
							</div>
							<div className={styles.wideOnly}>
								<BackLink to={backTo} />
							</div>
						</>
					) : (
						<BackLink to={backTo} />
					)
				}
			/>
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
					<h2 className={styles.categoryHeader}>
						<CategoryImage category={selectedCategory} size={24} />
						<CategoryName category={selectedCategory} />
					</h2>
				) : null}
				<div className={styles.weapons}>
					{shownWeapons.length === 0 && shownSubSpecialFamilies.length === 0 ? (
						<div className={styles.noResults}>
							<EmptyState navItem={navItem}>{t("common:noResults")}</EmptyState>
						</div>
					) : (
						<>
							{groupByFamily(shownWeapons).map((family) => (
								<div key={family[0].id} className={styles.family}>
									{family.map((weapon) => (
										<WeaponRow
											key={weapon.id}
											weapon={weapon}
											href={weaponHref(weapon.id)}
											suffix={weaponSuffix?.(weapon)}
										/>
									))}
								</div>
							))}
							{subSpecial
								? shownSubSpecialFamilies.map((family) => (
										<div key={family[0].type} className={styles.family}>
											{family.map((weapon) => (
												<SubSpecialRow
													key={`${weapon.type}_${weapon.id}`}
													weapon={weapon}
													href={subSpecial.href(weapon)}
												/>
											))}
										</div>
									))
								: null}
						</>
					)}
				</div>
				<nav className={styles.categories}>
					{categories.map((weaponCategory) => {
						const isActive = !isSearching && weaponCategory === category;

						return (
							<Link
								key={weaponCategory}
								to={categoryHref(weaponCategory)}
								defaultShouldRevalidate={false}
								className={clsx(styles.category, {
									[styles.categoryActive]: isActive,
								})}
								aria-current={isActive ? "true" : undefined}
								onClick={() => setSearchTerm("")}
							>
								<CategoryImage category={weaponCategory} size={32} />
								<CategoryName category={weaponCategory} />
							</Link>
						);
					})}
				</nav>
				{weaponPoolIds.length > 0 ? (
					<div className={styles.weaponPool}>
						<WeaponPoolBanner
							weaponIds={weaponPoolIds}
							weaponHref={weaponHref}
						/>
					</div>
				) : null}
			</div>
		</div>
	);
}

function WeaponRow({
	weapon,
	href,
	suffix,
}: {
	weapon: WeaponLandingWeapon;
	href: string;
	suffix: React.ReactNode;
}) {
	const { t } = useTranslation(["weapons"]);

	return (
		<Link
			to={href}
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
					{suffix ? <span className={styles.suffix}>{suffix}</span> : null}
				</span>
			</span>
		</Link>
	);
}

function SubSpecialRow({
	weapon,
	href,
}: {
	weapon: SubOrSpecialWeapon;
	href: string;
}) {
	const { t } = useTranslation(["weapons"]);

	return (
		<Link
			to={href}
			className={styles.weapon}
			data-testid={`weapon-${weapon.type}_${weapon.id}-link`}
		>
			<CircleBackdrop
				className={clsx(
					styles.weaponImageBackdrop,
					styles.subSpecialImageBackdrop,
				)}
			>
				{weapon.type === "SUB" ? (
					<SubWeaponImage subWeaponId={weapon.id} size={46} />
				) : (
					<SpecialWeaponImage specialWeaponId={weapon.id} size={46} />
				)}
			</CircleBackdrop>
			<span className={styles.weaponInfo}>
				{t(`weapons:${weapon.type}_${weapon.id}` as never)}
			</span>
		</Link>
	);
}

function CategoryImage({
	category,
	size,
}: {
	category: WeaponLandingCategory;
	size: number;
}) {
	if (category === "SUBS") {
		return <SubWeaponImage subWeaponId={SPLAT_BOMB_ID} size={size} alt="" />;
	}

	if (category === "SPECIALS") {
		return (
			<SpecialWeaponImage specialWeaponId={TRIZOOKA_ID} size={size} alt="" />
		);
	}

	return <Image path={weaponCategoryUrl(category)} size={size} alt="" />;
}

function CategoryName({ category }: { category: WeaponLandingCategory }) {
	const { t } = useTranslation(["common"]);

	if (category === "SUBS") return t("common:weapon.category.subs");
	if (category === "SPECIALS") return t("common:weapon.category.specials");

	return t(`common:weapon.category.${category}`);
}

function groupByFamily<W extends WeaponLandingWeapon>(weapons: W[]) {
	const families: W[][] = [];

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
