import { ChartColumnBig, ChartNoAxesColumn, Crosshair } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import type { MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import * as R from "remeda";
import { Ability } from "~/components/Ability";
import { EmptyState } from "~/components/EmptyState";
import {
	SendouChipRadio,
	SendouChipRadioGroup,
} from "~/components/elements/ChipRadio";
import { SendouSection } from "~/components/elements/Section";
import { SendouSelect, SendouSelectItem } from "~/components/elements/Select";
import { WeaponImage } from "~/components/Image";
import { WeaponBuildsLayout } from "~/features/builds/components/WeaponBuildsLayout";
import type { Ability as AbilityType } from "~/modules/in-game-lists/types";
import { roundToNDecimalPlaces } from "~/utils/number";
import type { SendouRouteHandle } from "~/utils/remix.server";
import {
	BUILDS_PAGE,
	navIconUrl,
	outlinedMainWeaponImageUrl,
	weaponBuildPage,
} from "~/utils/urls";
import {
	metaTags,
	ogPageImage,
	type SerializeFrom,
} from "../../../utils/remix";
import { ANY_TIME, AP_DISTRIBUTION_BINS } from "../build-stats-constants";
import { buildStatsSearchParams } from "../build-stats-search-params";
import { BuildStatsDateFilter } from "../components/BuildStatsDateFilter";
import {
	ComparisonBar,
	ComparisonBarLegend,
} from "../components/ComparisonBar";
import { loader } from "../loaders/builds.$slug.stats.server";
import styles from "./builds.$slug.stats.module.css";

export { loader };

export const shouldRevalidate = buildStatsSearchParams.shouldRevalidate;

export const meta: MetaFunction<typeof loader> = (args) => {
	if (!args.loaderData) return [];

	return metaTags({
		title: `${args.loaderData.weaponName} popular abilities`,
		ogTitle: `${args.loaderData.weaponName} Splatoon 3 popular abilities`,
		description: `List of the most popular abilities for ${args.loaderData.weaponName} in Splatoon 3.`,
		image: ogPageImage("builds"),
		location: args.location,
	});
};

export const handle: SendouRouteHandle = {
	i18n: ["weapons", "builds"],
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

type Stats = SerializeFrom<typeof loader>["stats"];
type StackableAbilityStats = Stats["stackableAbilities"][number];

const MAIN_ONLY_GEAR_TYPES = ["HEAD", "CLOTHES", "SHOES"] as const;

export default function BuildStatsPage() {
	const { t } = useTranslation(["builds"]);
	const data = useLoaderData<typeof loader>();

	return (
		<WeaponBuildsLayout
			weaponId={data.weaponId}
			weaponName={data.weaponName}
			slug={data.slug}
			buildsCount={data.buildsCount}
			selectedTab="stats"
		>
			<div className="stack md-plus">
				<BuildStatsDateFilter loaderDate={data.date} />
				{data.stats.weaponBuildsCount === 0 ? (
					<EmptyState navItem="builds">
						{data.date === ANY_TIME
							? t("builds:noBuildsForWeapon")
							: t("builds:noBuildsMatchingFilters")}
					</EmptyState>
				) : (
					<>
						<KeyStats stats={data.stats} />
						<div className={styles.columns}>
							<div className="stack md-plus">
								<AbilityPointAverages
									stats={data.stats}
									weaponName={data.weaponName}
								/>
								<MainOnlyAbilities stats={data.stats} />
							</div>
							<AbilityBreakdown
								stackableAbilities={data.stats.stackableAbilities}
								weaponName={data.weaponName}
								weaponCategory={data.weaponCategory}
							/>
						</div>
					</>
				)}
			</div>
		</WeaponBuildsLayout>
	);
}

function KeyStats({ stats }: { stats: Stats }) {
	const { t } = useTranslation(["builds"]);

	const mostRun = stats.stackableAbilities.reduce((run, ability) =>
		ability.percentage > run.percentage ? ability : run,
	);
	const mostInvested = stats.stackableAbilities.reduce((invested, ability) =>
		apDifference(ability) > apDifference(invested) ? ability : invested,
	);
	const mostSkipped = stats.stackableAbilities.reduce((skipped, ability) =>
		apDifference(ability) < apDifference(skipped) ? ability : skipped,
	);
	const mostFavoredMainOnly = R.firstBy(
		stats.mainOnlyAbilities.filter(
			(ability) => percentageDifference(ability) > 0,
		),
		[percentageDifference, "desc"],
	);
	const mostRunMainOnly = stats.mainOnlyAbilities.find(
		(ability) => ability.percentage.weapon > 0,
	);
	const mainOnlyKeyStat = mostFavoredMainOnly
		? {
				label: t("builds:stats.mostFavoredMainOnly"),
				ability: mostFavoredMainOnly,
			}
		: mostRunMainOnly
			? { label: t("builds:stats.mostRunMainOnly"), ability: mostRunMainOnly }
			: null;

	return (
		<div className={styles.keyStats}>
			<KeyStat
				label={t("builds:stats.mostRun")}
				ability={mostRun.name}
				sub={t("builds:stats.inPercentageOfBuilds", {
					percentage: mostRun.percentage,
				})}
			/>
			<KeyStat
				label={t("builds:stats.mostInvested")}
				ability={mostInvested.name}
				sub={
					<span className="text-success">
						{t("builds:stats.apVsAllWeapons", {
							difference: formatDifference(apDifference(mostInvested)),
						})}
					</span>
				}
			/>
			<KeyStat
				label={t("builds:stats.mostSkipped")}
				ability={mostSkipped.name}
				sub={
					<span className="text-warning">
						{t("builds:stats.apVsAllWeapons", {
							difference: formatDifference(apDifference(mostSkipped)),
						})}
					</span>
				}
			/>
			{mainOnlyKeyStat ? (
				<KeyStat
					label={mainOnlyKeyStat.label}
					ability={mainOnlyKeyStat.ability.name}
					sub={t("builds:stats.inPercentageOfBuildsVsAll", {
						percentage: mainOnlyKeyStat.ability.percentage.weapon,
						difference: formatDifference(
							percentageDifference(mainOnlyKeyStat.ability),
						),
					})}
				/>
			) : null}
		</div>
	);
}

function KeyStat({
	label,
	ability,
	sub,
}: {
	label: string;
	ability: AbilityType;
	sub: React.ReactNode;
}) {
	const { t } = useTranslation(["game-misc"]);

	return (
		<SendouSection title={label}>
			<div className="stack horizontal sm-plus items-center">
				<Ability
					ability={ability}
					size="MAIN"
					className={styles.keyStatAbility}
				/>
				<div className="stack xxs">
					<div className={styles.keyStatValue}>
						{t(`game-misc:ABILITY_${ability}`)}
					</div>
					<div className="text-xs text-lighter">{sub}</div>
				</div>
			</div>
		</SendouSection>
	);
}

function AbilityPointAverages({
	stats,
	weaponName,
}: {
	stats: Stats;
	weaponName: string;
}) {
	const { t } = useTranslation(["builds", "game-misc"]);
	const [sort, setSort] = React.useState<"AVERAGE" | "DIFFERENCE">("AVERAGE");
	const name = React.useId();

	const sortedAbilities =
		sort === "AVERAGE"
			? stats.stackableAbilities
			: [...stats.stackableAbilities].sort(
					(a, b) => apDifference(b) - apDifference(a),
				);
	const scaleMax = Math.max(
		...stats.stackableAbilities.flatMap((ability) => [
			ability.apAverage.weapon,
			ability.apAverage.all,
		]),
	);
	const toBarPercentage = (ap: number) =>
		scaleMax === 0 ? 0 : (ap / scaleMax) * 100;

	return (
		<SendouSection
			title={t("builds:stats.ap.title")}
			icon={ChartColumnBig}
			action={
				<SendouChipRadioGroup>
					{(["AVERAGE", "DIFFERENCE"] as const).map((option) => (
						<SendouChipRadio
							key={option}
							name={name}
							value={option}
							checked={sort === option}
							onChange={() => setSort(option)}
						>
							{t(`builds:stats.sort.${option}`)}
						</SendouChipRadio>
					))}
				</SendouChipRadioGroup>
			}
		>
			<div className="stack horizontal md justify-between flex-wrap">
				<ComparisonBarLegend weaponName={weaponName} />
				<span className="text-xs text-lighter">
					{t("builds:stats.basedOnBuilds", {
						count: stats.weaponBuildsCount,
					})}
				</span>
			</div>
			<ul className={styles.abilityRows}>
				{sortedAbilities.map((ability) => {
					const abilityName = t(`game-misc:ABILITY_${ability.name}`);
					const difference = apDifference(ability);

					return (
						<li key={ability.name} className={styles.abilityRow}>
							<Ability ability={ability.name} size="SUB" />
							<div className="stack xs">
								<div className="stack horizontal sm justify-between items-center flex-wrap">
									<span className="text-sm font-semi-bold">{abilityName}</span>
									<span className="text-xs text-lighter whitespace-nowrap">
										{t("builds:stats.inPercentageOfBuilds", {
											percentage: ability.percentage,
										})}
									</span>
								</div>
								<ComparisonBar
									value={toBarPercentage(ability.apAverage.weapon)}
									comparisonValue={toBarPercentage(ability.apAverage.all)}
									label={`${abilityName}: ${weaponName} ${ability.apAverage.weapon} AP, all weapons ${ability.apAverage.all} AP`}
								/>
							</div>
							<div className={styles.abilityValue}>
								<span className="font-bold whitespace-nowrap">
									{t("builds:stats.ap", { ap: ability.apAverage.weapon })}
								</span>
								<span
									className={styles.difference}
									data-sign={Math.sign(difference)}
								>
									{t("builds:stats.vsAll", {
										difference: formatDifference(difference),
									})}
								</span>
							</div>
						</li>
					);
				})}
			</ul>
		</SendouSection>
	);
}

function MainOnlyAbilities({ stats }: { stats: Stats }) {
	const { t } = useTranslation(["builds", "game-misc"]);

	return (
		<section className="stack sm-plus">
			<h2 className="text-md">{t("builds:stats.percentage.title")}</h2>
			<div className={styles.gearSlots}>
				{MAIN_ONLY_GEAR_TYPES.map((gearType) => {
					const abilities = stats.mainOnlyAbilities.filter(
						(ability) => ability.gearType === gearType,
					);
					const slotPercentage = R.sumBy(
						abilities,
						(ability) => ability.percentage.weapon,
					);

					return (
						<SendouSection
							key={gearType}
							title={t(`builds:stats.gear.${gearType}`)}
						>
							<div className="text-xs text-lighter">
								{t("builds:stats.slotUsage", {
									percentage: Math.round(slotPercentage),
								})}
							</div>
							<ul className={styles.mainOnlyRows}>
								{abilities.map((ability) => {
									const abilityName = t(`game-misc:ABILITY_${ability.name}`);

									return (
										<li key={ability.name} className={styles.mainOnlyRow}>
											<Ability ability={ability.name} size="SUBTINY" />
											<div className="stack xxs">
												<div className="stack horizontal sm justify-between flex-wrap text-xs">
													<span>{abilityName}</span>
													<span className="whitespace-nowrap">
														<span className="font-bold">
															{ability.percentage.weapon}%
														</span>{" "}
														<span className="text-lighter">
															{t("builds:stats.allPercentage", {
																percentage: ability.percentage.all,
															})}
														</span>
													</span>
												</div>
												<ComparisonBar
													size="small"
													value={ability.percentage.weapon}
													comparisonValue={ability.percentage.all}
													label={`${abilityName}: ${ability.percentage.weapon}%, all weapons ${ability.percentage.all}%`}
												/>
											</div>
										</li>
									);
								})}
							</ul>
						</SendouSection>
					);
				})}
			</div>
		</section>
	);
}

function AbilityBreakdown({
	stackableAbilities,
	weaponName,
	weaponCategory,
}: {
	stackableAbilities: Array<StackableAbilityStats>;
	weaponName: string;
	weaponCategory: SerializeFrom<typeof loader>["weaponCategory"];
}) {
	const { t } = useTranslation(["builds", "game-misc", "common"]);
	const [selectedAbilityName, setSelectedAbilityName] = React.useState(
		stackableAbilities[0].name,
	);

	const selectedAbility =
		stackableAbilities.find(
			(ability) => ability.name === selectedAbilityName,
		) ?? stackableAbilities[0];

	return (
		<aside className="stack md-plus">
			<SendouSection
				title={t("builds:stats.distribution.title")}
				icon={ChartNoAxesColumn}
			>
				<SendouSelect
					label={t("builds:stats.ability")}
					items={stackableAbilities.map((ability) => ({
						id: ability.name,
						name: t(`game-misc:ABILITY_${ability.name}`),
					}))}
					selectedKey={selectedAbility.name}
					onSelectionChange={(key) => {
						if (key) {
							setSelectedAbilityName(key as StackableAbilityStats["name"]);
						}
					}}
				>
					{(item) => (
						<SendouSelectItem key={item.id} id={item.id}>
							<span className="stack horizontal sm items-center">
								<Ability ability={item.id} size="TINY" />
								{item.name}
							</span>
						</SendouSelectItem>
					)}
				</SendouSelect>
				<AbilityPointDistribution
					ability={selectedAbility}
					weaponName={weaponName}
				/>
			</SendouSection>
			<SendouSection
				title={t("builds:stats.peers.title", {
					category: t(`common:weapon.category.${weaponCategory}`),
				})}
				icon={Crosshair}
			>
				<WeaponComparison ability={selectedAbility} />
			</SendouSection>
		</aside>
	);
}

function AbilityPointDistribution({
	ability,
	weaponName,
}: {
	ability: StackableAbilityStats;
	weaponName: string;
}) {
	const { t } = useTranslation(["builds", "game-misc"]);

	const abilityName = t(`game-misc:ABILITY_${ability.name}`);
	const maxPercentage = Math.max(
		...ability.distribution.map((bin) => bin.percentage),
	);
	const mostCommonBin = ability.distribution.find(
		(bin) => bin.percentage === maxPercentage,
	)!;
	const skippedPercentage = ability.distribution[0].percentage;
	const isMajority = mostCommonBin.percentage > 50;

	return (
		<div className="stack sm-plus">
			<div
				role="img"
				aria-label={`${abilityName} AP distribution: ${ability.distribution.map((bin) => `${binLabel(bin)} AP ${bin.percentage}%`).join(", ")}`}
				className={styles.distribution}
			>
				{ability.distribution.map((bin) => (
					<div key={bin.min} className={styles.distributionColumn}>
						<div className={styles.distributionBarArea}>
							<div
								className={styles.distributionBar}
								data-highlighted={bin === mostCommonBin}
								style={{
									height: `${maxPercentage === 0 ? 0 : (bin.percentage / maxPercentage) * 100}%`,
								}}
							>
								<span className={styles.distributionValue}>
									{bin.percentage}%
								</span>
							</div>
						</div>
						<span className="text-xxs text-lighter">{binLabel(bin)}</span>
					</div>
				))}
			</div>
			<p className="text-xs">
				{mostCommonBin.min === 0 && isMajority
					? t("builds:stats.distribution.mostlySkipped", {
							weapon: weaponName,
							ability: abilityName,
						})
					: `${distributionSummary()} ${t("builds:stats.distribution.skipped", {
							percentage: skippedPercentage,
						})}`}
			</p>
		</div>
	);

	function distributionSummary() {
		if (mostCommonBin.min === 0) {
			return t("builds:stats.distribution.run", {
				weapon: weaponName,
				ability: abilityName,
				percentage: roundToNDecimalPlaces(100 - skippedPercentage, 1),
			});
		}

		return t(
			isMajority
				? "builds:stats.distribution.summary"
				: "builds:stats.distribution.mostCommon",
			{
				weapon: weaponName,
				ability: abilityName,
				range: binLabel(mostCommonBin),
				percentage: mostCommonBin.percentage,
			},
		);
	}
}

function WeaponComparison({ ability }: { ability: StackableAbilityStats }) {
	const { t } = useTranslation(["builds", "weapons", "game-misc"]);
	const data = useLoaderData<typeof loader>();

	const maxAverage = Math.max(...ability.peers.map((peer) => peer.apAverage));

	return (
		<div className="stack sm-plus">
			<p className="text-xs text-lighter">
				{t("builds:stats.peers.explanation", {
					ability: t(`game-misc:ABILITY_${ability.name}`),
				})}
			</p>
			<ul className={styles.peers}>
				{ability.peers.map((peer) => {
					const isViewedWeapon = peer.weaponSplId === data.weaponId;

					return (
						<li
							key={peer.weaponSplId}
							className={styles.peer}
							data-viewed={isViewedWeapon}
						>
							<WeaponImage
								weaponSplId={peer.weaponSplId}
								variant="badge"
								size={20}
							/>
							<span className="truncate">
								{t(`weapons:MAIN_${peer.weaponSplId}`)}
							</span>
							<div className={styles.peerBar}>
								<div
									style={{
										width: `${maxAverage === 0 ? 0 : (peer.apAverage / maxAverage) * 100}%`,
									}}
								/>
							</div>
							<span className="font-bold text-right">{peer.apAverage}</span>
						</li>
					);
				})}
			</ul>
		</div>
	);
}

function apDifference(ability: StackableAbilityStats) {
	return ability.apAverage.weapon - ability.apAverage.all;
}

function percentageDifference(ability: Stats["mainOnlyAbilities"][number]) {
	return ability.percentage.weapon - ability.percentage.all;
}

function formatDifference(difference: number) {
	const rounded = Number(difference.toFixed(1));
	if (rounded === 0) return "±0";

	return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded)}`;
}

function binLabel(bin: { min: number; max: number }) {
	if (bin.min === bin.max) return String(bin.min);
	if (bin.max === AP_DISTRIBUTION_BINS.at(-1)!.max) return `${bin.min}+`;

	return `${bin.min}–${bin.max}`;
}
