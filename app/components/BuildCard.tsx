import clsx from "clsx";
import {
	Download,
	Lock,
	MessageCircleMore,
	Pencil,
	Trash2,
} from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import type { Tables } from "~/db/tables";
import { analyzerPage } from "~/features/build-analyzer/analyzer-urls";
import type { BuildWeaponWithTop500Info } from "~/features/builds/builds-types";
import * as Patches from "~/features/builds/core/patches";
import {
	BuildGraphic,
	type BuildGraphicOwner,
} from "~/features/img-export/components/BuildGraphic";
import { ImageExportDialog } from "~/features/img-export/components/ImageExportDialog";
import { userEditBuildPage } from "~/features/user-page/user-page-urls";
import type {
	Ability as AbilityType,
	BuildAbilitiesTuple,
	GearType,
	ModeShort,
} from "~/modules/in-game-lists/types";
import { canonicalWeaponSplId } from "~/modules/in-game-lists/weapon-ids";
import { weaponSlug } from "~/utils/english-weapon-names";
import type { UserWithPlusTier } from "~/utils/kysely.server";
import { gearTypeToInitial } from "~/utils/strings";
import {
	abilityImageUrl,
	gearImageUrl,
	modeImageUrl,
	mySlugify,
	navIconUrl,
	userBuildsPage,
	weaponBuildPage,
} from "~/utils/urls";
import { Avatar } from "./Avatar";
import styles from "./BuildCard.module.css";
import { CircleBackdrop } from "./CircleBackdrop";
import { LinkButton, SendouButton } from "./elements/Button";
import { SendouPopover } from "./elements/Popover";
import { SendouSwitch } from "./elements/Switch";
import { FormWithConfirm } from "./FormWithConfirm";
import { Image, WeaponImage } from "./Image";
import { ListLink } from "./ListItem";
import { LocaleTime } from "./LocaleTime";

const MAX_SMALL_WEAPONS = 1;

export interface BuildCardProps {
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
	owner?: Pick<UserWithPlusTier, "id" | "username" | "plusTier"> &
		Partial<Pick<BuildGraphicOwner, "customUrl" | "avatar">>;
	/** false when the page already shows the owner (e.g. their own builds page) */
	showOwner?: boolean;
	/** Shown at the end of the owner row */
	ownerAction?: React.ReactNode;
	canEdit?: boolean;
}

export function BuildCard({
	build,
	owner,
	showOwner = true,
	ownerAction,
	canEdit = false,
}: BuildCardProps) {
	const { t } = useTranslation([
		"weapons",
		"builds",
		"common",
		"game-misc",
		"forms",
	]);

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

	const patch = Patches.ofTimestamp(updatedAt);
	const isOwnerShown = Boolean(owner && showOwner);
	const [mainWeapon, ...otherWeapons] = weapons;

	return (
		<div className={styles.card} data-testid="build-card">
			<div className={styles.bar}>
				{modes && modes.length > 0 ? (
					<div className={styles.modes}>
						{modes.map((mode) => (
							<Image
								key={mode}
								alt={t(`game-misc:MODE_LONG_${mode}` as any)}
								title={t(`game-misc:MODE_LONG_${mode}` as any)}
								path={modeImageUrl(mode)}
								containerClassName={styles.mode}
								className={styles.modeImage}
								testId={`build-mode-${mode}`}
							/>
						))}
					</div>
				) : null}
				{patch ? (
					<SendouPopover
						trigger={
							<button type="button" className={styles.patch}>
								{patch}
							</button>
						}
					>
						<LocaleTime
							date={updatedAt}
							options={{
								day: "numeric",
								month: "long",
								year: "numeric",
							}}
						/>
					</SendouPopover>
				) : null}
			</div>
			<div className={styles.header}>
				<BuildWeapons weapons={isOwnerShown ? weapons : [mainWeapon]} />
				<div className={styles.titleBlock}>
					<div className={styles.title}>
						<h2 className={styles.titleText} data-testid="build-title">
							{title}
						</h2>
						{build.isPrivate ? (
							<SendouPopover
								trigger={
									<button
										type="button"
										className={styles.privateButton}
										data-testid="build-private"
										aria-label={t("common:build.private")}
									>
										<Lock />
									</button>
								}
							>
								{t("forms:bottomTexts.buildPrivate")}
							</SendouPopover>
						) : null}
					</div>
					<div className={styles.details}>
						{owner && isOwnerShown ? (
							<div className={styles.owner}>
								<Link to={userBuildsPage(owner)} className={styles.ownerLink}>
									<Avatar
										user={{ id: owner.id, avatar: owner.avatar ?? null }}
										size="xxxs"
									/>
									<span className="truncate">{owner.username}</span>
								</Link>
								{owner.plusTier ? (
									<span className={styles.plusTier}>
										<Image
											path={navIconUrl("plus")}
											alt={t("common:pages.plus")}
											title={t("common:pages.plus")}
											size={14}
										/>
										{owner.plusTier}
									</span>
								) : null}
								{ownerAction}
							</div>
						) : otherWeapons.length > 0 ? (
							<div className={styles.otherWeapons}>
								{otherWeapons.map((weapon) => (
									<RoundWeaponImage
										key={weapon.weaponSplId}
										weapon={weapon}
										isSmall
									/>
								))}
							</div>
						) : null}
					</div>
				</div>
			</div>
			<div className={styles.gearAbilities}>
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
			<div className={styles.actions}>
				<LinkButton
					to={analyzerPage({
						weaponId: weapons[0].weaponSplId,
						abilities: abilities.flat(),
					})}
					shape="circle"
					variant="minimal"
					className={styles.action}
				>
					<Image
						size={20}
						alt={t("common:pages.analyzer")}
						path={navIconUrl("analyzer")}
					/>
				</LinkButton>
				{owner ? <BuildImageExportDialog build={build} owner={owner} /> : null}
				{description ? (
					<SendouPopover
						trigger={
							<SendouButton
								shape="circle"
								variant="minimal"
								icon={<MessageCircleMore />}
								className={styles.action}
								aria-label="Description"
							/>
						}
					>
						{description}
					</SendouPopover>
				) : null}
				{canEdit && owner ? (
					<>
						<LinkButton
							shape="circle"
							variant="minimal"
							className={styles.action}
							to={userEditBuildPage(owner, id)}
							testId="edit-build"
							icon={<Pencil />}
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
								icon={<Trash2 />}
								className={clsx(styles.action, styles.actionDestructive)}
								variant="minimal-destructive"
								type="submit"
								testId="delete-build"
							/>
						</FormWithConfirm>
					</>
				) : null}
			</div>
		</div>
	);
}

function BuildImageExportDialog({
	build,
	owner,
}: {
	build: BuildCardProps["build"];
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
					variant="minimal"
					icon={<Download />}
					className={styles.action}
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

function BuildWeapons({
	weapons,
}: {
	weapons: Array<BuildWeaponWithTop500Info>;
}) {
	const [mainWeapon, ...otherWeapons] = weapons;
	const isOverflowing = otherWeapons.length > MAX_SMALL_WEAPONS;
	const shownOtherWeapons = isOverflowing
		? otherWeapons.slice(0, MAX_SMALL_WEAPONS - 1)
		: otherWeapons;

	return (
		<div className={styles.weapons}>
			<RoundWeaponImage weapon={mainWeapon} />
			{otherWeapons.length > 0 ? (
				<div className={styles.smallWeapons}>
					{shownOtherWeapons.map((weapon) => (
						<RoundWeaponImage
							key={weapon.weaponSplId}
							weapon={weapon}
							isSmall
						/>
					))}
					{isOverflowing ? (
						<SendouPopover
							trigger={
								<button
									type="button"
									className={styles.moreWeapons}
									aria-label="Show all weapons"
								>
									{otherWeapons.length - shownOtherWeapons.length}
								</button>
							}
						>
							<AllWeaponsList weapons={weapons} />
						</SendouPopover>
					) : null}
				</div>
			) : null}
		</div>
	);
}

function AllWeaponsList({
	weapons,
}: {
	weapons: Array<BuildWeaponWithTop500Info>;
}) {
	const { t } = useTranslation(["weapons"]);

	return (
		<div className={styles.allWeapons}>
			{weapons.map((weapon) => (
				<ListLink
					key={weapon.weaponSplId}
					to={weaponBuildPageUrl(weapon)}
					icon={<WeaponCircle weapon={weapon} />}
				>
					{t(`weapons:MAIN_${weapon.weaponSplId}` as any)}
				</ListLink>
			))}
		</div>
	);
}

function RoundWeaponImage({
	weapon,
	isSmall = false,
}: {
	weapon: BuildWeaponWithTop500Info;
	isSmall?: boolean;
}) {
	const { t } = useTranslation(["weapons"]);

	return (
		<Link
			to={weaponBuildPageUrl(weapon)}
			title={t(`weapons:MAIN_${weapon.weaponSplId}` as any)}
			className={styles.weaponLink}
		>
			<WeaponCircle weapon={weapon} isSmall={isSmall} />
		</Link>
	);
}

function WeaponCircle({
	weapon,
	isSmall = false,
}: {
	weapon: BuildWeaponWithTop500Info;
	isSmall?: boolean;
}) {
	return (
		<div className={clsx(styles.weapon, { [styles.weaponSmall]: isSmall })}>
			{weapon.isTop500 ? (
				<Image
					className={styles.top500}
					path={navIconUrl("xsearch")}
					alt=""
					size={isSmall ? 10 : 14}
					testId="top500-crown"
				/>
			) : null}
			<CircleBackdrop bordered className={styles.weaponBackdrop}>
				<WeaponImage
					weaponSplId={weapon.weaponSplId}
					variant="build"
					size={32}
				/>
			</CircleBackdrop>
		</div>
	);
}

function weaponBuildPageUrl(weapon: BuildWeaponWithTop500Info) {
	return weaponBuildPage(
		weaponSlug({ type: "MAIN", id: canonicalWeaponSplId(weapon.weaponSplId) }),
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
		<div className={styles.gearRow}>
			{typeof gearId === "number" ? (
				<CircleBackdrop bordered className={styles.gearBackdrop}>
					<Image
						size={48}
						alt={translatedGearName}
						title={translatedGearName}
						path={gearImageUrl(gearType, gearId)}
					/>
				</CircleBackdrop>
			) : null}
			{abilities.map((ability, i) => (
				<AbilityIcon key={i} ability={ability} isMain={i === 0} />
			))}
		</div>
	);
}

function AbilityIcon({
	ability,
	isMain,
}: {
	ability: AbilityType;
	isMain: boolean;
}) {
	const { t } = useTranslation(["game-misc"]);
	const name = t(`game-misc:ABILITY_${ability}`);

	return (
		<div
			className={clsx(styles.ability, { [styles.abilityMain]: isMain })}
			data-testid={`${ability}-ability`}
		>
			<Image
				alt={name}
				title={name}
				path={abilityImageUrl(ability)}
				className={styles.abilityImage}
			/>
		</div>
	);
}
