import clsx from "clsx";
import {
	Calendar,
	FlaskConical,
	Map as MapIcon,
	RotateCcw,
	X,
} from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import {
	AbilityPalette,
	AbilityPaletteButton,
} from "~/components/AbilityPalette";
import { SendouButton } from "~/components/elements/Button";
import {
	FilterLayout,
	type FilterLayoutFilter,
} from "~/components/filter-layout/FilterLayout";
import { Image } from "~/components/Image";
import { Pagination } from "~/components/Pagination";
import { possibleApValues } from "~/features/build-analyzer/analyzer-constants";
import { isStackableAbility } from "~/features/build-analyzer/core/ability-points";
import { useDateTimeFormat } from "~/hooks/intl/useDateTimeFormat";
import { abilities } from "~/modules/in-game-lists/abilities";
import { modesShort, rankedModesShort } from "~/modules/in-game-lists/modes";
import type {
	Ability as AbilityType,
	ModeShort,
} from "~/modules/in-game-lists/types";
import { abilityImageUrl, modeImageUrl } from "~/utils/urls";
import { MAX_BUILD_FILTERS, RECENT_PATCHES } from "../builds-constants";
import type { AbilityFilter } from "../builds-types";
import styles from "./BuildFilters.module.css";

const FILTER_AP_VALUES = possibleApValues().filter((ap) => ap > 0);
const DEFAULT_FILTER_AP = 10;

interface BuildFilterValues {
	abilities: AbilityFilter[];
	mode: ModeShort | null;
	date: string | null;
}

/** Build filters (mode, abilities & date, plus any `leadingFilters`) around the build results. */
export function BuildFiltersLayout({
	values: { abilities: abilityFilters, mode, date },
	onChange: setParams,
	onClearAll,
	leadingFilters = [],
	filteredBuildsCount,
	pagination,
	children,
}: {
	values: BuildFilterValues;
	onChange: (newValues: Partial<BuildFilterValues>) => void;
	/** Resets every filter, including `leadingFilters`. */
	onClearAll: () => void;
	leadingFilters?: FilterLayoutFilter[];
	/** How many builds match the active filters, null if unknown. */
	filteredBuildsCount: number | null;
	/** Shown below the results when there is more than one page. */
	pagination: React.ComponentProps<typeof Pagination>;
	children: React.ReactNode;
}) {
	const { t } = useTranslation(["builds", "game-misc"]);

	return (
		<FilterLayout
			filters={[
				...leadingFilters,
				{
					key: "mode",
					name: t("builds:filters.mode"),
					icon: <MapIcon />,
					formattedValue:
						mode !== null ? t(`game-misc:MODE_LONG_${mode}`) : null,
					testId: "mode-filter",
					content: (
						<ModeFilter
							mode={mode}
							onChange={(newMode) => setParams({ mode: newMode })}
						/>
					),
				},
				{
					key: "abilities",
					name: t("builds:filters.abilities"),
					icon: <FlaskConical />,
					formattedValue:
						abilityFilters.length > 0
							? `${abilityFilters.length} / ${MAX_BUILD_FILTERS}`
							: null,
					activeLabels: abilityFilters.map((filter) =>
						abilityFilterLabel(
							filter,
							t(`game-misc:ABILITY_${filter.ability}`),
						),
					),
					testId: "ability-filter",
					content: (
						<AbilitiesFilter
							filters={abilityFilters}
							onChange={(newFilters) => setParams({ abilities: newFilters })}
						/>
					),
				},
				{
					key: "date",
					name: t("builds:filters.updatedSince"),
					icon: <Calendar />,
					formattedValue: date !== null ? formatFilterDate(date) : null,
					activeLabels:
						date !== null
							? [`${t("builds:filters.date.since")} ${formatFilterDate(date)}`]
							: [],
					testId: "date-filter",
					content: (
						<BuildDateFilter
							date={date}
							onChange={(newDate) => setParams({ date: newDate })}
						/>
					),
				},
			]}
			onClearAll={onClearAll}
			showResultsText={t("builds:filters.showBuilds")}
			filteredResultsText={
				filteredBuildsCount
					? t("builds:weaponBuildCount", { count: filteredBuildsCount })
					: undefined
			}
		>
			{children}
			{pagination.pagesCount > 1 ? <Pagination {...pagination} /> : null}
		</FilterLayout>
	);
}

/** For the empty state of filtered results, so the filters can be reset without opening them. */
export function ClearFiltersButton({ onClick }: { onClick: () => void }) {
	const { t } = useTranslation(["common"]);

	return (
		<SendouButton
			variant="outlined"
			size="small"
			icon={<RotateCcw />}
			onClick={onClick}
			data-testid="empty-state-clear-filters"
		>
			{t("common:filterLayout.clearFilters")}
		</SendouButton>
	);
}

function ModeFilter({
	mode,
	onChange,
}: {
	mode: ModeShort | null;
	onChange: (mode: ModeShort | null) => void;
}) {
	const { t } = useTranslation(["builds", "game-misc"]);
	const name = React.useId();

	return (
		<div
			className={styles.modeOptions}
			role="radiogroup"
			aria-label={t("builds:filters.mode")}
		>
			<BuildFilterRadioOption
				name={name}
				checked={mode === null}
				onChange={() => onChange(null)}
				icon={<AnyModeIcon />}
			>
				{t("builds:filters.mode.any")}
			</BuildFilterRadioOption>
			{modesShort.map((option) => (
				<BuildFilterRadioOption
					key={option}
					name={name}
					checked={mode === option}
					onChange={() => onChange(option)}
					icon={<Image path={modeImageUrl(option)} size={20} alt="" />}
				>
					{t(`game-misc:MODE_LONG_${option}`)}
				</BuildFilterRadioOption>
			))}
		</div>
	);
}

function AnyModeIcon() {
	return (
		<div className={styles.anyModeIcon}>
			{rankedModesShort.map((mode) => (
				<Image key={mode} path={modeImageUrl(mode)} size={10} alt="" />
			))}
		</div>
	);
}

function AbilitiesFilter({
	filters,
	onChange,
}: {
	filters: AbilityFilter[];
	onChange: (filters: AbilityFilter[]) => void;
}) {
	const isFull = filters.length >= MAX_BUILD_FILTERS;
	// a gear piece has only one main slot
	const mainOnlyTypeTakenBy = (ability: AbilityType) =>
		filters.some(
			(filter) =>
				filter.type === "HAS" &&
				filter.ability !== ability &&
				!isStackableAbility(ability) &&
				abilityType(filter.ability) === abilityType(ability),
		);

	const toggleAbility = (ability: AbilityType) =>
		onChange(
			filters.some((filter) => filter.ability === ability)
				? filters.filter((filter) => filter.ability !== ability)
				: [...filters, { type: "HAS", ability }],
		);

	return (
		<div className={styles.abilitiesFilter}>
			<AbilityPalette
				renderAbility={(ability) => {
					const isSelected = filters.some(
						(filter) => filter.ability === ability,
					);
					const isDisabled =
						!isSelected && (isFull || mainOnlyTypeTakenBy(ability));

					return (
						<AbilityPaletteButton
							key={ability}
							ability={ability}
							aria-pressed={isSelected}
							aria-disabled={isDisabled || undefined}
							onClick={() => toggleAbility(ability)}
						/>
					);
				}}
			/>
			{filters.length > 0 ? (
				<ul className={styles.abilityFilterRows}>
					{filters.map((filter) => (
						<AbilityFilterRow
							key={filter.ability}
							filter={filter}
							isHasDisabled={mainOnlyTypeTakenBy(filter.ability)}
							onChange={(newFilter) =>
								onChange(
									filters.map((existing) =>
										existing.ability === filter.ability ? newFilter : existing,
									),
								)
							}
							onRemove={() => toggleAbility(filter.ability)}
						/>
					))}
				</ul>
			) : null}
		</div>
	);
}

function AbilityFilterRow({
	filter,
	isHasDisabled,
	onChange,
	onRemove,
}: {
	filter: AbilityFilter;
	isHasDisabled: boolean;
	onChange: (filter: AbilityFilter) => void;
	onRemove: () => void;
}) {
	const { t } = useTranslation(["builds", "analyzer", "game-misc"]);
	const abilityName = t(`game-misc:ABILITY_${filter.ability}`);

	const changeType = (type: AbilityFilter["type"]) =>
		onChange(
			type === "AT_LEAST" || type === "AT_MOST"
				? {
						type,
						ability: filter.ability,
						ap: "ap" in filter ? filter.ap : DEFAULT_FILTER_AP,
					}
				: { type, ability: filter.ability },
		);

	return (
		<li className={styles.abilityFilterRow} data-testid="ability-filter-row">
			<Image alt="" path={abilityImageUrl(filter.ability)} size={24} />
			<span className={styles.abilityFilterName}>{abilityName}</span>
			<SendouButton
				icon={<X />}
				size="miniscule"
				variant="minimal-destructive"
				onClick={onRemove}
				aria-label={`Remove ${abilityName} filter`}
			/>
			<div className={styles.abilityFilterCondition}>
				<select
					value={filter.type}
					onChange={(e) => changeType(e.target.value as AbilityFilter["type"])}
					aria-label={`${abilityName} condition`}
					data-testid="ability-filter-type-select"
				>
					<option value="HAS" disabled={isHasDisabled}>
						{t("builds:filters.has")}
					</option>
					<option value="HAS_NOT">{t("builds:filters.does.not.have")}</option>
					{isStackableAbility(filter.ability) ? (
						<>
							<option value="AT_LEAST">{t("builds:filters.atLeast")}</option>
							<option value="AT_MOST">{t("builds:filters.atMost")}</option>
						</>
					) : null}
				</select>
				{filter.type === "AT_LEAST" || filter.type === "AT_MOST" ? (
					<>
						<select
							className={styles.abilityFilterApSelect}
							value={filter.ap}
							onChange={(e) =>
								onChange({ ...filter, ap: Number(e.target.value) })
							}
							aria-label={`${abilityName} ability points`}
							data-testid="ability-filter-ap-select"
						>
							{FILTER_AP_VALUES.map((ap) => (
								<option key={ap} value={ap}>
									{ap}
								</option>
							))}
						</select>
						<span className="text-xs">{t("analyzer:abilityPoints.short")}</span>
					</>
				) : null}
			</div>
		</li>
	);
}

/** Radio list of the recent patches to filter builds updated since one, null for any time. */
export function BuildDateFilter({
	date,
	onChange,
}: {
	date: string | null;
	onChange: (date: string | null) => void;
}) {
	const { t } = useTranslation(["builds"]);
	const name = React.useId();
	const { formatter } = useDateTimeFormat({
		day: "numeric",
		month: "numeric",
		year: "numeric",
	});

	return (
		<BuildFilterRadioGroup label={t("builds:filters.updatedSince")}>
			<BuildFilterRadioOption
				name={name}
				checked={date === null}
				onChange={() => onChange(null)}
			>
				{t("builds:filters.date.anyTime")}
			</BuildFilterRadioOption>
			{RECENT_PATCHES.map((patch) => (
				<BuildFilterRadioOption
					key={patch.patch}
					name={name}
					checked={date === patch.date}
					onChange={() => onChange(patch.date)}
					sub={formatter.format(new Date(patch.date))}
				>
					{t("builds:filters.date.patch", { patch: patch.patch })}
				</BuildFilterRadioOption>
			))}
		</BuildFilterRadioGroup>
	);
}

/** Vertical list of `BuildFilterRadioOption`s. */
export function BuildFilterRadioGroup({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className={styles.optionList} role="radiogroup" aria-label={label}>
			{children}
		</div>
	);
}

/** Radio styled like the other build filter options. */
export function BuildFilterRadioOption({
	name,
	checked,
	onChange,
	icon,
	sub,
	children,
}: {
	name: string;
	checked: boolean;
	onChange: () => void;
	icon?: React.ReactNode;
	sub?: string;
	children: React.ReactNode;
}) {
	return (
		<label className={clsx(styles.option, { [styles.optionChecked]: checked })}>
			<input type="radio" name={name} checked={checked} onChange={onChange} />
			{icon}
			<span>{children}</span>
			{sub ? <span className={styles.optionSub}>{sub}</span> : null}
		</label>
	);
}

function formatFilterDate(date: string) {
	return RECENT_PATCHES.find((patch) => patch.date === date)?.patch ?? date;
}

function abilityFilterLabel(filter: AbilityFilter, abilityName: string) {
	switch (filter.type) {
		case "HAS":
			return abilityName;
		case "HAS_NOT":
			return `✗ ${abilityName}`;
		case "AT_LEAST":
			return `${abilityName} ≥ ${filter.ap}`;
		case "AT_MOST":
			return `${abilityName} ≤ ${filter.ap}`;
	}
}

function abilityType(ability: AbilityType) {
	return abilities.find((a) => a.name === ability)!.type;
}
