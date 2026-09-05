import { useTranslation } from "react-i18next";
import type { MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import {
	SendouChipRadio,
	SendouChipRadioGroup,
} from "~/components/elements/ChipRadio";
import {
	SendouSelect,
	SendouSelectItem,
	SendouSelectItemSection,
} from "~/components/elements/Select";
import { Image, ModeImage } from "~/components/Image";
import { LocaleTimeRange } from "~/components/LocaleTimeRange";
import { Main } from "~/components/Main";
import { topSearchPage } from "~/features/top-search/top-search-urls";
import { rankedModesShort } from "~/modules/in-game-lists/modes";
import { useSearchParamsTyped } from "~/modules/search-params/hooks";
import { metaTags, ogPageImage } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { brandImageUrl, navIconUrl } from "~/utils/urls";
import { PlacementsTable } from "../components/Placements";
import { loader } from "../loaders/xsearch.server";
import { topSearchSearchParams } from "../top-search-search-params";
import { type MonthYear, monthYearToSpan } from "../top-search-utils";

export { loader };

const DIVISIONS = [
	{ region: "WEST", brandId: "B10" },
	{ region: "JPN", brandId: "B11" },
] as const;

export const handle: SendouRouteHandle = {
	breadcrumb: () => ({
		imgPath: navIconUrl("xsearch"),
		href: topSearchPage(),
		type: "IMAGE",
	}),
};

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "X Battle Top 500 Placements",
		ogTitle: "Splatoon 3 X Battle Top 500 results browser",
		description:
			"Splatoon 3 X Battle results for the top 500 players for all the finished seasons in both Tentatek and Takoroka divisions.",
		image: ogPageImage("xsearch"),
		location: args.location,
	});
};

export default function XSearchPage() {
	const data = useLoaderData<typeof loader>();

	return (
		<Main halfWidth className="stack lg">
			<div className="stack md">
				<SeasonMonthsSelect />
				<ModeFilter />
				<DivisionFilter />
			</div>
			<PlacementsTable placements={data.placements} />
		</Main>
	);
}

function SeasonMonthsSelect() {
	const { t } = useTranslation(["common"]);
	const data = useLoaderData<typeof loader>();
	const [params, setParams] = useSearchParamsTyped(topSearchSearchParams);

	const selected = {
		month: params.month ?? data.availableMonthYears[0].month,
		year: params.year ?? data.availableMonthYears[0].year,
	};

	return (
		<SendouSelect
			label={t("common:leaderboard.season")}
			selectedKey={monthYearToKey(selected)}
			onSelectionChange={(key) => setParams(keyToMonthYear(String(key)))}
			items={monthYearsGroupedByYear(data.availableMonthYears)}
			data-testid="xsearch-select"
		>
			{({ year, monthYears }) => (
				<SendouSelectItemSection heading={year} key={year}>
					{monthYears.map((monthYear) => (
						<SendouSelectItem
							key={monthYearToKey(monthYear)}
							id={monthYearToKey(monthYear)}
							textValue={monthYearSpanTextValue(monthYear)}
						>
							<MonthYearSpan monthYear={monthYear} />
						</SendouSelectItem>
					))}
				</SendouSelectItemSection>
			)}
		</SendouSelect>
	);
}

/**
 * Its own component because React Aria snapshots item content when building the collection,
 * before hydration and thus before locale aware formatting is available.
 */
function MonthYearSpan({ monthYear }: { monthYear: MonthYear }) {
	const span = monthYearToSpan(monthYear);

	return (
		<LocaleTimeRange
			from={new Date(span.from.year, span.from.month - 1)}
			to={new Date(span.to.year, span.to.month - 1)}
			options={{ month: "numeric", year: "numeric" }}
			inline
			data-testid={`xsearch-select-option-${monthYearToKey(monthYear)}`}
		/>
	);
}

function ModeFilter() {
	const { t } = useTranslation(["game-misc"]);
	const [params, setParams] = useSearchParamsTyped(topSearchSearchParams);

	return (
		<SendouChipRadioGroup wrap>
			{rankedModesShort.map((mode) => (
				<SendouChipRadio
					key={mode}
					name="mode"
					value={mode}
					checked={params.mode === mode}
					onChange={() => setParams({ mode })}
				>
					<span className="stack horizontal xs items-center">
						<ModeImage mode={mode} size={18} />
						{t(`game-misc:MODE_LONG_${mode}`)}
					</span>
				</SendouChipRadio>
			))}
		</SendouChipRadioGroup>
	);
}

function DivisionFilter() {
	const { t } = useTranslation(["common"]);
	const [params, setParams] = useSearchParamsTyped(topSearchSearchParams);

	return (
		<SendouChipRadioGroup>
			{DIVISIONS.map(({ region, brandId }) => (
				<SendouChipRadio
					key={region}
					name="region"
					value={region}
					checked={params.region === region}
					onChange={() => setParams({ region })}
				>
					<span className="stack horizontal xs items-center">
						<Image path={brandImageUrl(brandId)} size={18} alt="" />
						{t(`common:divisions.${region}`)}
					</span>
				</SendouChipRadio>
			))}
		</SendouChipRadioGroup>
	);
}

function monthYearToKey({ month, year }: MonthYear) {
	return `${month}-${year}`;
}

function keyToMonthYear(key: string): MonthYear {
	const [month, year] = key.split("-").map(Number);

	return { month, year };
}

/** Locale independent fallback used for type to select, the visible text is localized separately. */
function monthYearSpanTextValue(monthYear: MonthYear) {
	const span = monthYearToSpan(monthYear);

	return `${span.from.month}/${span.from.year} - ${span.to.month}/${span.to.year}`;
}

function monthYearsGroupedByYear(monthYears: Array<MonthYear>) {
	const grouped = Object.groupBy(monthYears, (monthYear) => monthYear.year);

	return Object.entries(grouped)
		.sort(([yearA], [yearB]) => Number(yearB) - Number(yearA))
		.map(([year, monthYearsOfYear]) => ({
			year,
			monthYears: (monthYearsOfYear ?? []).sort((a, b) => b.month - a.month),
		}));
}
