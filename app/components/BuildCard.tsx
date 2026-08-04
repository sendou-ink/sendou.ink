import clsx from "clsx";
import {
	HardDriveDownload,
	Lock,
	MessageCircleMore,
	SquarePen,
	Trash,
} from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import type { Tables } from "~/db/tables";
import { useUser } from "~/features/auth/core/user";
import type { BuildWeaponWithTop500Info } from "~/features/builds/builds-types";
import {
	BuildGraphic,
	type BuildGraphicOwner,
} from "~/features/img-export/components/BuildGraphic";
import { ImageExportDialog } from "~/features/img-export/components/ImageExportDialog";
import type {
	Ability as AbilityType,
	BuildAbilitiesTuple,
	GearType,
	ModeShort,
} from "~/modules/in-game-lists/types";
import { canonicalWeaponSplId } from "~/modules/in-game-lists/weapon-ids";
import type { UserWithPlusTier } from "~/utils/kysely.server";
import { gearTypeToInitial } from "~/utils/strings";
import {
	analyzerPage,
	gearImageUrl,
	mainWeaponImageUrl,
	modeImageUrl,
	mySlugify,
	navIconUrl,
	userBuildsPage,
	weaponBuildPage,
} from "~/utils/urls";
import { Ability } from "./Ability";
import styles from "./BuildCard.module.css";
import { LinkButton, SendouButton } from "./elements/Button";
import { SendouPopover } from "./elements/Popover";
import { SendouSwitch } from "./elements/Switch";
import { FormWithConfirm } from "./FormWithConfirm";
import { Image } from "./Image";
import { LocaleTime } from "./LocaleTime";

interface BuildProps {
	build: Pick<
		Tables["Build"],
		| "id"
		| "title"
		| "description"
		| "clothesGearSplId"
		| "headGearSplId"
		| "shoesGearSplId"
		| "updatedAt"
		| "isPrivate"
	> & {
		abilities: BuildAbilitiesTuple;
		modes: ModeShort[] | null;
		weapons: Array<BuildWeaponWithTop500Info>;
	};
	owner?: Pick<UserWithPlusTier, "discordId" | "username" | "plusTier"> &
		Partial<
			Pick<BuildGraphicOwner, "customUrl" | "discordAvatar" | "customAvatarUrl">
		>;
	/** Set to false when the page context already shows the owner (e.g. their own builds page) */
	showOwner?: boolean;
	canEdit?: boolean;
}

export function BuildCard({
	build,
	owner,
	showOwner = true,
	canEdit = false,
}: BuildProps) {
	const user = useUser();
	const { t } = useTranslation(["weapons", "builds", "common", "game-misc"]);

	const {
		id,
		title,
		description,
		clothesGearSplId,
		headGearSplId,
		shoesGearSplId,
		updatedAt,
		modes,
		weapons,
		abilities,
	} = build;

	const isNoGear = [headGearSplId, clothesGearSplId, shoesGearSplId].some(
		(id) => typeof id !== "number",
	);

	return (
		<div
			className={clsx(styles.card, { [styles.private]: build.isPrivate })}
			data-testid="build-card"
		>
			<div>
				<div className={styles.topRow}>
					{modes && modes.length > 0 && (
						<div className={styles.modes}>
							{modes.map((mode) => (
								<Image
									key={mode}
									alt={t(`game-misc:MODE_LONG_${mode}` as any)}
									title={t(`game-misc:MODE_LONG_${mode}` as any)}
									path={modeImageUrl(mode)}
									width={18}
									height={18}
									testId={`build-mode-${mode}`}
								/>
							))}
						</div>
					)}
					<h2 className={styles.title} data-testid="build-title">
						{title}
					</h2>
				</div>
				<div className={styles.dateAuthorRow}>
					{owner && showOwner ? (
						<>
							<Link to={userBuildsPage(owner)} className={styles.ownerLink}>
								{owner.username}
							</Link>
							<div>•</div>
						</>
					) : null}
					{owner?.plusTier && showOwner ? (
						<>
							<span>+{owner.plusTier}</span>
							<div>•</div>
						</>
					) : null}
					<div className="stack horizontal sm items-center">
						{build.isPrivate ? (
							<div className={styles.privateText}>
								<Lock size={16} /> {t("common:build.private")}
							</div>
						) : null}
						<LocaleTime
							date={updatedAt}
							options={{
								day: "numeric",
								month: "numeric",
								year: "numeric",
							}}
							className="whitespace-nowrap"
						/>
					</div>
				</div>
			</div>
			<div className={styles.weapons}>
				{weapons.map((weapon) => (
					<RoundWeaponImage key={weapon.weaponSplId} weapon={weapon} />
				))}
				{weapons.length === 1 && (
					<div className={styles.weaponText}>
						{t(`weapons:MAIN_${weapons[0].weaponSplId}` as any)}
					</div>
				)}
			</div>
			<div
				className={clsx(styles.gearAbilities, {
					[styles.noGear]: isNoGear,
				})}
			>
				<AbilitiesRowWithGear
					gearType="HEAD"
					abilities={abilities[0]}
					gearId={headGearSplId}
				/>
				<AbilitiesRowWithGear
					gearType="CLOTHES"
					abilities={abilities[1]}
					gearId={clothesGearSplId}
				/>
				<AbilitiesRowWithGear
					gearType="SHOES"
					abilities={abilities[2]}
					gearId={shoesGearSplId}
				/>
			</div>
			<div className={styles.bottomRow}>
				<LinkButton
					to={analyzerPage({
						weaponId: weapons[0].weaponSplId,
						abilities: abilities.flat(),
					})}
					shape="circle"
					variant="minimal"
					size="small"
				>
					<Image
						size={24}
						alt={t("common:pages.analyzer")}
						className={styles.icon}
						path={navIconUrl("analyzer")}
					/>
				</LinkButton>
				{owner ? <BuildImageExportDialog build={build} owner={owner} /> : null}
				{description ? (
					<SendouPopover
						trigger={
							<SendouButton
								shape="circle"
								size="small"
								variant="minimal"
								icon={<MessageCircleMore />}
								className={styles.smallText}
							/>
						}
					>
						{description}
					</SendouPopover>
				) : null}
				{canEdit && (
					<>
						<LinkButton
							shape="circle"
							className={styles.smallText}
							variant="minimal"
							size="small"
							to={`new?buildId=${id}&userId=${user!.id}`}
							testId="edit-build"
							icon={<SquarePen />}
						/>
						<FormWithConfirm
							dialogHeading={t("builds:deleteConfirm", { title })}
							fields={[
								["buildToDeleteId", id],
								["_action", "DELETE_BUILD"],
							]}
						>
							<SendouButton
								shape="circle"
								size="small"
								icon={<Trash />}
								className={styles.smallText}
								variant="minimal-destructive"
								type="submit"
							/>
						</FormWithConfirm>
					</>
				)}
			</div>
		</div>
	);
}

function BuildImageExportDialog({
	build,
	owner,
}: {
	build: BuildProps["build"];
	owner: BuildGraphicOwner;
}) {
	const { t } = useTranslation(["common"]);
	const [showTitle, setShowTitle] = React.useState(true);
	const [showAbilityPoints, setShowAbilityPoints] = React.useState(true);
	const [showAbilityChunks, setShowAbilityChunks] = React.useState(false);

	return (
		<ImageExportDialog
			trigger={
				<SendouButton
					shape="circle"
					size="small"
					variant="minimal"
					icon={<HardDriveDownload />}
					className={styles.smallText}
					aria-label={t("common:imageExport.export")}
				/>
			}
			heading={t("common:imageExport.export")}
			filename={`build-${mySlugify(build.title)}`}
			qrCodePath={analyzerPage({
				weaponId: build.weapons[0].weaponSplId,
				abilities: build.abilities.flat(),
			})}
			settings={
				<>
					<SendouSwitch isSelected={showTitle} onChange={setShowTitle}>
						{t("common:imageExport.buildTitle")}
					</SendouSwitch>
					<SendouSwitch
						isSelected={showAbilityPoints}
						onChange={setShowAbilityPoints}
					>
						{t("common:imageExport.abilityPoints")}
					</SendouSwitch>
					<SendouSwitch
						isSelected={showAbilityChunks}
						onChange={setShowAbilityChunks}
					>
						{t("common:imageExport.abilityChunks")}
					</SendouSwitch>
				</>
			}
		>
			<BuildGraphic
				build={build}
				owner={owner}
				showTitle={showTitle}
				showAbilityPoints={showAbilityPoints}
				showAbilityChunks={showAbilityChunks}
			/>
		</ImageExportDialog>
	);
}

function RoundWeaponImage({ weapon }: { weapon: BuildWeaponWithTop500Info }) {
	const normalizedWeaponSplId = canonicalWeaponSplId(weapon.weaponSplId);

	const { t } = useTranslation(["weapons"]);
	const slug = mySlugify(
		t(`weapons:MAIN_${normalizedWeaponSplId}`, { lng: "en" }),
	);

	return (
		<div key={weapon.weaponSplId} className={styles.weapon}>
			{weapon.isTop500 ? (
				<Image
					className={styles.top500}
					path={navIconUrl("xsearch")}
					alt=""
					height={24}
					width={24}
					testId="top500-crown"
				/>
			) : null}
			<Link to={weaponBuildPage(slug)}>
				<Image
					path={mainWeaponImageUrl(weapon.weaponSplId)}
					alt={t(`weapons:MAIN_${weapon.weaponSplId}`)}
					title={t(`weapons:MAIN_${weapon.weaponSplId}`)}
					height={36}
					width={36}
				/>
			</Link>
		</div>
	);
}

function AbilitiesRowWithGear({
	gearType,
	abilities,
	gearId,
}: {
	gearType: GearType;
	abilities: AbilityType[];
	gearId: number | null;
}) {
	const { t } = useTranslation(["gear"]);
	const translatedGearName = t(
		`gear:${gearTypeToInitial(gearType)}_${gearId}` as any,
	);

	return (
		<>
			{typeof gearId === "number" ? (
				<Image
					height={64}
					width={64}
					alt={translatedGearName}
					title={translatedGearName}
					path={gearImageUrl(gearType, gearId)}
					className={styles.gear}
				/>
			) : null}
			{abilities.map((ability, i) => (
				<Ability key={i} ability={ability} size={i === 0 ? "MAIN" : "SUB"} />
			))}
		</>
	);
}
