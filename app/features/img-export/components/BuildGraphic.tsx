import clsx from "clsx";
import { useTranslation } from "react-i18next";
import * as R from "remeda";
import { Ability } from "~/components/Ability";
import { Image, ModeImage, WeaponImage } from "~/components/Image";
import { LocaleTime } from "~/components/LocaleTime";
import type { Tables } from "~/db/tables";
import {
	buildToAbilityPoints,
	isMainOnlyAbility,
} from "~/features/build-analyzer/core/utils";
import type { BuildWeaponWithTop500Info } from "~/features/builds/builds-types";
import type {
	Ability as AbilityType,
	BuildAbilitiesTuple,
	GearType,
	ModeShort,
} from "~/modules/in-game-lists/types";
import { discordAvatarUrl, gearImageUrl, navIconUrl } from "~/utils/urls";
import styles from "./BuildGraphic.module.css";
import {
	GRAPHIC_DATE_FORMAT_OPTIONS,
	GraphicContainer,
	GraphicHeader,
} from "./Graphic";
import graphicStyles from "./Graphic.module.css";

const BUILD_GRAPHIC_WIDTH = 380;
const STACKED_ABILITY_MIN_AP = 10;

export interface BuildGraphicOwner {
	username: string;
	discordId: string;
	plusTier: number | null;
	customUrl?: Tables["User"]["customUrl"];
	discordAvatar?: Tables["User"]["discordAvatar"];
	customAvatarUrl?: string | null;
}

export function BuildGraphic({
	build,
	owner,
}: {
	build: Pick<
		Tables["Build"],
		| "title"
		| "description"
		| "clothesGearSplId"
		| "headGearSplId"
		| "shoesGearSplId"
		| "updatedAt"
	> & {
		abilities: BuildAbilitiesTuple;
		modes: ModeShort[] | null;
		weapons: Array<BuildWeaponWithTop500Info>;
	};
	owner: BuildGraphicOwner;
}) {
	const { t } = useTranslation(["weapons", "game-misc"]);

	const isNoGear = [
		build.headGearSplId,
		build.clothesGearSplId,
		build.shoesGearSplId,
	].some((id) => typeof id !== "number");

	return (
		<GraphicContainer width={BUILD_GRAPHIC_WIDTH}>
			<GraphicHeader
				avatarUrl={
					owner.customAvatarUrl ??
					(owner.discordAvatar
						? discordAvatarUrl({
								discordId: owner.discordId,
								discordAvatar: owner.discordAvatar,
								size: "lg",
							})
						: undefined)
				}
				identiconInput={owner.username}
				titleRow={
					<span className={graphicStyles.headerTitle}>
						{owner.username}
						{owner.plusTier ? (
							<span className={styles.plusTier}> +{owner.plusTier}</span>
						) : null}
					</span>
				}
				subtitle={
					<LocaleTime
						date={build.updatedAt}
						options={GRAPHIC_DATE_FORMAT_OPTIONS}
						className={graphicStyles.headerSubtitle}
					/>
				}
				trailing={
					build.modes && build.modes.length > 0
						? build.modes.map((mode) => (
								<ModeImage key={mode} mode={mode} size={24} />
							))
						: undefined
				}
			/>
			<div className={styles.buildTitle}>{build.title}</div>
			<div className={styles.weaponsRow}>
				{build.weapons.map((weapon) => (
					<div key={weapon.weaponSplId} className={styles.weapon}>
						{weapon.isTop500 ? (
							<Image
								className={styles.top500}
								path={navIconUrl("xsearch")}
								alt=""
								height={26}
								width={26}
							/>
						) : null}
						<WeaponImage
							weaponSplId={weapon.weaponSplId}
							variant="badge"
							size={64}
						/>
					</div>
				))}
				{build.weapons.length === 1 ? (
					<div className={styles.weaponName}>
						{t(`weapons:MAIN_${build.weapons[0].weaponSplId}` as any)}
					</div>
				) : null}
			</div>
			<div
				className={clsx(styles.gearGrid, {
					[styles.noGear]: isNoGear,
				})}
			>
				<GearRow
					gearType="HEAD"
					abilities={build.abilities[0]}
					gearId={build.headGearSplId}
				/>
				<GearRow
					gearType="CLOTHES"
					abilities={build.abilities[1]}
					gearId={build.clothesGearSplId}
				/>
				<GearRow
					gearType="SHOES"
					abilities={build.abilities[2]}
					gearId={build.shoesGearSplId}
				/>
			</div>
			<AbilityPointsSummary abilities={build.abilities} />
			{build.description ? (
				<div className={styles.description}>{build.description}</div>
			) : null}
		</GraphicContainer>
	);
}

function AbilityPointsSummary({
	abilities,
}: {
	abilities: BuildAbilitiesTuple;
}) {
	const { t } = useTranslation(["game-misc", "analyzer"]);

	const mainOnlyAbilities = abilities
		.map((row) => row[0])
		.filter((ability) => isMainOnlyAbility(ability));

	const [stackedAbilities, sprinkledAbilities] = R.pipe(
		Array.from(buildToAbilityPoints(abilities)),
		R.sortBy(([, abilityPoints]) => -abilityPoints),
		R.map(
			([ability, abilityPoints]) =>
				[
					abilityPoints,
					`${abilityPoints}${t("analyzer:abilityPoints.short")} ${ability}`,
				] as const,
		),
		R.partition(([abilityPoints]) => abilityPoints >= STACKED_ABILITY_MIN_AP),
	);

	const rows = [
		mainOnlyAbilities.map((ability) =>
			t(`game-misc:ABILITY_${ability}` as any),
		),
		stackedAbilities.map(([, text]) => text),
		sprinkledAbilities.map(([, text]) => text),
	].filter((row) => row.length > 0);

	return (
		<div className={styles.abilityPoints}>
			{rows.map((row) => (
				<div key={row.join()}>{row.join(" / ")}</div>
			))}
		</div>
	);
}

function GearRow({
	gearType,
	abilities,
	gearId,
}: {
	gearType: GearType;
	abilities: AbilityType[];
	gearId: number | null;
}) {
	return (
		<>
			{typeof gearId === "number" ? (
				<Image
					height={80}
					width={80}
					alt=""
					path={gearImageUrl(gearType, gearId)}
					className={styles.gear}
				/>
			) : null}
			{abilities.map((ability, index) => (
				<Ability
					key={index}
					ability={ability}
					size={index === 0 ? "HUGE" : "MAIN"}
				/>
			))}
		</>
	);
}
