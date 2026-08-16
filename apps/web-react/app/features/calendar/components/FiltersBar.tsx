import { Star, X } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useFetcher, useLoaderData } from "react-router";
import { SendouButton } from "~/components/elements/Button";
import { SendouSelect, SendouSelectItem } from "~/components/elements/Select";
import { SendouSwitch } from "~/components/elements/Switch";
import { UserSearch } from "~/components/elements/UserSearch";
import { FilterBar } from "~/components/filter-bar/FilterBar";
import { useUser } from "~/features/auth/core/user";
import { calendarFilterTags } from "~/features/calendar/calendar-schemas";
import { calendarSearchParams } from "~/features/calendar/calendar-search-params";
import type { CalendarFilters } from "~/features/calendar/calendar-types";
import {
	TIER_NUMBERS,
	tierNumberToName,
} from "~/features/tournament/core/tiering";
import {
	CheckboxGroupFormField,
	RadioGroupFormField,
} from "~/form/fields/InputGroupFormField";
import { gamesShort, versusShort } from "~/modules/in-game-lists/games";
import { modesShortWithSpecial } from "~/modules/in-game-lists/modes";
import { useSearchParamsTyped } from "~/modules/search-params/hooks";
import * as CalendarEvent from "../core/CalendarEvent";
import type { CalendarLoaderData } from "../loaders/calendar.server";

export function FiltersBar() {
	const { t } = useTranslation(["calendar", "common", "forms"]);
	const user = useUser();
	const data = useLoaderData<CalendarLoaderData>();
	const [, setParams] = useSearchParamsTyped(calendarSearchParams);
	const persistFetcher = useFetcher();

	const filters = data.filters;
	const defaults = CalendarEvent.defaultFilters();

	const tagItems = calendarFilterTags.map((tag) => ({
		label: t(`forms:options.tag.${tag}`),
		value: tag,
	}));

	const writeFilters = (partial: Partial<CalendarFilters>) => {
		setParams({ ...filters, ...partial, useDefaults: false });
	};

	const modesFormatted = () => {
		const parts = [];
		if (filters.modes.length < modesShortWithSpecial.length) {
			parts.push(filters.modes.join(", "));
		}
		if (filters.modesExact) {
			parts.push(t("calendar:filter.exactModes"));
		}

		return parts.length > 0 ? parts.join(" · ") : null;
	};

	const eventTypeFormatted = () => {
		const parts = [];
		if (filters.games.length < gamesShort.length) {
			parts.push(filters.games.join(", "));
		}
		if (filters.preferredVersus.length < versusShort.length) {
			parts.push(filters.preferredVersus.join(", "));
		}
		if (filters.isSendou) {
			parts.push(t("calendar:filterBar.sendou"));
		}
		if (filters.isRanked) {
			parts.push(t("calendar:filterBar.ranked"));
		}

		return parts.length > 0 ? parts.join(" · ") : null;
	};

	const tierFormatted = () => {
		if (
			filters.minTier === defaults.minTier &&
			filters.maxTier === defaults.maxTier
		) {
			return null;
		}

		const bestTier = tierNumberToName(filters.minTier);
		const worstTier = tierNumberToName(filters.maxTier);

		return bestTier === worstTier ? bestTier : `${bestTier}–${worstTier}`;
	};

	const tagsFormatted = () => {
		const parts = [];
		if (filters.tagsIncluded.length > 0) {
			parts.push(`+${filters.tagsIncluded.length}`);
		}
		if (filters.tagsExcluded.length > 0) {
			parts.push(`−${filters.tagsExcluded.length}`);
		}

		return parts.length > 0 ? parts.join(" · ") : null;
	};

	const organizersFormatted = () => {
		const parts = [];
		if (filters.orgsIncluded.length > 0) {
			parts.push(`+${filters.orgsIncluded.length}`);
		}
		const excludedCount =
			filters.orgsExcluded.length + filters.authorIdsExcluded.length;
		if (excludedCount > 0) {
			parts.push(`−${excludedCount}`);
		}

		return parts.length > 0 ? parts.join(" · ") : null;
	};

	const timeAndSizeFormatted = () => {
		const parts = [];
		if (filters.preferredStartTime !== "ANY") {
			parts.push(
				t(
					`calendar:filter.startTime.${filters.preferredStartTime.toLowerCase() as Lowercase<Exclude<CalendarFilters["preferredStartTime"], "ANY">>}`,
				),
			);
		}
		if (filters.minTeamCount > 0) {
			parts.push(`${filters.minTeamCount}+`);
		}

		return parts.length > 0 ? parts.join(" · ") : null;
	};

	return (
		<FilterBar
			pills={[
				{
					key: "modes",
					name: t("calendar:filter.modes"),
					formattedValue: modesFormatted(),
					onRemove: () =>
						writeFilters({ modes: defaults.modes, modesExact: false }),
					testId: "modes-filter",
					popover: (
						<div className="stack md items-start">
							<CheckboxGroupFormField
								name="modes"
								label={t("calendar:filter.modes")}
								items={[
									{ label: t("forms:modes.TW"), value: "TW" },
									{ label: t("forms:modes.SZ"), value: "SZ" },
									{ label: t("forms:modes.TC"), value: "TC" },
									{ label: t("forms:modes.RM"), value: "RM" },
									{ label: "Salmon Run", value: "SR" },
									{ label: t("forms:modes.CB"), value: "CB" },
									{ label: "Tricolor", value: "TB" },
								]}
								value={filters.modes}
								onChange={(modes) =>
									modes.length > 0 ? writeFilters({ modes }) : undefined
								}
								minLength={1}
								onBlur={() => {}}
							/>
							<SendouSwitch
								isSelected={filters.modesExact}
								onChange={(modesExact) => writeFilters({ modesExact })}
							>
								{t("calendar:filter.exactModes")}
							</SendouSwitch>
						</div>
					),
				},
				{
					key: "eventType",
					name: t("calendar:filterBar.eventType"),
					formattedValue: eventTypeFormatted(),
					onRemove: () =>
						writeFilters({
							games: defaults.games,
							preferredVersus: defaults.preferredVersus,
							isSendou: false,
							isRanked: false,
						}),
					testId: "event-type-filter",
					popover: (
						<div className="stack md items-start">
							<CheckboxGroupFormField
								name="games"
								label={t("calendar:filter.games")}
								items={gamesShort.map((game) => ({
									label: t(`forms:options.game.${game}`),
									value: game,
								}))}
								value={filters.games}
								onChange={(games) =>
									games.length > 0 ? writeFilters({ games }) : undefined
								}
								minLength={1}
								onBlur={() => {}}
							/>
							<CheckboxGroupFormField
								name="preferredVersus"
								label={t("calendar:filter.vs")}
								items={versusShort.map((versus) => ({
									label: versus,
									value: versus,
								}))}
								value={filters.preferredVersus}
								onChange={(preferredVersus) =>
									preferredVersus.length > 0
										? writeFilters({ preferredVersus })
										: undefined
								}
								minLength={1}
								onBlur={() => {}}
							/>
							<SendouSwitch
								isSelected={filters.isSendou}
								onChange={(isSendou) => writeFilters({ isSendou })}
							>
								{t("calendar:filter.isSendou")}
							</SendouSwitch>
							<SendouSwitch
								isSelected={filters.isRanked}
								onChange={(isRanked) => writeFilters({ isRanked })}
							>
								{t("calendar:filter.isRanked")}
							</SendouSwitch>
						</div>
					),
				},
				{
					key: "tier",
					name: t("calendar:filterBar.tier"),
					formattedValue: tierFormatted(),
					onRemove: () =>
						writeFilters({
							minTier: defaults.minTier,
							maxTier: defaults.maxTier,
						}),
					testId: "tier-filter",
					popover: (
						<div className="stack md">
							<TierSelect
								label={t("calendar:filter.minTier")}
								value={filters.minTier}
								onChange={(minTier) =>
									writeFilters({
										minTier,
										maxTier: Math.max(minTier, filters.maxTier),
									})
								}
							/>
							<TierSelect
								label={t("calendar:filter.maxTier")}
								value={filters.maxTier}
								onChange={(maxTier) =>
									writeFilters({
										maxTier,
										minTier: Math.min(maxTier, filters.minTier),
									})
								}
							/>
						</div>
					),
				},
				{
					key: "tags",
					name: t("calendar:filterBar.tags"),
					formattedValue: tagsFormatted(),
					onRemove: () => writeFilters({ tagsIncluded: [], tagsExcluded: [] }),
					testId: "tags-filter",
					popover: (
						<div className="stack md items-start">
							<CheckboxGroupFormField
								name="tagsIncluded"
								label={t("calendar:filter.tagsIncluded")}
								items={tagItems}
								value={filters.tagsIncluded}
								onChange={(tagsIncluded) =>
									writeFilters({
										tagsIncluded,
										tagsExcluded: filters.tagsExcluded.filter(
											(tag) => !tagsIncluded.includes(tag),
										),
									})
								}
								minLength={0}
								onBlur={() => {}}
							/>
							<CheckboxGroupFormField
								name="tagsExcluded"
								label={t("calendar:filter.tagsExcluded")}
								items={tagItems}
								value={filters.tagsExcluded}
								onChange={(tagsExcluded) =>
									writeFilters({
										tagsExcluded,
										tagsIncluded: filters.tagsIncluded.filter(
											(tag) => !tagsExcluded.includes(tag),
										),
									})
								}
								minLength={0}
								onBlur={() => {}}
							/>
						</div>
					),
				},
				{
					key: "organizers",
					name: t("calendar:filterBar.organizers"),
					formattedValue: organizersFormatted(),
					onRemove: () =>
						writeFilters({
							orgsIncluded: [],
							orgsExcluded: [],
							authorIdsExcluded: [],
						}),
					testId: "organizers-filter",
					popover: (
						<div className="stack md">
							<OrgListEditor
								label={t("calendar:filter.orgsIncluded")}
								values={filters.orgsIncluded}
								onChange={(orgsIncluded) => writeFilters({ orgsIncluded })}
								disabled={filters.orgsExcluded.length > 0}
							/>
							<OrgListEditor
								label={t("calendar:filter.orgsExcluded")}
								values={filters.orgsExcluded}
								onChange={(orgsExcluded) => writeFilters({ orgsExcluded })}
								disabled={filters.orgsIncluded.length > 0}
							/>
							<ExcludedAuthorsEditor
								label={t("calendar:filter.authorIdsExcluded")}
								values={filters.authorIdsExcluded}
								onChange={(authorIdsExcluded) =>
									writeFilters({ authorIdsExcluded })
								}
							/>
						</div>
					),
				},
				{
					key: "timeAndSize",
					name: t("calendar:filterBar.timeAndSize"),
					formattedValue: timeAndSizeFormatted(),
					onRemove: () =>
						writeFilters({ preferredStartTime: "ANY", minTeamCount: 0 }),
					testId: "time-and-size-filter",
					popover: (
						<div className="stack md">
							<RadioGroupFormField
								name="preferredStartTime"
								label={t("calendar:filter.startTime")}
								items={[
									{ label: t("calendar:filter.startTime.any"), value: "ANY" },
									{ label: t("calendar:filter.startTime.eu"), value: "EU" },
									{ label: t("calendar:filter.startTime.na"), value: "NA" },
									{ label: t("calendar:filter.startTime.au"), value: "AU" },
								]}
								value={filters.preferredStartTime}
								onChange={(preferredStartTime) =>
									writeFilters({ preferredStartTime })
								}
								onBlur={() => {}}
							/>
							<label className="stack xs mb-0">
								{t("calendar:filter.minTeamCount")}
								<input
									className="w-full"
									type="number"
									min={0}
									value={filters.minTeamCount > 0 ? filters.minTeamCount : ""}
									onChange={(e) =>
										writeFilters({
											minTeamCount: Math.max(0, Number(e.target.value) || 0),
										})
									}
								/>
							</label>
						</div>
					),
				},
			]}
			onReset={
				!CalendarEvent.isDefaultFilters(filters)
					? () => writeFilters(defaults)
					: undefined
			}
			actions={
				user && data.canSaveAsDefault ? (
					<SendouButton
						icon={<Star />}
						isDisabled={persistFetcher.state !== "idle"}
						onPress={() =>
							persistFetcher.submit(filters, {
								method: "post",
								encType: "application/json",
							})
						}
						data-testid="save-filters-as-default-button"
					>
						{t("common:filterBar.saveAsDefault")}
					</SendouButton>
				) : null
			}
		/>
	);
}

function TierSelect({
	label,
	value,
	onChange,
}: {
	label: string;
	value: number;
	onChange: (value: number) => void;
}) {
	return (
		<SendouSelect
			label={label}
			items={TIER_NUMBERS.map((tier) => ({ id: tier }))}
			selectedKey={value}
			onSelectionChange={(key) => onChange(Number(key))}
		>
			{({ id }) => (
				<SendouSelectItem key={id} id={id}>
					{tierNumberToName(id)}
				</SendouSelectItem>
			)}
		</SendouSelect>
	);
}

function OrgListEditor({
	label,
	values,
	onChange,
	disabled,
}: {
	label: string;
	values: string[];
	onChange: (values: string[]) => void;
	disabled: boolean;
}) {
	const { t } = useTranslation(["common"]);
	const [draft, setDraft] = React.useState("");

	const addDraft = () => {
		const org = draft.trim();
		if (!org || values.includes(org)) return;

		onChange([...values, org]);
		setDraft("");
	};

	return (
		<div className="stack xs">
			<span className="text-sm font-semi-bold">{label}</span>
			{values.map((org) => (
				<div key={org} className="stack horizontal xs items-center">
					<span className="text-sm">{org}</span>
					<SendouButton
						icon={<X />}
						variant="minimal-destructive"
						size="miniscule"
						aria-label={`Remove ${org}`}
						onPress={() => onChange(values.filter((value) => value !== org))}
					/>
				</div>
			))}
			{values.length < 10 ? (
				<div className="stack horizontal xs items-center">
					<input
						className="w-full"
						value={draft}
						maxLength={100}
						disabled={disabled}
						aria-label={label}
						onChange={(e) => setDraft(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								e.preventDefault();
								addDraft();
							}
						}}
					/>
					<SendouButton
						variant="minimal"
						size="small"
						isDisabled={disabled || draft.trim().length === 0}
						onPress={addDraft}
					>
						{t("common:actions.add")}
					</SendouButton>
				</div>
			) : null}
		</div>
	);
}

function ExcludedAuthorsEditor({
	label,
	values,
	onChange,
}: {
	label: string;
	values: number[];
	onChange: (values: number[]) => void;
}) {
	return (
		<div className="stack xs">
			<span className="text-sm font-semi-bold">{label}</span>
			{values.map((userId) => (
				<div key={userId} className="stack horizontal xs items-center">
					<UserSearch initialUserId={userId} isDisabled />
					<SendouButton
						icon={<X />}
						variant="minimal-destructive"
						size="miniscule"
						aria-label="Remove excluded author"
						onPress={() => onChange(values.filter((value) => value !== userId))}
					/>
				</div>
			))}
			{values.length < 10 ? (
				<UserSearch
					key={values.length}
					onChange={(user) => {
						if (user && !values.includes(user.id)) {
							onChange([...values, user.id]);
						}
					}}
				/>
			) : null}
		</div>
	);
}
