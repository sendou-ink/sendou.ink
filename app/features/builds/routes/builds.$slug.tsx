import {
	Calendar,
	ChartColumnBig,
	Flame,
	FlaskConical,
	Map as MapIcon,
	X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { Ability } from "~/components/Ability";
import { BuildCard } from "~/components/BuildCard";
import { LinkButton, SendouButton } from "~/components/elements/Button";
import { FilterBar } from "~/components/filter-bar/FilterBar";
import { ModeImage } from "~/components/Image";
import { Main } from "~/components/Main";
import { possibleApValues } from "~/features/build-analyzer/analyzer-constants";
import { useDateTimeFormat } from "~/hooks/intl/useDateTimeFormat";
import { abilities } from "~/modules/in-game-lists/abilities";
import { modesShort } from "~/modules/in-game-lists/modes";
import type { Ability as AbilityType } from "~/modules/in-game-lists/types";
import { useSearchParamsTyped } from "~/modules/search-params/hooks";
import { dateToYYYYMMDD, isValidDate } from "~/utils/dates";
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
import type { AbilityCondition } from "../builds-types";

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
	const [{ abilities: abilityConditions, mode, date }] =
		useSearchParamsTyped(buildsSearchParams);

	const loadMoreLink = () =>
		buildsSearchParams.href("", {
			limit: data.limit + BUILDS_PAGE_BATCH_SIZE,
			abilities: abilityConditions,
			mode,
			date,
		});

	return (
		<Main className="stack lg">
			<div className={styles.buildsButtons}>
				<Filters />
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

function Filters() {
	const { t } = useTranslation(["builds", "game-misc"]);
	const [{ abilities: abilityConditions, mode, date }, setParams] =
		useSearchParamsTyped(buildsSearchParams);

	return (
		<FilterBar
			pills={[
				{
					key: "abilities",
					name: t("builds:filters.abilities"),
					icon: <FlaskConical />,
					formattedValue:
						abilityConditions.length > 0
							? formatAbilityConditions(abilityConditions)
							: null,
					onRemove: () => setParams({ abilities: [] }),
					testId: "ability",
					popover: (
						<AbilityConditionsPopover
							conditions={abilityConditions}
							onChange={(newConditions, opts) =>
								setParams({ abilities: newConditions }, opts)
							}
						/>
					),
				},
				{
					key: "mode",
					name: t("builds:filters.mode"),
					icon: <MapIcon />,
					formattedValue:
						mode !== null ? t(`game-misc:MODE_SHORT_${mode}`) : null,
					onAdd: () => setParams({ mode: "SZ" }),
					onRemove: () => setParams({ mode: null }),
					testId: "mode",
					popover: (
						<div className="stack sm">
							{modesShort.map((option) => (
								<div
									key={option}
									className="stack horizontal xs items-center font-sm font-semi-bold"
								>
									<input
										type="radio"
										name="builds-mode"
										id={`builds-mode-${option}`}
										value={option}
										checked={mode === option}
										onChange={() => setParams({ mode: option })}
									/>
									<label
										htmlFor={`builds-mode-${option}`}
										className="stack horizontal xs mb-0"
									>
										<ModeImage mode={option} size={18} />
										{t(`game-misc:MODE_LONG_${option}`)}
									</label>
								</div>
							))}
						</div>
					),
				},
				{
					key: "date",
					name: t("builds:filters.date"),
					icon: <Calendar />,
					formattedValue: date !== null ? <FormattedDate date={date} /> : null,
					onAdd: () => setParams({ date: RECENT_PATCHES[0].date }),
					onRemove: () => setParams({ date: null }),
					testId: "date",
					popover: (
						<DatePopover
							date={date}
							onChange={(newDate) => setParams({ date: newDate })}
						/>
					),
				},
			]}
		/>
	);
}

function formatAbilityConditions(conditions: AbilityCondition[]) {
	const label = abilityConditionLabel(conditions[0]);

	return conditions.length > 1 ? `${label} +${conditions.length - 1}` : label;
}

function abilityConditionLabel(condition: AbilityCondition) {
	if (condition.value === true) return condition.ability;
	if (condition.value === false) return `✗ ${condition.ability}`;

	return `${condition.ability} ${
		condition.comparison === "AT_MOST" ? "≤" : "≥"
	} ${condition.value}`;
}

function AbilityConditionsPopover({
	conditions,
	onChange,
}: {
	conditions: AbilityCondition[];
	onChange: (
		conditions: AbilityCondition[],
		opts?: { loader: boolean },
	) => void;
}) {
	const { t } = useTranslation(["builds"]);

	const addCondition = () => {
		const newCondition: AbilityCondition = {
			ability: "ISM",
			comparison: "AT_LEAST",
			value: 0,
		};

		// a fresh "at least 0" ability condition matches every build, so no need to refetch
		onChange([...conditions, newCondition], { loader: false });
	};

	return (
		<div className={styles.abilityConditions}>
			{conditions.map((condition, i) => (
				<AbilityConditionRow
					key={i}
					condition={condition}
					onChange={(newCondition) =>
						onChange(
							conditions.map((c, index) => (index === i ? newCondition : c)),
						)
					}
					remove={() => onChange(conditions.filter((_, index) => index !== i))}
				/>
			))}
			<SendouButton
				className="self-start"
				size="small"
				variant="minimal"
				isDisabled={conditions.length >= MAX_BUILD_FILTERS}
				onPress={addCondition}
				data-testid="add-ability-condition"
			>
				{t("builds:filters.addAbility")}
			</SendouButton>
		</div>
	);
}

function AbilityConditionRow({
	condition,
	onChange,
	remove,
}: {
	condition: AbilityCondition;
	onChange: (condition: AbilityCondition) => void;
	remove: () => void;
}) {
	const { t } = useTranslation(["analyzer", "game-misc", "builds"]);
	const abilityObject = abilities.find((a) => a.name === condition.ability)!;

	return (
		<div className={styles.abilityConditionRow}>
			<Ability ability={condition.ability} size="TINY" />
			<select
				value={condition.ability}
				onChange={(e) => {
					const newAbility = e.target.value as AbilityType;
					const stackable =
						abilities.find((a) => a.name === newAbility)!.type === "STACKABLE";

					onChange({
						...condition,
						ability: newAbility,
						value: stackable ? 0 : true,
					});
				}}
			>
				{abilities.map((ability) => {
					return (
						<option key={ability.name} value={ability.name}>
							{t(`game-misc:ABILITY_${ability.name}`)}
						</option>
					);
				})}
			</select>
			<SendouButton
				icon={<X />}
				size="miniscule"
				variant="minimal-destructive"
				onPress={remove}
				aria-label="Delete ability condition"
				data-testid="delete-ability-condition"
			/>
			<div className={styles.abilityConditionValueRow}>
				{abilityObject.type === "STACKABLE" ? (
					<>
						<select
							value={condition.comparison}
							onChange={(e) =>
								onChange({
									...condition,
									comparison: e.target.value as AbilityCondition["comparison"],
								})
							}
							data-testid="comparison-select"
						>
							<option value="AT_LEAST">{t("builds:filters.atLeast")}</option>
							<option value="AT_MOST">{t("builds:filters.atMost")}</option>
						</select>
						<select
							className={styles.abilityConditionApSelect}
							value={
								typeof condition.value === "number" ? condition.value : "0"
							}
							onChange={(e) =>
								onChange({ ...condition, value: Number(e.target.value) })
							}
						>
							{possibleApValues().map((value) => (
								<option key={value} value={value}>
									{value}
								</option>
							))}
						</select>
						<div className="text-sm">{t("analyzer:abilityPoints.short")}</div>
					</>
				) : (
					<select
						value={!condition.value ? "false" : "true"}
						onChange={(e) =>
							onChange({ ...condition, value: e.target.value === "true" })
						}
					>
						<option value="true">{t("builds:filters.has")}</option>
						<option value="false">{t("builds:filters.does.not.have")}</option>
					</select>
				)}
			</div>
		</div>
	);
}

function FormattedDate({ date }: { date: string }) {
	const { formatter } = useDateTimeFormat({
		day: "numeric",
		month: "numeric",
		year: "numeric",
	});

	const patch = RECENT_PATCHES.find(
		({ date: patchDate }) => patchDate === date,
	);
	if (patch) return <>{patch.patch}</>;

	return <>{formatter.format(new Date(date))}</>;
}

function DatePopover({
	date,
	onChange,
}: {
	date: string | null;
	onChange: (date: string) => void;
}) {
	const { t } = useTranslation(["builds"]);
	const { formatter: patchDateFormatter } = useDateTimeFormat({
		day: "numeric",
		month: "numeric",
		year: "numeric",
	});

	const selectValue = () =>
		RECENT_PATCHES.some(({ date: patchDate }) => patchDate === date)
			? date
			: "CUSTOM";

	// on Saturday so it doesn't overlap with actual path dates (no patches on Saturdays)
	const oneMonthAgoOnSaturday = new Date();
	oneMonthAgoOnSaturday.setUTCDate(oneMonthAgoOnSaturday.getUTCDate() - 30);
	oneMonthAgoOnSaturday.setUTCDate(
		oneMonthAgoOnSaturday.getUTCDate() - oneMonthAgoOnSaturday.getUTCDay() + 6,
	);

	const customDate =
		date !== null && isValidDate(new Date(date))
			? new Date(date)
			: oneMonthAgoOnSaturday;

	return (
		<div className="stack sm">
			<label className="mb-0">{t("builds:filters.date.since")}</label>
			<select
				className="w-full"
				value={selectValue() ?? "CUSTOM"}
				data-testid="date-select"
				onChange={(e) =>
					onChange(
						e.target.value === "CUSTOM"
							? dateToYYYYMMDD(oneMonthAgoOnSaturday)
							: e.target.value,
					)
				}
			>
				{RECENT_PATCHES.map(({ patch, date: dateString }) => {
					const patchDate = new Date(dateString);

					return (
						<option key={patch} value={dateString}>
							{patch} ({patchDateFormatter.format(patchDate) ?? ""})
						</option>
					);
				})}
				<option value="CUSTOM">{t("builds:filters.date.custom")}</option>
			</select>
			{selectValue() === "CUSTOM" ? (
				<input
					className="w-full"
					type="date"
					value={dateToYYYYMMDD(customDate)}
					onChange={(e) => onChange(e.target.value)}
					max={dateToYYYYMMDD(new Date())}
					data-testid="date-input"
				/>
			) : null}
		</div>
	);
}
