import * as React from "react";
import type { Key } from "react-aria-components";
import { useTranslation } from "react-i18next";
import { useLoaderData } from "react-router";
import { SendouSelect, SendouSelectItem } from "~/components/elements/Select";
import { SendouSwitch } from "~/components/elements/Switch";
import { UserSearch } from "~/components/elements/UserSearch";
import type { FilterBarPill } from "~/components/filter-bar/FilterBar";
import { FilterBar } from "~/components/filter-bar/FilterBar";
import {
	BEST_TIER_NUMBER,
	TIER_NUMBERS,
	type TournamentTierNumber,
	tierNumberToName,
	WORST_TIER_NUMBER,
} from "~/features/tournament/core/tiering";
import { RadioGroupFormField } from "~/form/fields/InputGroupFormField";
import { useDebounce } from "~/hooks/useDebounce";
import { useSearchParamsTyped } from "~/modules/search-params/hooks";
import type { UserResultsLoaderData } from "../loaders/u.$identifier.results.server";
import {
	RESULT_PLACEMENT_FILTERS,
	RESULT_SOURCES,
	RESULTS_FIRST_YEAR,
	type ResultPlacementFilter,
} from "../user-page-constants";
import { userResultsSearchParams } from "../user-page-search-params";

const DEFAULT_FILTERS = {
	highlightsOnly: true,
	tournament: null,
	team: null,
	mate: null,
	minTier: BEST_TIER_NUMBER,
	maxTier: WORST_TIER_NUMBER,
	maxPlacement: null,
	fromYear: null,
	toYear: null,
	source: "ALL",
	minParticipantCount: 0,
} as const;

export function ResultsFiltersBar() {
	const { t } = useTranslation("user");
	const data = useLoaderData<UserResultsLoaderData>();
	const [filters, setFilters] = useSearchParamsTyped(userResultsSearchParams);

	const tierFormatted = () => {
		if (
			filters.minTier === DEFAULT_FILTERS.minTier &&
			filters.maxTier === DEFAULT_FILTERS.maxTier
		) {
			return null;
		}

		const bestTier = tierNumberToName(filters.minTier);
		const worstTier = tierNumberToName(filters.maxTier);

		return bestTier === worstTier ? bestTier : `${bestTier}–${worstTier}`;
	};

	const placementName = (maxPlacement: number) =>
		maxPlacement === 1
			? t("results.filter.placement.first")
			: t("results.filter.placement.top", { count: maxPlacement });

	const yearsFormatted = () => {
		if (!filters.fromYear && !filters.toYear) return null;
		if (filters.fromYear === filters.toYear) return String(filters.fromYear);

		return `${filters.fromYear ?? ""}–${filters.toYear ?? ""}`;
	};

	const highlightsPill: FilterBarPill = {
		key: "highlights",
		name: t("results.highlights"),
		formattedValue: filters.highlightsOnly ? t("results.filter.only") : null,
		onRemove: () => setFilters({ highlightsOnly: false }),
		onAdd: () => setFilters({ highlightsOnly: true }),
		testId: "highlights-filter",
		popover: (
			<SendouSwitch
				isSelected={filters.highlightsOnly}
				onChange={(highlightsOnly) => setFilters({ highlightsOnly })}
			>
				{t("results.filter.highlightsOnly")}
			</SendouSwitch>
		),
	};

	const pills: FilterBarPill[] = [
		...(data.hasHighlightedResults ? [highlightsPill] : []),
		{
			key: "tournament",
			name: t("results.filter.tournament"),
			formattedValue: filters.tournament,
			onRemove: () => setFilters({ tournament: null }),
			testId: "tournament-filter",
			popover: (
				<DebouncedNameFilter
					label={t("results.filter.tournament")}
					value={filters.tournament}
					onChange={(tournament) => setFilters({ tournament })}
				/>
			),
		},
		{
			key: "mate",
			name: t("results.filter.mate"),
			formattedValue: filters.mate ? (data.mateUsername ?? "?") : null,
			onRemove: () => setFilters({ mate: null }),
			testId: "mate-filter",
			popover: (
				<UserSearch
					label={t("results.filter.mate")}
					initialUserId={filters.mate ?? undefined}
					onChange={(user) => setFilters({ mate: user?.id ?? null })}
				/>
			),
		},
		{
			key: "team",
			name: t("results.filter.team"),
			formattedValue: filters.team,
			onRemove: () => setFilters({ team: null }),
			testId: "team-filter",
			popover: (
				<DebouncedNameFilter
					label={t("results.filter.team")}
					value={filters.team}
					onChange={(team) => setFilters({ team })}
				/>
			),
		},
		{
			key: "tier",
			name: t("results.filter.tier"),
			formattedValue: tierFormatted(),
			onRemove: () =>
				setFilters({
					minTier: DEFAULT_FILTERS.minTier,
					maxTier: DEFAULT_FILTERS.maxTier,
				}),
			testId: "tier-filter",
			popover: (
				<div className="stack md">
					<SendouSelect
						label={t("results.filter.tier.min")}
						items={TIER_NUMBERS.map((tier) => ({ id: tier }))}
						selectedKey={filters.minTier}
						onSelectionChange={(key) => {
							const minTier = toTierNumber(key);
							setFilters({
								minTier,
								maxTier: minTier > filters.maxTier ? minTier : filters.maxTier,
							});
						}}
					>
						{({ id }) => (
							<SendouSelectItem key={id} id={id}>
								{tierNumberToName(id)}
							</SendouSelectItem>
						)}
					</SendouSelect>
					<SendouSelect
						label={t("results.filter.tier.max")}
						items={TIER_NUMBERS.map((tier) => ({ id: tier }))}
						selectedKey={filters.maxTier}
						onSelectionChange={(key) => {
							const maxTier = toTierNumber(key);
							setFilters({
								maxTier,
								minTier: maxTier < filters.minTier ? maxTier : filters.minTier,
							});
						}}
					>
						{({ id }) => (
							<SendouSelectItem key={id} id={id}>
								{tierNumberToName(id)}
							</SendouSelectItem>
						)}
					</SendouSelect>
				</div>
			),
		},
		{
			key: "placement",
			name: t("results.filter.placement"),
			formattedValue: filters.maxPlacement
				? placementName(filters.maxPlacement)
				: null,
			onRemove: () => setFilters({ maxPlacement: null }),
			testId: "placement-filter",
			popover: (
				<SendouSelect
					label={t("results.filter.placement")}
					items={RESULT_PLACEMENT_FILTERS.map((placement) => ({
						id: placement,
					}))}
					selectedKey={filters.maxPlacement}
					clearable
					onSelectionChange={(key) =>
						setFilters({
							maxPlacement:
								key === null ? null : (Number(key) as ResultPlacementFilter),
						})
					}
				>
					{({ id }) => (
						<SendouSelectItem key={id} id={id}>
							{placementName(id)}
						</SendouSelectItem>
					)}
				</SendouSelect>
			),
		},
		{
			key: "years",
			name: t("results.filter.years"),
			formattedValue: yearsFormatted(),
			onRemove: () => setFilters({ fromYear: null, toYear: null }),
			testId: "years-filter",
			popover: (
				<div className="stack md">
					<YearSelect
						label={t("results.filter.years.from")}
						value={filters.fromYear}
						onChange={(fromYear) =>
							setFilters({
								fromYear,
								toYear:
									fromYear && filters.toYear
										? Math.max(fromYear, filters.toYear)
										: filters.toYear,
							})
						}
					/>
					<YearSelect
						label={t("results.filter.years.to")}
						value={filters.toYear}
						onChange={(toYear) =>
							setFilters({
								toYear,
								fromYear:
									toYear && filters.fromYear
										? Math.min(toYear, filters.fromYear)
										: filters.fromYear,
							})
						}
					/>
				</div>
			),
		},
		{
			key: "source",
			name: t("results.filter.source"),
			formattedValue:
				filters.source === DEFAULT_FILTERS.source
					? null
					: t(`results.filter.source.${filters.source}`),
			onRemove: () => setFilters({ source: DEFAULT_FILTERS.source }),
			testId: "source-filter",
			popover: (
				<RadioGroupFormField
					name="source"
					label={t("results.filter.source")}
					items={RESULT_SOURCES.map((source) => ({
						label: t(`results.filter.source.${source}`),
						value: source,
					}))}
					value={filters.source}
					onChange={(source) => setFilters({ source })}
					onBlur={() => {}}
				/>
			),
		},
		{
			key: "size",
			name: t("results.filter.size"),
			formattedValue:
				filters.minParticipantCount > 0
					? `${filters.minParticipantCount}+`
					: null,
			onRemove: () => setFilters({ minParticipantCount: 0 }),
			testId: "size-filter",
			popover: (
				<label className="stack xs mb-0">
					{t("results.filter.size.min")}
					<input
						className="w-full"
						type="number"
						min={0}
						value={
							filters.minParticipantCount > 0 ? filters.minParticipantCount : ""
						}
						onChange={(e) =>
							setFilters({
								minParticipantCount: Math.max(0, Number(e.target.value) || 0),
							})
						}
					/>
				</label>
			),
		},
	];

	return (
		<FilterBar
			pills={pills}
			onReset={
				isDefaultFilters(filters)
					? undefined
					: () => setFilters(DEFAULT_FILTERS)
			}
		/>
	);
}

function DebouncedNameFilter({
	label,
	value,
	onChange,
}: {
	label: string;
	value: string | null;
	onChange: (value: string | null) => void;
}) {
	const [draft, setDraft] = React.useState(value ?? "");

	useDebounce(
		() => {
			if ((value ?? "") === draft.trim()) return;
			onChange(draft.trim() || null);
		},
		300,
		[draft],
	);

	return (
		<label className="stack xs mb-0">
			{label}
			<input
				className="w-full"
				value={draft}
				maxLength={100}
				onChange={(e) => setDraft(e.target.value)}
			/>
		</label>
	);
}

function YearSelect({
	label,
	value,
	onChange,
}: {
	label: string;
	value: number | null;
	onChange: (value: number | null) => void;
}) {
	const years = selectableYears();

	return (
		<SendouSelect
			label={label}
			items={years.map((year) => ({ id: year }))}
			selectedKey={value}
			clearable
			onSelectionChange={(key) => onChange(key === null ? null : Number(key))}
		>
			{({ id }) => (
				<SendouSelectItem key={id} id={id}>
					{id}
				</SendouSelectItem>
			)}
		</SendouSelect>
	);
}

const selectableYears = () => {
	const currentYear = new Date().getFullYear();

	const result = [];
	for (let year = currentYear; year >= RESULTS_FIRST_YEAR; year--) {
		result.push(year);
	}

	return result;
};

const toTierNumber = (key: Key | null) => Number(key) as TournamentTierNumber;

const isDefaultFilters = (
	filters: Record<keyof typeof DEFAULT_FILTERS, unknown>,
) =>
	Object.entries(DEFAULT_FILTERS).every(
		([key, value]) => filters[key as keyof typeof DEFAULT_FILTERS] === value,
	);
