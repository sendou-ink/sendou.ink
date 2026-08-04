import {
	Calendar,
	ChartColumnBig,
	Flame,
	FlaskConical,
	Funnel,
	Map as MapIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { BuildCard } from "~/components/BuildCard";
import { LinkButton, SendouButton } from "~/components/elements/Button";
import { SendouMenu, SendouMenuItem } from "~/components/elements/Menu";
import { Main } from "~/components/Main";
import { useSearchParamsTyped } from "~/modules/search-params/hooks";
import { metaTags, type SerializeFrom } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import {
	BUILDS_PAGE,
	navIconUrl,
	outlinedMainWeaponImageUrl,
	weaponBuildPage,
	weaponBuildPopularPage,
	weaponBuildStatsPage,
} from "~/utils/urls";
import {
	BUILDS_PAGE_BATCH_SIZE,
	BUILDS_PAGE_MAX_BUILDS,
	MAX_BUILD_FILTERS,
	RECENT_PATCHES,
} from "../builds-constants";
import { buildsSearchParams } from "../builds-search-params";
import type { AbilityBuildFilter, BuildFilter } from "../builds-types";
import { FilterSection } from "../components/FilterSection";

import { loader } from "../loaders/builds.$slug.server";

export { loader };

import styles from "./builds.$slug.module.css";

export const shouldRevalidate = buildsSearchParams.shouldRevalidate;

export const meta: MetaFunction<typeof loader> = (args) => {
	if (!args.loaderData) return [];

	return metaTags({
		title: `${args.loaderData.weaponName} builds`,
		ogTitle: `${args.loaderData.weaponName} Splatoon 3 builds`,
		description: `Collection of ${args.loaderData.weaponName} builds from the top competitive players. Find the best combination of abilities and level up your gameplay.`,
		location: args.location,
	});
};

export const handle: SendouRouteHandle = {
	i18n: ["weapons", "builds", "gear", "analyzer"],
	breadcrumb: ({ match }) => {
		const data = match.loaderData as SerializeFrom<typeof loader> | undefined;

		if (!data) return [];

		return [
			{
				imgPath: navIconUrl("builds"),
				href: BUILDS_PAGE,
				type: "IMAGE",
			},
			{
				imgPath: outlinedMainWeaponImageUrl(data.weaponId),
				href: weaponBuildPage(data.slug),
				type: "IMAGE",
			},
		];
	},
};

export function BuildCards({ data }: { data: SerializeFrom<typeof loader> }) {
	return (
		<div className={styles.buildsContainer}>
			{data.builds.map((build) => {
				return (
					<BuildCard
						key={build.id}
						build={build}
						owner={{ ...build.owner, plusTier: build.plusTier }}
						canEdit={false}
					/>
				);
			})}
		</div>
	);
}

export default function WeaponsBuildsPage() {
	const data = useLoaderData<typeof loader>();
	const { t } = useTranslation(["common", "builds"]);
	const [{ f: filters }, setParams] = useSearchParamsTyped(buildsSearchParams);

	const syncSearchParams = (
		newFilters: BuildFilter[],
		opts?: { loader?: boolean },
	) => {
		setParams({ f: newFilters }, opts);
	};

	const handleFilterAdd = (type: BuildFilter["type"]) => {
		const newFilter: BuildFilter =
			type === "ability"
				? {
						type: "ability",
						ability: "ISM",
						comparison: "AT_LEAST",
						value: 0,
					}
				: type === "date"
					? {
							type: "date",
							date: RECENT_PATCHES[0].date,
						}
					: {
							type: "mode",
							mode: "SZ",
						};

		// a fresh "at least 0" ability filter matches every build, so no need to refetch
		syncSearchParams(
			[...filters, newFilter],
			type === "ability" ? { loader: false } : undefined,
		);
	};

	const handleFilterChange = (i: number, newFilter: Partial<BuildFilter>) => {
		const newFilters = filters.map((f, index) =>
			index === i
				? ({
						...(f as AbilityBuildFilter),
						...(newFilter as AbilityBuildFilter),
					} as BuildFilter)
				: f,
		);

		syncSearchParams(newFilters);
	};

	const handleFilterDelete = (i: number) => {
		syncSearchParams(filters.filter((_, index) => index !== i));
	};

	const loadMoreLink = () =>
		buildsSearchParams.href("", {
			limit: data.limit + BUILDS_PAGE_BATCH_SIZE,
			f: filters,
		});

	const nthOfSameFilter = (index: number) => {
		const type = filters[index].type;

		return filters.slice(0, index).filter((f) => f.type === type).length + 1;
	};

	return (
		<Main className="stack lg">
			<div className={styles.buildsButtons}>
				<SendouMenu
					trigger={
						<SendouButton
							variant="outlined"
							size="small"
							icon={<Funnel />}
							isDisabled={filters.length >= MAX_BUILD_FILTERS}
							data-testid="add-filter-button"
						>
							{t("builds:addFilter")}
						</SendouButton>
					}
				>
					<SendouMenuItem
						icon={<FlaskConical />}
						isDisabled={filters.length >= MAX_BUILD_FILTERS}
						onAction={() => handleFilterAdd("ability")}
						data-testid="menu-item-ability"
					>
						{t("builds:filters.type.ability")}
					</SendouMenuItem>
					<SendouMenuItem
						icon={<MapIcon />}
						onAction={() => handleFilterAdd("mode")}
						data-testid="menu-item-mode"
					>
						{t("builds:filters.type.mode")}
					</SendouMenuItem>
					<SendouMenuItem
						icon={<Calendar />}
						isDisabled={filters.some((filter) => filter.type === "date")}
						onAction={() => handleFilterAdd("date")}
						data-testid="menu-item-date"
					>
						{t("builds:filters.type.date")}
					</SendouMenuItem>
				</SendouMenu>
				<div className={styles.buildsButtonsLink}>
					<LinkButton
						to={weaponBuildStatsPage(data.slug)}
						variant="outlined"
						icon={<ChartColumnBig />}
						size="small"
					>
						{t("builds:linkButton.abilityStats")}
					</LinkButton>
					<LinkButton
						to={weaponBuildPopularPage(data.slug)}
						variant="outlined"
						icon={<Flame />}
						size="small"
					>
						{t("builds:linkButton.popularBuilds")}
					</LinkButton>
				</div>
			</div>
			{filters.length > 0 ? (
				<div className="stack md">
					{filters.map((filter, i) => (
						<FilterSection
							key={i}
							number={i + 1}
							filter={filter}
							onChange={(newFilter) => handleFilterChange(i, newFilter)}
							remove={() => handleFilterDelete(i)}
							nthOfSame={nthOfSameFilter(i)}
						/>
					))}
				</div>
			) : null}
			<BuildCards data={data} />
			{data.limit < BUILDS_PAGE_MAX_BUILDS && data.hasMoreBuilds ? (
				<LinkButton
					className="m-0-auto"
					size="small"
					to={loadMoreLink()}
					preventScrollReset
				>
					{t("common:actions.loadMore")}
				</LinkButton>
			) : null}
		</Main>
	);
}
