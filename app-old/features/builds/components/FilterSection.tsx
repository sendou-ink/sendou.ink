import { useTranslation } from "react-i18next";
import { Ability } from "~/components/Ability";
import { Button } from "~/components/Button";
import { ModeImage } from "~/components/Image";
import { CrossIcon } from "~/components/icons/Cross";
import { PATCHES } from "~/constants";
import { possibleApValues } from "~/features/build-analyzer";
import type { ModeShort } from "~/modules/in-game-lists";
import {
	type Ability as AbilityType,
	abilities,
	modesShort,
} from "~/modules/in-game-lists";
import { dateToYYYYMMDD } from "~/utils/dates";
import type {
	AbilityBuildFilter,
	BuildFilter,
	DateBuildFilter,
	ModeBuildFilter,
} from "../builds-types";

export function FilterSection({
	number,
	nthOfSame,
	filter,
	onChange,
	remove,
}: {
	number: number;
	nthOfSame: number;
	filter: BuildFilter;
	onChange: (filter: Partial<BuildFilter>) => void;
	remove: () => void;
}) {
	const { t } = useTranslation(["builds"]);

	return (
		<section>
			<div className="stack horizontal justify-between mx-2">
				<div className="text-xs font-bold">
					{t(`builds:filters.${filter.type}.title`)}{" "}
					{nthOfSame > 1 ? nthOfSame : ""}
				</div>
				<div>
					<Button
						icon={<CrossIcon />}
						size="tiny"
						variant="minimal-destructive"
						onClick={remove}
						aria-label="Delete filter"
						testId="delete-filter-button"
					/>
				</div>
			</div>
			{filter.type === "ability" ? (
				<AbilityFilter filter={filter} onChange={onChange} />
			) : null}
			{filter.type === "mode" ? (
				<ModeFilter filter={filter} onChange={onChange} number={number} />
			) : null}
			{filter.type === "date" ? (
				<DateFilter filter={filter} onChange={onChange} />
			) : null}
		</section>
	);
}

function AbilityFilter({
	filter,
	onChange,
}: {
	filter: AbilityBuildFilter;
	onChange: (filter: Partial<BuildFilter>) => void;
}) {
	const { t } = useTranslation(["analyzer", "game-misc", "builds"]);
	const abilityObject = abilities.find((a) => a.name === filter.ability)!;

	return (
		<div className="build__filter">
			<div className="build__filter__ability">
				<Ability ability={filter.ability} size="TINY" />
			</div>
			<select
				value={filter.ability}
				onChange={(e) =>
					onChange({
						ability: e.target.value as AbilityType,
						value:
							abilities.find((a) => a.name === e.target.value)!.type ===
							"STACKABLE"
								? 0
								: true,
					})
				}
			>
				{abilities.map((ability) => {
					return (
						<option key={ability.name} value={ability.name}>
							{t(`game-misc:ABILITY_${ability.name}`)}
						</option>
					);
				})}
			</select>
			{abilityObject.type !== "STACKABLE" ? (
				<select
					value={!filter.value ? "false" : "true"}
					onChange={(e) => onChange({ value: e.target.value === "true" })}
				>
					<option value="true">{t("builds:filters.has")}</option>
					<option value="false">{t("builds:filters.does.not.have")}</option>
				</select>
			) : null}
			{abilityObject.type === "STACKABLE" ? (
				<select
					value={filter.comparison}
					onChange={(e) =>
						onChange({
							comparison: e.target.value as AbilityBuildFilter["comparison"],
						})
					}
					data-testid="comparison-select"
				>
					<option value="AT_LEAST">{t("builds:filters.atLeast")}</option>
					<option value="AT_MOST">{t("builds:filters.atMost")}</option>
				</select>
			) : null}
			{abilityObject.type === "STACKABLE" ? (
				<div className="stack horizontal sm items-center">
					<select
						className="build__filter__ap-select"
						value={typeof filter.value === "number" ? filter.value : "0"}
						onChange={(e) => onChange({ value: Number(e.target.value) })}
					>
						{possibleApValues().map((value) => (
							<option key={value} value={value}>
								{value}
							</option>
						))}
					</select>
					<div className="text-sm">{t("analyzer:abilityPoints.short")}</div>
				</div>
			) : null}
		</div>
	);
}

function ModeFilter({
	filter,
	onChange,
	number,
}: {
	filter: ModeBuildFilter;
	onChange: (filter: Partial<BuildFilter>) => void;
	number: number;
}) {
	const { t } = useTranslation(["game-misc"]);

	const inputId = (mode: ModeShort) => `${number}-${mode}`;

	return (
		<div className="build__filter build__filter__mode">
			{modesShort.map((mode) => {
				return (
					<div
						key={mode}
						className="stack horizontal xs items-center font-sm font-semi-bold"
					>
						<input
							type="radio"
							name={`mode-${number}`}
							id={inputId(mode)}
							value={mode}
							checked={filter.mode === mode}
							onChange={() => onChange({ mode })}
						/>
						<label htmlFor={inputId(mode)} className="stack horizontal xs mb-0">
							<ModeImage mode={mode} size={18} />
							{t(`game-misc:MODE_LONG_${mode}`)}
						</label>
					</div>
				);
			})}
		</div>
	);
}

function DateFilter({
	filter,
	onChange,
}: {
	filter: DateBuildFilter;
	onChange: (filter: Partial<DateBuildFilter>) => void;
}) {
	const { t, i18n } = useTranslation(["builds"]);

	const selectValue = () => {
		const dateString = dateToYYYYMMDD(new Date(filter.date));

		if (
			PATCHES.find(({ date }) => {
				return new Date(date).toISOString().split("T")[0] === dateString;
			})
		) {
			return dateString;
		}

		return "CUSTOM";
	};

	// on Saturday so it doesn't overlap with actual path dates (no patches on Saturdays)
	const oneMonthAgoOnSaturday = new Date();
	oneMonthAgoOnSaturday.setDate(oneMonthAgoOnSaturday.getDate() - 30);
	oneMonthAgoOnSaturday.setDate(
		oneMonthAgoOnSaturday.getDate() - oneMonthAgoOnSaturday.getDay() + 6,
	);

	return (
		<div className="build__filter build__filter__date">
			<label className="mb-0">{t("builds:filters.date.since")}</label>
			<select
				className="build__filter__date-select"
				value={selectValue()}
				data-testid="date-select"
				onChange={(e) =>
					onChange({
						date:
							e.target.value === "CUSTOM"
								? dateToYYYYMMDD(oneMonthAgoOnSaturday)
								: e.target.value,
					})
				}
			>
				{PATCHES.map(({ patch, date: dateString }) => {
					const date = new Date(dateString);

					return (
						<option key={patch} value={dateString}>
							{patch} (
							{date.toLocaleDateString(i18n.language, {
								day: "numeric",
								month: "long",
								year: "numeric",
							})}
							)
						</option>
					);
				})}
				<option value="CUSTOM">{t("builds:filters.date.custom")}</option>
			</select>
			{selectValue() === "CUSTOM" ? (
				<input
					type="date"
					value={dateToYYYYMMDD(new Date(filter.date))}
					onChange={(e) => onChange({ date: e.target.value })}
					max={dateToYYYYMMDD(new Date())}
					data-testid="date-input"
				/>
			) : null}
		</div>
	);
}
