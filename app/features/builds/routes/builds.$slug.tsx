import type { MetaFunction, SerializeFrom } from "@remix-run/node";
import {
	type ShouldRevalidateFunction,
	useLoaderData,
	useSearchParams,
} from "@remix-run/react";
import clone from "just-clone";
import { nanoid } from "nanoid";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { BuildCard } from "~/components/BuildCard";
import { Button, LinkButton } from "~/components/Button";
import { Main } from "~/components/Main";
import { Menu } from "~/components/Menu";
import { BeakerFilledIcon } from "~/components/icons/BeakerFilled";
import { CalendarIcon } from "~/components/icons/Calendar";
import { ChartBarIcon } from "~/components/icons/ChartBar";
import { FilterIcon } from "~/components/icons/Filter";
import { FireIcon } from "~/components/icons/Fire";
import { MapIcon } from "~/components/icons/Map";
import {
	BUILDS_PAGE_BATCH_SIZE,
	BUILDS_PAGE_MAX_BUILDS,
	PATCHES,
} from "~/constants";
import { safeJSONParse } from "~/utils/json";
import { isRevalidation } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import type { Unpacked } from "~/utils/types";
import {
	BUILDS_PAGE,
	navIconUrl,
	outlinedMainWeaponImageUrl,
	weaponBuildPage,
	weaponBuildPopularPage,
	weaponBuildStatsPage,
} from "~/utils/urls";
import {
	FILTER_SEARCH_PARAM_KEY,
	MAX_BUILD_FILTERS,
} from "../builds-constants";
import type { BuildFiltersFromSearchParams } from "../builds-schemas.server";
import type { AbilityBuildFilter, BuildFilter } from "../builds-types";
import { FilterSection } from "../components/FilterSection";

import { loader } from "../loaders/builds.$slug.server";
export { loader };

const filterOutMeaninglessFilters = (
	filter: Unpacked<BuildFiltersFromSearchParams>,
) => {
	if (filter.type !== "ability") return true;

	return (
		filter.comparison !== "AT_LEAST" ||
		typeof filter.value !== "number" ||
		filter.value > 0
	);
};
export const shouldRevalidate: ShouldRevalidateFunction = (args) => {
	if (isRevalidation(args)) return true;

	const oldLimit = args.currentUrl.searchParams.get("limit");
	const newLimit = args.nextUrl.searchParams.get("limit");

	// limit was changed -> revalidate
	if (oldLimit !== newLimit) {
		return true;
	}

	const rawOldFilters = args.currentUrl.searchParams.get(
		FILTER_SEARCH_PARAM_KEY,
	);
	const oldFilters = rawOldFilters
		? safeJSONParse<BuildFiltersFromSearchParams>(rawOldFilters, []).filter(
				filterOutMeaninglessFilters,
			)
		: null;
	const rawNewFilters = args.nextUrl.searchParams.get(FILTER_SEARCH_PARAM_KEY);
	const newFilters = rawNewFilters
		? // no safeJSONParse as the value should be coming from app code and should be trustworthy
			(JSON.parse(rawNewFilters) as BuildFiltersFromSearchParams).filter(
				filterOutMeaninglessFilters,
			)
		: null;

	// meaningful filter was added/removed -> revalidate
	if (oldFilters && newFilters && oldFilters.length !== newFilters.length) {
		return true;
	}
	// no meaningful filters were or going to be in use -> skip revalidation
	if (
		oldFilters &&
		newFilters &&
		oldFilters.length === 0 &&
		newFilters.length === 0
	) {
		return false;
	}
	// all meaningful filters identical -> skip revalidation
	if (
		newFilters?.every((f1) =>
			oldFilters?.some((f2) => {
				if (f1.type !== f2.type) return false;

				if (f1.type === "mode" && f2.type === "mode") {
					return f1.mode === f2.mode;
				}
				if (f1.type === "date" && f2.type === "date") {
					return f1.date === f2.date;
				}
				if (f1.type !== "ability" || f2.type !== "ability") return false;

				return (
					f1.ability === f2.ability &&
					f1.comparison === f2.comparison &&
					f1.value === f2.value
				);
			}),
		)
	) {
		return false;
	}

	return args.defaultShouldRevalidate;
};

export const meta: MetaFunction = (args) => {
	const data = args.data as SerializeFrom<typeof loader> | null;

	if (!data) return [];

	return [{ title: data.title }];
};

export const handle: SendouRouteHandle = {
	i18n: ["weapons", "builds", "gear", "analyzer"],
	breadcrumb: ({ match }) => {
		const data = match.data as SerializeFrom<typeof loader> | undefined;

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

const BuildCards = React.memo(function BuildCards({
	data,
}: {
	data: SerializeFrom<typeof loader>;
}) {
	return (
		<div className="builds-container">
			{data.builds.map((build) => {
				return (
					<BuildCard
						key={build.id}
						build={build}
						owner={build}
						canEdit={false}
					/>
				);
			})}
		</div>
	);
});

export default function WeaponsBuildsPage() {
	const data = useLoaderData<typeof loader>();
	const { t } = useTranslation(["common", "builds"]);
	const [, setSearchParams] = useSearchParams();
	const [filters, setFilters] = React.useState<BuildFilter[]>(
		data.filters ? data.filters.map((f) => ({ ...f, id: nanoid() })) : [],
	);

	const filtersForSearchParams = (filters: BuildFilter[]) =>
		JSON.stringify(
			filters.map((f) => {
				const { id, ...rest } = f;
				return rest;
			}),
		);
	const syncSearchParams = (newFilters: BuildFilter[]) => {
		setSearchParams(
			filtersForSearchParams.length > 0
				? {
						[FILTER_SEARCH_PARAM_KEY]: filtersForSearchParams(newFilters),
					}
				: {},
		);
	};

	const handleFilterAdd = (type: BuildFilter["type"]) => {
		const newFilter: BuildFilter =
			type === "ability"
				? {
						id: nanoid(),
						type: "ability",
						ability: "ISM",
						comparison: "AT_LEAST",
						value: 0,
					}
				: type === "date"
					? {
							id: nanoid(),
							type: "date",
							date: PATCHES[0].date,
						}
					: {
							id: nanoid(),
							type: "mode",
							mode: "SZ",
						};

		const newFilters = [...filters, newFilter];
		setFilters(newFilters);

		// no need to sync new ability filter as this doesn't have effect till they make other choices
		if (type !== "ability") {
			syncSearchParams(newFilters);
		}
	};

	const handleFilterChange = (i: number, newFilter: Partial<BuildFilter>) => {
		const newFilters = clone(filters);

		newFilters[i] = {
			...(filters[i] as AbilityBuildFilter),
			...(newFilter as AbilityBuildFilter),
		};

		setFilters(newFilters);

		syncSearchParams(newFilters);
	};

	const handleFilterDelete = (i: number) => {
		const newFilters = filters.filter((_, index) => index !== i);
		setFilters(newFilters);

		syncSearchParams(newFilters);
	};

	const loadMoreLink = () => {
		const params = new URLSearchParams();

		params.set("limit", String(data.limit + BUILDS_PAGE_BATCH_SIZE));

		if (filters.length > 0) {
			params.set(FILTER_SEARCH_PARAM_KEY, filtersForSearchParams(filters));
		}

		return `?${params.toString()}`;
	};

	const FilterMenuButton = React.forwardRef((props, ref) => (
		<Button
			variant="outlined"
			size="tiny"
			icon={<FilterIcon />}
			disabled={filters.length >= MAX_BUILD_FILTERS}
			testId="add-filter-button"
			{...props}
			_ref={ref}
		>
			{t("builds:addFilter")}
		</Button>
	));

	const nthOfSameFilter = (index: number) => {
		const type = filters[index].type;

		return filters.slice(0, index).filter((f) => f.type === type).length + 1;
	};

	return (
		<Main className="stack lg">
			<div className="builds-buttons">
				<Menu
					items={[
						{
							id: "ability",
							text: t("builds:filters.type.ability"),
							icon: <BeakerFilledIcon />,
							onClick: () => handleFilterAdd("ability"),
						},
						{
							id: "mode",
							text: t("builds:filters.type.mode"),
							icon: <MapIcon />,
							onClick: () => handleFilterAdd("mode"),
						},
						{
							id: "date",
							text: t("builds:filters.type.date"),
							icon: <CalendarIcon />,
							onClick: () => handleFilterAdd("date"),
							disabled: filters.some((filter) => filter.type === "date"),
						},
					]}
					button={FilterMenuButton}
				/>
				<div className="builds-buttons__link">
					<LinkButton
						to={weaponBuildStatsPage(data.slug)}
						variant="outlined"
						icon={<ChartBarIcon />}
						size="tiny"
					>
						{t("builds:linkButton.abilityStats")}
					</LinkButton>
					<LinkButton
						to={weaponBuildPopularPage(data.slug)}
						variant="outlined"
						icon={<FireIcon />}
						size="tiny"
					>
						{t("builds:linkButton.popularBuilds")}
					</LinkButton>
				</div>
			</div>
			{filters.length > 0 ? (
				<div className="stack md">
					{filters.map((filter, i) => (
						<FilterSection
							key={filter.id}
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
			{data.limit < BUILDS_PAGE_MAX_BUILDS &&
				// not considering edge case where there are amount of builds equal to current limit
				// TODO: this could be fixed by taking example from the vods page
				data.builds.length === data.limit && (
					<LinkButton
						className="m-0-auto"
						size="tiny"
						to={loadMoreLink()}
						preventScrollReset
					>
						{t("common:actions.loadMore")}
					</LinkButton>
				)}
		</Main>
	);
}
