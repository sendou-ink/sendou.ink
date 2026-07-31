import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { Ability } from "~/components/Ability";
import { Image, ModeImage, WeaponImage } from "~/components/Image";
import { LocaleTime } from "~/components/LocaleTime";
import type { Tables } from "~/db/tables";
import type { BuildWeaponWithTop500Info } from "~/features/builds/builds-types";
import type {
	Ability as AbilityType,
	BuildAbilitiesTuple,
	GearType,
	ModeShort,
} from "~/modules/in-game-lists/types";
import {
	discordAvatarUrl,
	gearImageUrl,
	navIconUrl,
	userBuildsPage,
} from "~/utils/urls";
import styles from "./BuildGraphic.module.css";
import {
	GRAPHIC_DATE_FORMAT_OPTIONS,
	GraphicContainer,
	GraphicFooter,
	GraphicHeader,
	GraphicSiteUrl,
} from "./Graphic";
import graphicStyles from "./Graphic.module.css";

const BUILD_GRAPHIC_WIDTH = 520;

export interface BuildGraphicOwner {
	username: string;
	discordId: string;
	plusTier: number | null;
	customUrl?: Tables["User"]["customUrl"];
	discordAvatar?: Tables["User"]["discordAvatar"];
	customAvatarUrl?: string | null;
}

// xxx: remove card below abilities
// xxx: top 500 abilities off align
// xxx: show aps below abilities
// xxx: less width
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
								<ModeImage key={mode} mode={mode} size={22} />
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
				className={clsx(graphicStyles.box, styles.gearGrid, {
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
			{build.description ? (
				<div className={clsx(graphicStyles.box, styles.description)}>
					{build.description}
				</div>
			) : null}
			<GraphicFooter>
				<div />
				<GraphicSiteUrl path={userBuildsPage(owner)} />
			</GraphicFooter>
		</GraphicContainer>
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
					height={56}
					width={56}
					alt=""
					path={gearImageUrl(gearType, gearId)}
					className={styles.gear}
				/>
			) : null}
			{abilities.map((ability, index) => (
				<Ability
					key={index}
					ability={ability}
					size={index === 0 ? "MAIN" : "SUB"}
				/>
			))}
		</>
	);
}
