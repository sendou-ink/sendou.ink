import type { MetaFunction } from "@remix-run/node";
import type { ShouldRevalidateFunction } from "@remix-run/react";
import { Link } from "@remix-run/react";
import clsx from "clsx";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { AbilitiesSelector } from "~/components/AbilitiesSelector";
import { Ability } from "~/components/Ability";
import Chart from "~/components/Chart";
import { WeaponCombobox } from "~/components/Combobox";
import { Image } from "~/components/Image";
import { Main } from "~/components/Main";
import { Table } from "~/components/Table";
import { Tab, Tabs } from "~/components/Tabs";
import { BeakerIcon } from "~/components/icons/Beaker";
import { MAX_AP } from "~/constants";
import { useUser } from "~/features/auth/core/user";
import { useIsMounted } from "~/hooks/useIsMounted";
import type { Ability as AbilityType } from "~/modules/in-game-lists";
import {
	ANGLE_SHOOTER_ID,
	BIG_BUBBLER_ID,
	type BuildAbilitiesTupleWithUnknown,
	INK_MINE_ID,
	INK_STORM_ID,
	KILLER_WAIL_ID,
	type MainWeaponId,
	POINT_SENSOR_ID,
	type SubWeaponId,
	TORPEDO_ID,
	TOXIC_MIST_ID,
	abilitiesShort,
	isAbility,
} from "~/modules/in-game-lists";
import { atOrError, nullFilledArray, removeDuplicates } from "~/utils/arrays";
import { damageTypeTranslationString } from "~/utils/i18next";
import invariant from "~/utils/invariant";
import type { SendouRouteHandle } from "~/utils/remix.server";
import {
	ANALYZER_URL,
	mainWeaponImageUrl,
	navIconUrl,
	objectDamageCalculatorPage,
	specialWeaponImageUrl,
	subWeaponImageUrl,
	userNewBuildPage,
} from "~/utils/urls";
import { SendouButton } from "../../../components/elements/Button";
import { SendouPopover } from "../../../components/elements/Popover";
import { metaTags } from "../../../utils/remix";
import {
	MAX_LDE_INTENSITY,
	damageTypeToWeaponType,
} from "../analyzer-constants";
import { useAnalyzeBuild } from "../analyzer-hooks";
import type {
	AbilityPoints,
	AnalyzedBuild,
	Damage,
	DamageType,
	SpecialEffectType,
	Stat,
	SubWeaponDamage,
} from "../analyzer-types";
import { PerInkTankGrid } from "../components/PerInkTankGrid";
import {
	ABILITIES_WITHOUT_CHUNKS,
	getAbilityChunksMapAsArray,
} from "../core/abilityChunksCalc";
import {
	SPECIAL_EFFECTS,
	lastDitchEffortIntensityToAp,
} from "../core/specialEffects";
import { buildStats } from "../core/stats";
import {
	buildIsEmpty,
	damageIsSubWeaponDamage,
	isMainOnlyAbility,
	isStackableAbility,
} from "../core/utils";
import "../analyzer.css";
import { SendouSwitch } from "~/components/elements/Switch";

export const CURRENT_PATCH = "9.2";

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "Build analyzer",
		ogTitle: "Splatoon 3 build analyzer/simulator",
		location: args.location,
		description:
			"Analyze and compare Splatoon 3 builds. Find out what exactly each combination of abilities does.",
	});
};

export const handle: SendouRouteHandle = {
	i18n: ["weapons", "analyzer", "builds"],
	breadcrumb: () => ({
		imgPath: navIconUrl("analyzer"),
		href: ANALYZER_URL,
		type: "IMAGE",
	}),
};

// Resolves this Github issue: https://github.com/Sendouc/sendou.ink/issues/1053
export const shouldRevalidate: ShouldRevalidateFunction = () => false;

export default function BuildAnalyzerShell() {
	const isMounted = useIsMounted();

	if (!isMounted) {
		return null;
	}

	return <BuildAnalyzerPage />;
}

function BuildAnalyzerPage() {
	const user = useUser();
	const { t } = useTranslation(["analyzer", "weapons"]);
	const {
		build,
		build2,
		focusedBuild,
		mainWeaponId,
		handleChange,
		analyzed,
		analyzed2,
		focused,
		abilityPoints,
		abilityPoints2,
		ldeIntensity,
		allEffects,
	} = useAnalyzeBuild();

	const statKeyToTuple = (key: keyof AnalyzedBuild["stats"]) => {
		return [analyzed.stats[key], analyzed2.stats[key], key] as [
			Stat,
			Stat,
			keyof AnalyzedBuild["stats"],
		];
	};

	const objectShredderSelected = build[2][0] === "OS" || build2[2][0] === "OS";

	const context = {
		isComparing: !buildIsEmpty(build) && !buildIsEmpty(build2),
		mainWeaponId,
		abilityPoints,
	};

	const mainWeaponCategoryItems = [
		analyzed.stats.shotSpreadAir && (
			<StatCard
				context={context}
				key="jumpShotSpread"
				stat={statKeyToTuple("shotSpreadAir")}
				title={t("analyzer:stat.jumpShotSpread")}
				suffix="°"
			/>
		),
		typeof analyzed.stats.shotSpreadGround === "number" && (
			<StatCard
				context={context}
				key="groundShotSpread"
				stat={analyzed.stats.shotSpreadGround}
				title={t("analyzer:stat.groundShotSpread")}
				suffix="°"
			/>
		),
		// Squeezer
		analyzed.stats.shotAutofireSpreadAir && (
			<StatCard
				context={context}
				key="shotAutofireSpreadAir"
				stat={statKeyToTuple("shotAutofireSpreadAir")}
				title={t("analyzer:stat.shotAutofireSpreadAir")}
				suffix="°"
			/>
		),
		typeof analyzed.stats.shotAutofireSpreadGround === "number" && (
			<StatCard
				context={context}
				key="shotAutofireSpreadGround"
				stat={analyzed.stats.shotAutofireSpreadGround}
				title={t("analyzer:stat.shotAutofireSpreadGround")}
				suffix="°"
			/>
		),

		typeof analyzed.stats.mainWeaponWhiteInkSeconds === "number" && (
			<StatCard
				context={context}
				key="whiteInkSeconds"
				stat={analyzed.stats.mainWeaponWhiteInkSeconds}
				title={t("analyzer:stat.whiteInk")}
				suffix={t("analyzer:suffix.seconds")}
			/>
		),
		typeof analyzed.weapon.brellaCanopyHp === "number" && (
			<StatCard
				context={context}
				key="brellaCanopyHp"
				stat={analyzed.weapon.brellaCanopyHp}
				title={t("analyzer:stat.canopyHp")}
				suffix={t("analyzer:suffix.hp")}
			/>
		),
		typeof analyzed.weapon.fullChargeSeconds === "number" && (
			<StatCard
				context={context}
				key="fullChargeSeconds"
				stat={analyzed.weapon.fullChargeSeconds}
				title={t("analyzer:stat.fullChargeSeconds")}
				suffix={t("analyzer:suffix.seconds")}
			/>
		),
		typeof analyzed.weapon.maxChargeHoldSeconds === "number" && (
			<StatCard
				context={context}
				key="maxChargeHoldSeconds"
				stat={analyzed.weapon.maxChargeHoldSeconds}
				title={t("analyzer:stat.maxChargeHoldSeconds")}
				suffix={t("analyzer:suffix.seconds")}
			/>
		),
	].filter(Boolean);

	// Handles edge case where a primary slot-only ability (e.g. Ninja Squid) is selected & the 'abilityPoints' count is still 0,
	//  and also fixes an edge case with Ability Doubler as the only ability in the build
	const showAbilityChunksRequired: boolean = build.some(
		(gear) =>
			gear.filter((ability) => !ABILITIES_WITHOUT_CHUNKS.has(ability)).length,
	);

	return (
		<Main>
			<div className="analyzer__container">
				<div className="analyzer__left-column">
					<div className="stack sm items-center w-full">
						<div className="w-full">
							<WeaponCombobox
								inputName="weapon"
								onChange={(opt) =>
									opt &&
									handleChange({
										newMainWeaponId: Number(opt.value) as MainWeaponId,
									})
								}
								fullWidth
							/>
						</div>
					</div>
					<div className="stack md items-center w-full">
						<div className="w-full">
							<Tabs className="analyzer__sub-nav" compact>
								<Tab
									active={focused === 1}
									onClick={() => handleChange({ newFocused: 1 })}
									testId="build1-tab"
								>
									{t("analyzer:build1")}
								</Tab>
								<Tab
									active={focused === 2}
									onClick={() => handleChange({ newFocused: 2 })}
									testId="build2-tab"
								>
									{t("analyzer:build2")}
								</Tab>
								<Tab
									active={focused === 3}
									onClick={() => handleChange({ newFocused: 3 })}
									testId="ap-tab"
								>
									{t("analyzer:compare")}
								</Tab>
							</Tabs>
							{focusedBuild ? (
								<AbilitiesSelector
									selectedAbilities={focusedBuild}
									onChange={(newBuild) => {
										const firstBuildIsEmpty = build
											.flat()
											.every((ability) => ability === "UNKNOWN");

										const buildWasEmptied =
											!firstBuildIsEmpty &&
											newBuild
												.flat()
												.every((ability) => ability === "UNKNOWN") &&
											focused === 1;

										// if we don't do this the
										// build2 would be duplicated
										if (buildWasEmptied) {
											handleChange({
												newBuild: build2,
												newBuild2: newBuild,
												newFocused: 1,
											});
											return;
										}

										handleChange({
											[focused === 1 || firstBuildIsEmpty
												? "newBuild"
												: "newBuild2"]: newBuild,
											newFocused: firstBuildIsEmpty ? 1 : undefined,
										});
									}}
								/>
							) : (
								<APCompare
									abilityPoints={abilityPoints}
									abilityPoints2={abilityPoints2}
									build={build}
									build2={build2}
								/>
							)}
						</div>
						<EffectsSelector
							build={build}
							build2={build2}
							ldeIntensity={ldeIntensity}
							handleLdeIntensityChange={(newLdeIntensity) =>
								handleChange({ newLdeIntensity })
							}
							handleAddEffect={(newEffect) =>
								handleChange({ newEffects: [...allEffects, newEffect] })
							}
							handleRemoveEffect={(effectToRemove) =>
								handleChange({
									newEffects: allEffects.filter((e) => e !== effectToRemove),
								})
							}
							effects={allEffects}
						/>
						{showAbilityChunksRequired && (
							<AbilityChunksRequired build={build} />
						)}
					</div>
					<div className="analyzer__patch">
						{t("analyzer:patch")} {CURRENT_PATCH}
					</div>
				</div>
				<div className="stack md">
					{mainWeaponCategoryItems.length > 0 && (
						<StatCategory
							title={t("analyzer:stat.category.main")}
							summaryRightContent={
								<div className="analyzer__weapon-info-badge">
									<Image
										path={mainWeaponImageUrl(mainWeaponId)}
										width={20}
										height={20}
										alt={t(`weapons:MAIN_${mainWeaponId}`)}
									/>
									<span className="analyzer__weapon-info-badge__text">
										{t(`weapons:MAIN_${mainWeaponId}`)}
									</span>
								</div>
							}
						>
							{mainWeaponCategoryItems}
						</StatCategory>
					)}

					<StatCategory
						title={t("analyzer:stat.category.sub")}
						summaryRightContent={
							<div className="analyzer__weapon-info-badge">
								<Image
									path={subWeaponImageUrl(analyzed.weapon.subWeaponSplId)}
									width={20}
									height={20}
									alt={t(`weapons:SUB_${analyzed.weapon.subWeaponSplId}`)}
								/>
								{t(`weapons:SUB_${analyzed.weapon.subWeaponSplId}`)}
							</div>
						}
					>
						<StatCard
							context={context}
							stat={statKeyToTuple("subWeaponInkConsumptionPercentage")}
							title={t("analyzer:stat.subWeaponInkConsumptionPercentage")}
							suffix="%"
						/>
						<StatCard
							context={context}
							stat={analyzed.stats.subWeaponWhiteInkSeconds}
							title={t("analyzer:stat.whiteInk")}
							suffix={t("analyzer:suffix.seconds")}
						/>
						{analyzed.stats.subVelocity && (
							<StatCard
								context={context}
								stat={statKeyToTuple("subVelocity")}
								title={t("analyzer:stat.sub.velocity")}
							/>
						)}
						{analyzed.stats.subFirstPhaseDuration && (
							<StatCard
								context={context}
								stat={statKeyToTuple("subFirstPhaseDuration")}
								title={t("analyzer:stat.sub.firstPhaseDuration")}
								suffix={t("analyzer:suffix.seconds")}
							/>
						)}
						{analyzed.stats.subSecondPhaseDuration && (
							<StatCard
								context={context}
								stat={statKeyToTuple("subSecondPhaseDuration")}
								title={t("analyzer:stat.sub.secondPhaseDuration")}
								suffix={t("analyzer:suffix.seconds")}
							/>
						)}
						{analyzed.stats.subMarkingTimeInSeconds && (
							<StatCard
								context={context}
								stat={statKeyToTuple("subMarkingTimeInSeconds")}
								title={t("analyzer:stat.sub.markingTimeInSeconds")}
								suffix={t("analyzer:suffix.seconds")}
							/>
						)}
						{analyzed.stats.subMarkingRadius && (
							<StatCard
								context={context}
								stat={statKeyToTuple("subMarkingRadius")}
								title={t("analyzer:stat.sub.markingRadius")}
							/>
						)}
						{analyzed.stats.subExplosionRadius && (
							<StatCard
								context={context}
								stat={statKeyToTuple("subExplosionRadius")}
								title={t("analyzer:stat.sub.explosionRadius")}
							/>
						)}
						{analyzed.stats.subHp && (
							<StatCard
								context={context}
								stat={statKeyToTuple("subHp")}
								title={t("analyzer:stat.sub.hp")}
								suffix={t("analyzer:suffix.hp")}
							/>
						)}
						{analyzed.stats.subQsjBoost && (
							<StatCard
								context={context}
								stat={statKeyToTuple("subQsjBoost")}
								title={t("analyzer:stat.sub.qsjBoost")}
								suffix={t("analyzer:abilityPoints.short")}
							/>
						)}
					</StatCategory>

					<StatCategory
						title={t("analyzer:stat.category.special")}
						summaryRightContent={
							<div className="analyzer__weapon-info-badge">
								<Image
									path={specialWeaponImageUrl(
										analyzed.weapon.specialWeaponSplId,
									)}
									width={20}
									height={20}
									alt={t(
										`weapons:SPECIAL_${analyzed.weapon.specialWeaponSplId}`,
									)}
								/>
								{t(`weapons:SPECIAL_${analyzed.weapon.specialWeaponSplId}`)}
							</div>
						}
						textBelow={
							analyzed.weapon.specialWeaponSplId === BIG_BUBBLER_ID
								? t("analyzer:bigBubblerExplanation", {
										weapon: t(
											`weapons:SPECIAL_${analyzed.weapon.specialWeaponSplId}`,
										),
									})
								: undefined
						}
					>
						<StatCard
							context={context}
							stat={statKeyToTuple("specialPoint")}
							title={t("analyzer:stat.specialPoints")}
							suffix={t("analyzer:suffix.specialPointsShort")}
						/>
						<StatCard
							context={context}
							stat={statKeyToTuple("specialLost")}
							title={t("analyzer:stat.specialLost")}
							suffix="%"
						/>
						<StatCard
							context={context}
							stat={statKeyToTuple("specialLostSplattedByRP")}
							title={t("analyzer:stat.specialLostSplattedByRP")}
							suffix="%"
						/>
						{analyzed.stats.specialDurationInSeconds && (
							<StatCard
								context={context}
								stat={statKeyToTuple("specialDurationInSeconds")}
								title={t("analyzer:stat.special.duration", {
									weapon: t(
										`weapons:SPECIAL_${analyzed.weapon.specialWeaponSplId}`,
									),
								})}
								suffix={t("analyzer:suffix.seconds")}
								popoverInfo={
									analyzed.weapon.specialWeaponSplId === INK_STORM_ID
										? t("analyzer:stat.special.duration.inkStormExplanation")
										: analyzed.weapon.specialWeaponSplId === KILLER_WAIL_ID
											? t("analyzer:stat.special.duration.killerWail")
											: undefined
								}
							/>
						)}
						{analyzed.stats.specialDamageDistance && (
							<StatCard
								context={context}
								stat={statKeyToTuple("specialDamageDistance")}
								title={t("analyzer:stat.special.damageDistance", {
									weapon: t(
										`weapons:SPECIAL_${analyzed.weapon.specialWeaponSplId}`,
									),
								})}
							/>
						)}
						{analyzed.stats.specialPaintRadius && (
							<StatCard
								context={context}
								stat={statKeyToTuple("specialPaintRadius")}
								title={t("analyzer:stat.special.paintRadius", {
									weapon: t(
										`weapons:SPECIAL_${analyzed.weapon.specialWeaponSplId}`,
									),
								})}
							/>
						)}
						{analyzed.stats.specialFieldHp && (
							<StatCard
								context={context}
								stat={statKeyToTuple("specialFieldHp")}
								title={t("analyzer:stat.special.shieldHp", {
									weapon: t(
										`weapons:SPECIAL_${analyzed.weapon.specialWeaponSplId}`,
									),
								})}
								suffix={t("analyzer:suffix.hp")}
							/>
						)}
						{analyzed.stats.specialDeviceHp && (
							<StatCard
								context={context}
								stat={statKeyToTuple("specialDeviceHp")}
								title={t("analyzer:stat.special.deviceHp", {
									weapon: t(
										`weapons:SPECIAL_${analyzed.weapon.specialWeaponSplId}`,
									),
								})}
								suffix={t("analyzer:suffix.hp")}
							/>
						)}
						{analyzed.stats.specialHookInkConsumptionPercentage && (
							<StatCard
								context={context}
								stat={statKeyToTuple("specialHookInkConsumptionPercentage")}
								title={t("analyzer:stat.special.inkConsumptionHook", {
									weapon: t(
										`weapons:SPECIAL_${analyzed.weapon.specialWeaponSplId}`,
									),
								})}
								suffix="%"
							/>
						)}
						{analyzed.stats.specialInkConsumptionPerSecondPercentage && (
							<StatCard
								context={context}
								stat={statKeyToTuple(
									"specialInkConsumptionPerSecondPercentage",
								)}
								title={t("analyzer:stat.special.inkConsumptionPerSecond", {
									weapon: t(
										`weapons:SPECIAL_${analyzed.weapon.specialWeaponSplId}`,
									),
								})}
								suffix="%"
							/>
						)}
						{analyzed.stats.specialReticleRadius && (
							<StatCard
								context={context}
								stat={statKeyToTuple("specialReticleRadius")}
								title={t("analyzer:stat.special.reticleRadius", {
									weapon: t(
										`weapons:SPECIAL_${analyzed.weapon.specialWeaponSplId}`,
									),
								})}
							/>
						)}
						{analyzed.stats.specialThrowDistance && (
							<StatCard
								context={context}
								stat={statKeyToTuple("specialThrowDistance")}
								title={t("analyzer:stat.special.throwDistance", {
									weapon: t(
										`weapons:SPECIAL_${analyzed.weapon.specialWeaponSplId}`,
									),
								})}
							/>
						)}
						{analyzed.stats.specialMoveSpeed && (
							<StatCard
								context={context}
								stat={statKeyToTuple("specialMoveSpeed")}
								title={t("analyzer:stat.special.moveSpeed", {
									weapon: t(
										`weapons:SPECIAL_${analyzed.weapon.specialWeaponSplId}`,
									),
								})}
							/>
						)}
						{analyzed.stats.specialAutoChargeRate && (
							<StatCard
								context={context}
								stat={statKeyToTuple("specialAutoChargeRate")}
								title={t("analyzer:stat.special.autoChargeRate", {
									weapon: t(
										`weapons:SPECIAL_${analyzed.weapon.specialWeaponSplId}`,
									),
								})}
							/>
						)}
						{analyzed.stats.specialMaxRadius && (
							<StatCard
								context={context}
								stat={statKeyToTuple("specialMaxRadius")}
								title={t("analyzer:stat.special.maxRadius", {
									weapon: t(
										`weapons:SPECIAL_${analyzed.weapon.specialWeaponSplId}`,
									),
								})}
								popoverInfo={t("analyzer:stat.special.maxRadius.explanation")}
							/>
						)}
						{analyzed.stats.specialRadiusRangeMin && (
							<StatCard
								context={context}
								stat={statKeyToTuple("specialRadiusRangeMin")}
								title={t("analyzer:stat.special.radiusRangeMin", {
									weapon: t(
										`weapons:SPECIAL_${analyzed.weapon.specialWeaponSplId}`,
									),
								})}
							/>
						)}
						{analyzed.stats.specialRadiusRangeMax && (
							<StatCard
								context={context}
								stat={statKeyToTuple("specialRadiusRangeMax")}
								title={t("analyzer:stat.special.radiusRangeMax", {
									weapon: t(
										`weapons:SPECIAL_${analyzed.weapon.specialWeaponSplId}`,
									),
								})}
							/>
						)}
						{analyzed.stats.specialPowerUpDuration && (
							<StatCard
								context={context}
								stat={statKeyToTuple("specialPowerUpDuration")}
								title={t("analyzer:stat.special.powerUpDuration", {
									weapon: t(
										`weapons:SPECIAL_${analyzed.weapon.specialWeaponSplId}`,
									),
								})}
								suffix={t("analyzer:suffix.seconds")}
							/>
						)}
					</StatCategory>
					<StatCategory
						title={t("analyzer:stat.category.subDef")}
						textBelow={t("analyzer:trackingSubDefExplanation")}
					>
						<StatCard
							context={context}
							stat={statKeyToTuple("subDefToxicMistMovementReduction")}
							title={t("analyzer:stat.movementReduction", {
								weapon: t(`weapons:SUB_${TOXIC_MIST_ID}`),
							})}
							suffix="%"
						/>
						<StatCard
							context={context}
							stat={statKeyToTuple("subDefPointSensorMarkedTimeInSeconds")}
							title={t("analyzer:stat.markedTime", {
								weapon: t(`weapons:SUB_${POINT_SENSOR_ID}`),
							})}
							suffix={t("analyzer:suffix.seconds")}
						/>
						<StatCard
							context={context}
							stat={statKeyToTuple("subDefInkMineMarkedTimeInSeconds")}
							title={t("analyzer:stat.markedTime", {
								weapon: t(`weapons:SUB_${INK_MINE_ID}`),
							})}
							suffix={t("analyzer:suffix.seconds")}
						/>
						<StatCard
							context={context}
							stat={statKeyToTuple("subDefAngleShooterMarkedTimeInSeconds")}
							title={t("analyzer:stat.markedTime", {
								weapon: t(`weapons:SUB_${ANGLE_SHOOTER_ID}`),
							})}
							suffix={t("analyzer:suffix.seconds")}
						/>
					</StatCategory>

					{analyzed.stats.subWeaponDefenseDamages.length > 0 && (
						<StatCategory
							title={t("analyzer:stat.category.subWeaponDefenseDamages")}
							containerClassName="analyzer__table-container"
							textBelow={t("analyzer:damageSubDefExplanation")}
						>
							{(["SRU"] as const).some(
								(ability) => (abilityPoints.get(ability) ?? 0) > 0,
							) ? (
								<div className="analyzer__stat-card-highlighted" />
							) : null}
							<DamageTable
								showPopovers
								values={analyzed.stats.subWeaponDefenseDamages}
								comparisonValues={
									analyzed2.stats.subWeaponDefenseDamages.some(
										(dmg, i) =>
											dmg.value !==
												analyzed.stats.subWeaponDefenseDamages[i].value &&
											dmg.baseValue !== dmg.value,
									)
										? analyzed2.stats.subWeaponDefenseDamages
										: undefined
								}
								multiShots={analyzed.weapon.multiShots}
							/>
						</StatCategory>
					)}

					{analyzed.stats.damages.length > 0 && (
						<StatCategory
							title={t("analyzer:stat.category.damage")}
							containerClassName="analyzer__table-container"
						>
							<DamageTable
								values={analyzed.stats.damages}
								multiShots={analyzed.weapon.multiShots}
							/>
						</StatCategory>
					)}

					{analyzed.stats.specialWeaponDamages.length > 0 && (
						<StatCategory
							title={t("analyzer:stat.category.special.damage", {
								specialWeapon: t(
									`weapons:SPECIAL_${analyzed.weapon.specialWeaponSplId}`,
								),
							})}
							containerClassName="analyzer__table-container"
						>
							<DamageTable values={analyzed.stats.specialWeaponDamages} />
						</StatCategory>
					)}

					{analyzed.stats.fullInkTankOptions.length > 0 && (
						<StatCategory
							title={t("analyzer:stat.category.actionsPerInkTank")}
							containerClassName="analyzer__table-container"
						>
							{(["ISM", "ISS"] as const).some(
								(ability) => (abilityPoints.get(ability) ?? 0) > 0,
							) ? (
								<div className="analyzer__stat-card-highlighted" />
							) : null}
							<ConsumptionTable
								isComparing={context.isComparing}
								options={[
									analyzed.stats.fullInkTankOptions,
									analyzed2.stats.fullInkTankOptions,
								]}
								subWeaponId={analyzed.weapon.subWeaponSplId}
							/>
							<div className="mt-4 flex justify-end">
								<PerInkTankGrid weaponSplId={mainWeaponId} />
							</div>
						</StatCategory>
					)}

					<StatCategory
						title={t("analyzer:stat.category.movement")}
						testId="movement-category"
					>
						<StatCard
							context={context}
							title={t("analyzer:attribute.weight")}
							stat={t(`analyzer:attribute.weight.${analyzed.weapon.speedType}`)}
						/>
						<StatCard
							context={context}
							stat={statKeyToTuple("swimSpeed")}
							title={t("analyzer:stat.swimSpeed")}
							testId="swim-speed"
						/>
						<StatCard
							context={context}
							stat={statKeyToTuple("swimSpeedHoldingRainmaker")}
							title={t("analyzer:stat.swimSpeedHoldingRainmaker")}
						/>
						<StatCard
							context={context}
							stat={statKeyToTuple("runSpeed")}
							title={t("analyzer:stat.runSpeed")}
						/>
						{analyzed.stats.shootingRunSpeed && (
							<StatCard
								context={context}
								stat={statKeyToTuple("shootingRunSpeed")}
								title={t("analyzer:stat.shootingRunSpeed")}
							/>
						)}
						{analyzed.stats.shootingRunSpeedCharging && (
							<StatCard
								context={context}
								stat={statKeyToTuple("shootingRunSpeedCharging")}
								title={t("analyzer:stat.shootingRunSpeedCharging")}
							/>
						)}
						{analyzed.stats.shootingRunSpeedFullCharge && (
							<StatCard
								context={context}
								stat={statKeyToTuple("shootingRunSpeedFullCharge")}
								title={t("analyzer:stat.shootingRunSpeedFullCharge")}
							/>
						)}
						{analyzed.stats.shootingRunSpeedSecondaryMode && (
							<StatCard
								context={context}
								stat={statKeyToTuple("shootingRunSpeedSecondaryMode")}
								title={t("analyzer:stat.shootingRunSpeedSecondaryMode")}
							/>
						)}
						<StatCard
							context={context}
							stat={statKeyToTuple("squidSurgeChargeFrames")}
							title={t("analyzer:stat.squidSurgeChargeFrames")}
						/>
						<StatCard
							context={context}
							stat={statKeyToTuple("runSpeedInEnemyInk")}
							title={t("analyzer:stat.runSpeedInEnemyInk")}
						/>
						<StatCard
							context={context}
							stat={statKeyToTuple("framesBeforeTakingDamageInEnemyInk")}
							title={t("analyzer:stat.framesBeforeTakingDamageInEnemyInk")}
						/>
						<StatCard
							context={context}
							stat={statKeyToTuple("damageTakenInEnemyInkPerSecond")}
							title={t("analyzer:stat.damageTakenInEnemyInkPerSecond")}
							suffix={t("analyzer:suffix.hp")}
						/>
						<StatCard
							context={context}
							stat={statKeyToTuple("enemyInkDamageLimit")}
							title={t("analyzer:stat.enemyInkDamageLimit")}
							suffix={t("analyzer:suffix.hp")}
						/>
					</StatCategory>

					<StatCategory title={t("analyzer:stat.category.misc")}>
						<StatCard
							context={context}
							stat={statKeyToTuple("squidFormInkRecoverySeconds")}
							title={t("analyzer:stat.squidFormInkRecoverySeconds")}
							suffix={t("analyzer:suffix.seconds")}
						/>
						<StatCard
							context={context}
							stat={statKeyToTuple("humanoidFormInkRecoverySeconds")}
							title={t("analyzer:stat.humanoidFormInkRecoverySeconds")}
							suffix={t("analyzer:suffix.seconds")}
						/>
						<StatCard
							context={context}
							stat={statKeyToTuple("quickRespawnTime")}
							title={t("analyzer:stat.quickRespawnTime")}
							suffix={t("analyzer:suffix.seconds")}
						/>
						<StatCard
							context={context}
							stat={statKeyToTuple("quickRespawnTimeSplattedByRP")}
							title={t("analyzer:stat.quickRespawnTimeSplattedByRP")}
							suffix={t("analyzer:suffix.seconds")}
						/>
						<StatCard
							context={context}
							stat={statKeyToTuple("superJumpTimeGroundFrames")}
							title={t("analyzer:stat.superJumpTimeGround")}
						/>
						<StatCard
							context={context}
							stat={statKeyToTuple("superJumpTimeTotal")}
							title={t("analyzer:stat.superJumpTimeTotal")}
							suffix={t("analyzer:suffix.seconds")}
						/>
					</StatCategory>
					{objectShredderSelected && (
						<Link
							className="analyzer__noticeable-link"
							to={objectDamageCalculatorPage(mainWeaponId)}
						>
							<Image
								path={navIconUrl("object-damage-calculator")}
								width={24}
								height={24}
								alt=""
							/>
							{t("analyzer:objCalcAd")}
						</Link>
					)}
					{user && focusedBuild && !buildIsEmpty(focusedBuild) ? (
						<Link
							className="analyzer__noticeable-link"
							to={userNewBuildPage(user, {
								weapon: mainWeaponId,
								build: focusedBuild,
							})}
							data-testid="new-build-prompt"
						>
							<Image
								path={navIconUrl("builds")}
								width={24}
								height={24}
								alt=""
							/>
							{t("analyzer:newBuildPrompt")}
						</Link>
					) : null}
				</div>
			</div>
		</Main>
	);
}

interface StatChartProps {
	statKey?: keyof AnalyzedBuild["stats"];
	subWeaponId?: SubWeaponId;
	modifiedBy: AbilityType[];
	title: string;
	valueSuffix?: string;
	mainWeaponId: MainWeaponId;
	simple?: boolean;
}

function StatChartPopover(props: StatChartProps) {
	const { t } = useTranslation(["analyzer"]);

	return (
		<SendouPopover
			popoverClassName="analyzer__stat-popover"
			trigger={
				<SendouButton
					className={
						props.simple ? undefined : "analyzer__stat-popover-trigger"
					}
					icon={
						<BeakerIcon
							className="analyzer__stat-popover-trigger__icon"
							title={t("analyzer:button.showChart")}
						/>
					}
				/>
			}
		>
			<h2 className="text-center text-lg">{props.title}</h2>
			<StatChart {...props} />
		</SendouPopover>
	);
}

function StatChart({
	statKey,
	modifiedBy,
	valueSuffix,
	mainWeaponId,
	subWeaponId,
}: StatChartProps) {
	const { t } = useTranslation(["analyzer"]);

	const distanceLabel = t("analyzer:damage.header.distance");
	const chartOptions = React.useMemo(() => {
		const stackableAbility = modifiedBy.find(isStackableAbility)!;
		const mainOnlyAbility = modifiedBy.find(isMainOnlyAbility);

		return statKey
			? statKeyGraphOptions({
					stackableAbility,
					mainOnlyAbility,
					statKey,
					mainWeaponId,
				})
			: typeof subWeaponId === "number"
				? subDefenseGraphOptions({
						subWeaponId,
						distanceLabel,
					})
				: [];
	}, [statKey, modifiedBy, mainWeaponId, subWeaponId, distanceLabel]);

	// prevent crash but this should not happen
	if (chartOptions.length === 0) {
		console.error("no chart options");
		return null;
	}

	return (
		<Chart
			options={chartOptions as any}
			headerSuffix={t("analyzer:abilityPoints.short")}
			valueSuffix={valueSuffix}
			xAxis="linear"
		/>
	);
}

function statKeyGraphOptions({
	stackableAbility,
	mainOnlyAbility,
	statKey,
	mainWeaponId,
}: {
	stackableAbility: AbilityType;
	mainOnlyAbility: AbilityType | undefined;
	statKey: keyof AnalyzedBuild["stats"];
	mainWeaponId: MainWeaponId;
}) {
	const analyzedBuilds = nullFilledArray(MAX_AP + 1).map((_, i) =>
		buildStats({
			abilityPoints: new Map([[stackableAbility, i]]),
			weaponSplId: mainWeaponId,
			mainOnlyAbilities: [],
			hasTacticooler: false,
		}),
	);

	const result = [
		{
			label: <Ability ability={stackableAbility} size="TINY" />,
			data: analyzedBuilds.map((a, i) => ({
				primary: i,
				secondary: (a.stats[statKey] as Stat).value,
			})),
		},
	];

	if (mainOnlyAbility) {
		const mainOnlyAbilityAnalyzedBuilds = nullFilledArray(MAX_AP + 1).map(
			(_, i) =>
				buildStats({
					abilityPoints: new Map([[stackableAbility, i]]),
					weaponSplId: mainWeaponId,
					mainOnlyAbilities: [mainOnlyAbility],
					hasTacticooler: false,
				}),
		);

		result.push({
			label: (
				<div className="stack horizontal">
					<Ability ability={stackableAbility} size="TINY" />
					<Ability ability={mainOnlyAbility} size="TINY" />
				</div>
			),
			data: mainOnlyAbilityAnalyzedBuilds.map((a, i) => ({
				primary: i,
				secondary: (a.stats[statKey] as Stat).value,
			})),
		});
	}

	return result;
}

const damageToKey = (damage: SubWeaponDamage) => {
	if (typeof damage.distance === "number") {
		return `${damage.distance},${damage.baseValue}`;
	}

	return `${damage.distance!.join(",")},${damage.baseValue}`;
};
function subDefenseGraphOptions({
	subWeaponId,
	distanceLabel,
}: {
	subWeaponId: SubWeaponId;
	distanceLabel: string;
}) {
	const analyzedBuilds = nullFilledArray(MAX_AP + 1).map((_, i) =>
		buildStats({
			abilityPoints: new Map([["SRU", i]]),
			weaponSplId: 0,
			mainOnlyAbilities: [],
			hasTacticooler: false,
		}),
	);

	const distanceKeys = removeDuplicates(
		analyzedBuilds[0].stats.subWeaponDefenseDamages
			.filter((d) => (d as SubWeaponDamage).subWeaponId === subWeaponId)
			.filter((d) => d.value < 100)
			.map((d) => damageToKey(d)),
	);

	const result = [];

	for (const key of distanceKeys) {
		const distance = key.split(",")[0];

		result.push({
			label: `${distanceLabel}: ${distance}`,
			data: analyzedBuilds.map((a, i) => ({
				primary: i,
				secondary:
					a.stats.subWeaponDefenseDamages.find(
						(d) =>
							(d as SubWeaponDamage).subWeaponId === subWeaponId &&
							damageToKey(d) === key,
					)?.value ?? 0,
			})),
		});
	}

	return result;
}

function APCompare({
	abilityPoints,
	abilityPoints2,
	build,
	build2,
}: {
	abilityPoints: AbilityPoints;
	abilityPoints2: AbilityPoints;
	build: BuildAbilitiesTupleWithUnknown;
	build2: BuildAbilitiesTupleWithUnknown;
}) {
	const { t } = useTranslation(["analyzer"]);

	const buildMains = build
		.flat()
		.filter((ability) => !isStackableAbility(ability) && ability !== "UNKNOWN");
	const build2Mains = build2
		.flat()
		.filter((ability) => !isStackableAbility(ability) && ability !== "UNKNOWN");

	const hasAtLeastOneMainOnlyAbility =
		buildMains.length > 0 || build2Mains.length > 0;

	return (
		<div className="analyzer__ap-compare">
			{hasAtLeastOneMainOnlyAbility ? (
				<>
					<div className="analyzer__ap-compare__mains">
						{buildMains.map((ability) => (
							<Ability key={ability} ability={ability} size="TINY" />
						))}
					</div>
					<div />
					<div className="analyzer__ap-compare__mains">
						{build2Mains.map((ability) => (
							<Ability key={ability} ability={ability} size="TINY" />
						))}
					</div>
				</>
			) : null}
			{([...abilitiesShort, "UNKNOWN"] as const).map((ability) => {
				const ap = abilityPoints.get(ability) ?? 0;
				const ap2 = abilityPoints2.get(ability) ?? 0;

				if (!ap && !ap2) return null;

				return (
					<React.Fragment key={ability}>
						<div
							className={clsx("justify-self-end", {
								invisible: !ap,
							})}
							data-testid="ap-compare-1"
						>
							{ap}
							{t("analyzer:abilityPoints.short")}
						</div>
						<div
							className={clsx("analyzer__ap-compare__bar", "justify-self-end", {
								analyzer__better: ap >= ap2,
							})}
							style={{ width: `${ap}px` }}
						/>
						<Ability ability={ability} size="TINY" />
						<div
							className={clsx("analyzer__ap-compare__bar", {
								analyzer__better: ap <= ap2,
							})}
							style={{ width: `${ap2}px` }}
						/>
						<div
							className={clsx({ invisible: !ap2 })}
							data-testid="ap-compare-2"
						>
							{ap2}
							{t("analyzer:abilityPoints.short")}
						</div>
					</React.Fragment>
				);
			})}
		</div>
	);
}

function EffectsSelector({
	build,
	build2,
	effects,
	ldeIntensity,
	handleLdeIntensityChange,
	handleAddEffect,
	handleRemoveEffect,
}: {
	build: BuildAbilitiesTupleWithUnknown;
	build2: BuildAbilitiesTupleWithUnknown;
	effects: Array<SpecialEffectType>;
	ldeIntensity: number;
	handleLdeIntensityChange: (newLdeIntensity: number) => void;
	handleAddEffect: (effect: SpecialEffectType) => void;
	handleRemoveEffect: (effect: SpecialEffectType) => void;
}) {
	const { t } = useTranslation(["weapons", "analyzer"]);

	const effectsToShow = SPECIAL_EFFECTS.filter(
		(effect) =>
			!isAbility(effect.type) ||
			build.flat().includes(effect.type) ||
			build2.flat().includes(effect.type),
	).reverse(); // reverse to show Tacticooler first as it always shows

	return (
		<div className="analyzer__effects-selector">
			{effectsToShow.map((effect) => {
				return (
					<React.Fragment key={effect.type}>
						<div>
							{isAbility(effect.type) ? (
								<Ability ability={effect.type} size="SUB" />
							) : (
								<Image
									path={specialWeaponImageUrl(15)}
									alt={t("weapons:SPECIAL_15")}
									height={32}
									width={32}
								/>
							)}
						</div>
						<div>
							{effect.type === "LDE" ? (
								<select
									value={ldeIntensity}
									onChange={(e) =>
										handleLdeIntensityChange(Number(e.target.value))
									}
									className="analyzer__lde-intensity-select"
								>
									{new Array(MAX_LDE_INTENSITY + 1).fill(null).map((_, i) => {
										const percentage = ((i / MAX_LDE_INTENSITY) * 100)
											.toFixed(2)
											.replace(".00", "");

										return (
											<option key={i} value={i}>
												{percentage}% (+{lastDitchEffortIntensityToAp(i)}{" "}
												{t("analyzer:abilityPoints.short")})
											</option>
										);
									})}
								</select>
							) : (
								<SendouSwitch
									isSelected={effects.includes(effect.type)}
									onChange={(isSelected) =>
										isSelected
											? handleAddEffect(effect.type)
											: handleRemoveEffect(effect.type)
									}
									size="small"
								/>
							)}
						</div>
					</React.Fragment>
				);
			})}
		</div>
	);
}

function AbilityChunksRequired({
	build,
}: {
	build: BuildAbilitiesTupleWithUnknown;
}) {
	const { t } = useTranslation("analyzer");
	const abilityChunksMapAsArray = getAbilityChunksMapAsArray(build);

	return (
		<details className="w-full">
			<summary className="analyzer__ap-summary">{t("abilityChunks")}</summary>
			<div className="stack sm horizontal flex-wrap mt-4">
				{abilityChunksMapAsArray.map((a) => {
					const mainAbilityName = a[0];
					const numChunksRequired = a[1];

					return (
						<div
							key={`abilityChunksRequired_${mainAbilityName}`}
							className="stack items-center"
						>
							<Ability ability={mainAbilityName} size="TINY" />
							<div className="analyzer__ap-text">{numChunksRequired}</div>
						</div>
					);
				})}
			</div>
		</details>
	);
}

function StatCategory({
	title,
	children,
	containerClassName = "analyzer__stat-collection",
	textBelow,
	summaryRightContent,
	testId,
}: {
	title: string;
	children: React.ReactNode;
	containerClassName?: string;
	textBelow?: string;
	summaryRightContent?: React.ReactNode;
	testId?: string;
}) {
	return (
		<details className="analyzer__details">
			<summary className="analyzer__summary" data-testid={testId}>
				{title}
				{summaryRightContent}
			</summary>
			<div className={containerClassName}>{children}</div>
			{textBelow && (
				<div className="analyzer__stat-category-explanation">{textBelow}</div>
			)}
		</details>
	);
}

type StatTuple<T = number> = [Stat<T>, Stat<T>, keyof AnalyzedBuild["stats"]];
function StatCard({
	title,
	stat,
	suffix,
	popoverInfo,
	testId,
	context: { mainWeaponId, abilityPoints, isComparing },
}: {
	title: string;
	stat: StatTuple | StatTuple<string> | number | string;
	suffix?: string;
	popoverInfo?: string;
	testId?: string;
	context: {
		mainWeaponId: MainWeaponId;
		abilityPoints: AbilityPoints;
		isComparing: boolean;
	};
}) {
	const { t } = useTranslation("analyzer");

	const isStaticValue = typeof stat === "number" || typeof stat === "string";
	const baseValue = isStaticValue ? stat : stat[0].baseValue;

	const showBuildValue = () => {
		if (isStaticValue) return false;
		if (isComparing) return true;

		// slightly hacky but handles the edge case
		// where baseValue === value which can happen when
		// you have Ninja Squid and stack swim speed
		// -> we still want to show the build value
		return [stat[0].modifiedBy].flat().some((ability) => {
			const hasStackable = (abilityPoints.get(ability) ?? 0) > 0;
			const hasEffect = baseValue !== stat[0].value;

			return hasEffect || hasStackable;
		});
	};

	const showComparison = isComparing && !isStaticValue;

	const isHighlighted = () => {
		if (!showComparison) return showBuildValue();

		return (
			stat[0].value !== stat[0].baseValue || stat[1].value !== stat[1].baseValue
		);
	};

	const memoKey = isStaticValue ? stat : stat[2];
	// biome-ignore lint/correctness/useExhaustiveDependencies: biome migration
	const modifiedBy = React.useMemo(() => {
		return isStaticValue ? [] : [stat[0].modifiedBy].flat();
	}, [memoKey]);

	return (
		<div
			className={clsx("analyzer__stat-card", {
				"analyzer__stat-card-highlighted": isHighlighted(),
			})}
			data-testid={testId}
		>
			<div className="analyzer__stat-card__title-and-value-container">
				<h3 className="analyzer__stat-card__title">
					{title}{" "}
					{popoverInfo && (
						<SendouPopover
							trigger={
								<SendouButton className="analyzer__stat-card__popover-trigger">
									?
								</SendouButton>
							}
						>
							{popoverInfo}
						</SendouPopover>
					)}
				</h3>
				<div className="analyzer__stat-card-values">
					<div className="analyzer__stat-card__value">
						<h4 className="analyzer__stat-card__value__title">
							{typeof stat === "number"
								? t("value")
								: showComparison
									? t("build1")
									: t("base")}
						</h4>{" "}
						<div
							className="analyzer__stat-card__value__number"
							data-testid={testId ? `${testId}-base` : undefined}
						>
							{showComparison ? (stat as StatTuple)[0].value : baseValue}
							{suffix}
						</div>
					</div>
					{showBuildValue() ? (
						<div className="analyzer__stat-card__value">
							<h4
								className="analyzer__stat-card__value__title"
								data-testid={testId ? `${testId}-build-title` : undefined}
							>
								{showComparison ? t("build2") : t("build")}
							</h4>{" "}
							<div className="analyzer__stat-card__value__number">
								{(stat as StatTuple)[showComparison ? 1 : 0].value}
								{suffix}
							</div>
						</div>
					) : null}
				</div>
			</div>
			{/* always render this so it reserves space */}
			<div className="analyzer__stat-card__ability-container">
				{!isStaticValue && (
					<>
						<ModifiedByAbilities abilities={stat[0].modifiedBy} />
						<StatChartPopover
							statKey={stat[2]}
							modifiedBy={modifiedBy}
							title={title}
							valueSuffix={suffix}
							mainWeaponId={mainWeaponId}
						/>
					</>
				)}
			</div>
		</div>
	);
}

function ModifiedByAbilities({ abilities }: { abilities: Stat["modifiedBy"] }) {
	const abilitiesArray = Array.isArray(abilities) ? abilities : [abilities];

	return (
		<div className="stack horizontal sm items-center justify-center">
			{abilitiesArray.map((ability) => (
				<Ability key={ability} ability={ability} size="SUBTINY" />
			))}
		</div>
	);
}

function DamageTable({
	values,
	comparisonValues,
	multiShots,
	showPopovers = false,
}: {
	values:
		| AnalyzedBuild["stats"]["damages"]
		| AnalyzedBuild["stats"]["subWeaponDefenseDamages"];
	comparisonValues?:
		| AnalyzedBuild["stats"]["damages"]
		| AnalyzedBuild["stats"]["subWeaponDefenseDamages"];
	multiShots?: AnalyzedBuild["weapon"]["multiShots"];
	showPopovers?: boolean;
}) {
	const { t } = useTranslation(["weapons", "analyzer"]);

	const showDistanceColumn = values.some((val) => val.distance);

	const firstRow = atOrError(values, 0);
	const showDamageColumn =
		!damageIsSubWeaponDamage(firstRow) ||
		// essentially checking that we are using some sub resistance up
		values.some((val) => val.value !== (val as any).baseValue);

	const renderedDamagesTypes = new Set<SubWeaponId>();
	const renderPopover = (damage: Damage, subWeaponId: SubWeaponId) => {
		if (damage.value >= 100) return false;
		if (renderedDamagesTypes.has(subWeaponId)) return false;

		renderedDamagesTypes.add(subWeaponId);

		return true;
	};

	const multiShotValues = (
		damage: AnalyzedBuild["stats"]["damages"][number],
	) => {
		// initially only Dread Wringer
		const isAsymmetric = values.some(
			(value) => value.type === "DIRECT_SECONDARY_MIN",
		);

		if (!isAsymmetric) return new Array(multiShots).fill(damage.value);

		const otherKey: DamageType =
			damage.type === "DIRECT_MAX"
				? "DIRECT_SECONDARY_MAX"
				: "DIRECT_SECONDARY_MIN";

		const secondaryDamage = values.find((value) => value.type === otherKey);
		invariant(secondaryDamage, "secondary damage not found");

		return [damage.value, secondaryDamage.value];
	};

	return (
		<>
			<Table>
				<thead>
					<tr>
						<th>{t("analyzer:damage.header.type")}</th>
						{showDistanceColumn && (
							<th>{t("analyzer:damage.header.distance")}</th>
						)}
						{damageIsSubWeaponDamage(firstRow) ? (
							<th>
								{comparisonValues
									? t("analyzer:damage.header.baseDamage.short")
									: t("analyzer:damage.header.baseDamage")}
							</th>
						) : null}
						{showDamageColumn && <th>{t("analyzer:damage.header.damage")}</th>}
						{showPopovers ? <th /> : null}
					</tr>
				</thead>
				<tbody>
					{values.map((val, i) => {
						if (val.type.includes("SECONDARY")) return null;

						const damage = (val: AnalyzedBuild["stats"]["damages"][number]) =>
							multiShots && damageTypeToWeaponType[val.type] === "MAIN"
								? multiShotValues(val).join(" + ")
								: val.value;

						const typeRowName = damageIsSubWeaponDamage(val)
							? (`weapons:SUB_${val.subWeaponId}` as const)
							: damageTypeTranslationString({
									damageType: val.type,
								});

						const comparisonVal = comparisonValues?.[i];

						return (
							<tr key={val.id}>
								<td className="stack horizontal xs items-center">
									{damageIsSubWeaponDamage(val) ? (
										<Image
											alt=""
											path={subWeaponImageUrl(val.subWeaponId)}
											width={12}
											height={12}
										/>
									) : null}{" "}
									{t(typeRowName as any)}{" "}
									{damageIsSubWeaponDamage(val) && val.type === "SPLASH" ? (
										<>({t("analyzer:damage.SPLASH")})</>
									) : null}
								</td>
								{showDistanceColumn && (
									<td>
										{typeof val.distance === "number"
											? val.distance
											: val.distance?.join("-")}
									</td>
								)}
								{damageIsSubWeaponDamage(val) && <td>{val.baseValue}</td>}
								{showDamageColumn && (
									<td>
										{damage(val)}
										{comparisonVal ? `/${damage(comparisonVal)}` : null}{" "}
										{val.shotsToSplat && (
											<span className="analyzer__shots-to-splat">
												{t("analyzer:damage.toSplat", {
													count: val.shotsToSplat,
												})}
											</span>
										)}
									</td>
								)}
								{showPopovers ? (
									<td>
										{renderPopover(
											val,
											(val as SubWeaponDamage).subWeaponId,
										) ? (
											<StatChartPopover
												mainWeaponId={0}
												modifiedBy={[]}
												subWeaponId={(val as SubWeaponDamage).subWeaponId}
												title={t(
													`weapons:SUB_${(val as SubWeaponDamage).subWeaponId}`,
												)}
												simple
												valueSuffix={` ${t(
													"analyzer:damageShort",
												).toLowerCase()}`}
											/>
										) : null}
									</td>
								) : null}
							</tr>
						);
					})}
				</tbody>
			</Table>
		</>
	);
}

function ConsumptionTable({
	isComparing,
	options,
	subWeaponId,
}: {
	isComparing: boolean;
	options: [
		AnalyzedBuild["stats"]["fullInkTankOptions"],
		AnalyzedBuild["stats"]["fullInkTankOptions"],
	];
	subWeaponId: SubWeaponId;
}) {
	const [options1, options2] = options;

	const { t } = useTranslation(["analyzer", "weapons"]);
	const maxSubsToUse =
		subWeaponId === TORPEDO_ID
			? 1
			: Math.max(...options.flat().map((opt) => opt.subsUsed));
	const types = Array.from(new Set(options1.map((opt) => opt.type)));

	return (
		<>
			<Table>
				<thead>
					<tr>
						<th>{t(`weapons:SUB_${subWeaponId}`)}</th>
						{types.map((type) => (
							<th key={type}>{t(`analyzer:stat.consumption.${type}`)}</th>
						))}
					</tr>
				</thead>
				<tbody>
					{new Array(maxSubsToUse + 1).fill(null).map((_, subsUsed) => {
						const options1ForThisSubsUsed = options1.filter(
							(opt) => opt.subsUsed === subsUsed,
						);
						const options2ForThisSubsUsed = options2.filter(
							(opt) => opt.subsUsed === subsUsed,
						);

						const cells: React.ReactNode[] = [];

						// weird using basic for loop in react code but here we are essentially
						// zipping these two arrays into one cell and if one of the arrays
						// doesn't have value then it shows as a dash instead
						for (
							let i = 0;
							i <
							Math.max(
								options1ForThisSubsUsed.length,
								options2ForThisSubsUsed.length,
							);
							i++
						) {
							const opt1 = options1ForThisSubsUsed[i];
							const opt2 = options2ForThisSubsUsed[i];

							const contents = () => {
								if (isComparing) {
									return `${opt1?.value ?? "-"}/${opt2?.value ?? "-"}`;
								}

								if (!opt2 || opt1.value !== opt2.value) {
									return `${opt2?.value ?? "-"} ► ${opt1.value}`;
								}

								return opt1.value;
							};

							cells.push(<td key={opt1?.id ?? opt2.id}>{contents()}</td>);
						}

						return (
							<tr key={subsUsed}>
								<td>×{subsUsed}</td>
								{cells}
							</tr>
						);
					})}
				</tbody>
			</Table>
			{subWeaponId === TORPEDO_ID && (
				<div className="analyzer__consumption-table-explanation">
					{t("analyzer:torpedoExplanation")}
				</div>
			)}
		</>
	);
}
