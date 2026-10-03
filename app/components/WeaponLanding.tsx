import clsx from "clsx";
import { Search as SearchIcon } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router";
import { BackLink } from "~/components/BackLink";
import { CircleBackdrop } from "~/components/CircleBackdrop";
import { EmptyState } from "~/components/EmptyState";
import { Image, SpecialWeaponImage, SubWeaponImage } from "~/components/Image";
import { Input } from "~/components/Input";
import { PageHeader } from "~/components/PageHeader";
import { WeaponPoolBanner } from "~/components/WeaponPoolBanner";
import type { AnyWeapon } from "~/features/build-analyzer/analyzer-types";
import { DESKTOP_LAYOUT_QUERY } from "~/hooks/useLayoutSize";
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
import {
	mainWeaponImageUrl,
	navIconUrl,
	weaponCategoryUrl,
} from "~/utils/urls";
import styles from "./WeaponLanding.module.css";
import { weaponLandingSearchParams } from "./weapon-landing-search-params";

const DEFAULT_CATEGORY = weaponCategories[0].name;

type WeaponLandingCategory = NonNullable<
	ReturnType<typeof weaponLandingSearchParams.parse>["category"]
>;

type SubOrSpecialWeapon = Extract<AnyWeapon, { type: "SUB" | "SPECIAL" }>;

/** Location state accepted by the weapon landing (e.g. from a weapon page's back link). */
export interface WeaponLandingState {
	/** If set, the search is focused on load on desktop. */
	focusSearch?: boolean;
}

interface WeaponLandingWeapon {
	id: MainWeaponId;
	subWeaponId: SubWeaponId;
	specialWeaponId: SpecialWeaponId;
}

/** Weapon picker page: header, search, browse by category and quick links to the user's weapon pool. Selected category lives in the `category` search param. */
export function WeaponLanding<W extends WeaponLandingWeapon>({
	title,
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
	/** Nav icon of the page, shown in the header and the empty state of a search with no results */
	navItem: string;
}) {
	const { t } = useTranslation(["common", "weapons"]);
	const [rawCategory] = useSearchParam(weaponLandingSearchParams, "category");
	const [searchTerm, setSearchTerm] = React.useState("");
	const searchInputRef = React.useRef<HTMLInputElement>(null);
	useFocusSearchOnReturn(searchInputRef);

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

	const pageImage = (
		<CircleBackdrop>
			<Image path={navIconUrl(navItem)} size={36} alt="" />
		</CircleBackdrop>
	);

	return (
		<div className={styles.container} data-testid="weapon-landing">
			{isInCategory ? (
				<>
					<div className={styles.narrowOnly}>
						<PageHeader
							image={
								<CircleBackdrop
									className={clsx({
										[styles.subSpecialImageBackdrop]:
											selectedCategory === "SUBS" ||
											selectedCategory === "SPECIALS",
									})}
								>
									<CategoryImage category={selectedCategory} size={36} />
								</CircleBackdrop>
							}
							title={<CategoryName category={selectedCategory} />}
							subtitle={
								<>
									<Image path={navIconUrl(navItem)} size={16} alt="" />
									{title}
								</>
							}
							back={
								<BackLink
									to={categoryHref(null)}
									replace
									defaultShouldRevalidate={false}
								/>
							}
						/>
					</div>
					<div className={styles.wideOnly}>
						<PageHeader
							image={pageImage}
							title={title}
							back={<BackLink to={backTo} />}
						/>
					</div>
				</>
			) : (
				<PageHeader
					image={pageImage}
					title={title}
					back={<BackLink to={backTo} />}
				/>
			)}
			<div
				className={clsx(styles.layout, {
					[styles.pickingCategory]: isPickingCategory,
					[styles.inCategory]: isInCategory,
				})}
			>
				<Input
					ref={searchInputRef}
					className={styles.search}
					icon={<SearchIcon />}
					value={searchTerm}
					onChange={(e) => setSearchTerm(e.target.value)}
					placeholder={t("common:forms.weaponSearch.search.placeholder")}
					aria-label={t("common:forms.weaponSearch.search.placeholder")}
				/>
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

/** Returning from a weapon page on desktop lets the user search for the next weapon right away. */
function useFocusSearchOnReturn(ref: React.RefObject<HTMLInputElement | null>) {
	const location = useLocation();
	const focusSearch = (location.state as WeaponLandingState | null)
		?.focusSearch;

	React.useEffect(() => {
		if (!focusSearch || !window.matchMedia(DESKTOP_LAYOUT_QUERY).matches) {
			return;
		}

		ref.current?.focus();
	}, [focusSearch, ref]);
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
