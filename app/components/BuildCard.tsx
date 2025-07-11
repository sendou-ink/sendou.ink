import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import type { GearType, Tables, UserWithPlusTier } from "~/db/tables";
import { useUser } from "~/features/auth/core/user";
import type { BuildWeaponWithTop500Info } from "~/features/builds/queries/buildsBy.server";
import { useIsMounted } from "~/hooks/useIsMounted";
import type {
	Ability as AbilityType,
	BuildAbilitiesTuple,
	ModeShort,
} from "~/modules/in-game-lists/types";
import { altWeaponIdToId } from "~/modules/in-game-lists/weapon-ids";
import { databaseTimestampToDate } from "~/utils/dates";
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
import { FormWithConfirm } from "./FormWithConfirm";
import { Image } from "./Image";
import { EditIcon } from "./icons/Edit";
import { LockIcon } from "./icons/Lock";
import { SpeechBubbleIcon } from "./icons/SpeechBubble";
import { TrashIcon } from "./icons/Trash";

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
		| "private"
	> & {
		abilities: BuildAbilitiesTuple;
		unsortedAbilities: BuildAbilitiesTuple;
		modes: ModeShort[] | null;
		weapons: Array<{
			weaponSplId: Tables["BuildWeapon"]["weaponSplId"];
			minRank: number | null;
			maxPower: number | null;
		}>;
	};
	owner?: Pick<UserWithPlusTier, "discordId" | "username" | "plusTier">;
	canEdit?: boolean;
	withAbilitySorting?: boolean;
}

export function BuildCard({
	build,
	owner,
	canEdit = false,
	withAbilitySorting = true,
}: BuildProps) {
	const user = useUser();
	const { t } = useTranslation(["weapons", "builds", "common", "game-misc"]);
	const { i18n } = useTranslation();
	const isMounted = useIsMounted();

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
	} = build;

	const abilities = withAbilitySorting
		? build.abilities
		: build.unsortedAbilities;

	const isNoGear = [headGearSplId, clothesGearSplId, shoesGearSplId].some(
		(id) => id === -1,
	);

	return (
		<div
			className={clsx(styles.card, { [styles.private]: build.private })}
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
					{owner && (
						<>
							<Link to={userBuildsPage(owner)} className={styles.ownerLink}>
								{owner.username}
							</Link>
							<div>•</div>
						</>
					)}
					{owner?.plusTier ? (
						<>
							<span>+{owner.plusTier}</span>
							<div>•</div>
						</>
					) : null}
					<div className="stack horizontal sm">
						{build.private ? (
							<div className={styles.privateText}>
								<LockIcon className={styles.privateIcon} />{" "}
								{t("common:build.private")}
							</div>
						) : null}
						<time
							className={clsx("whitespace-nowrap", { invisible: !isMounted })}
						>
							{isMounted
								? databaseTimestampToDate(updatedAt).toLocaleDateString(
										i18n.language,
										{
											day: "numeric",
											month: "long",
											year: "numeric",
										},
									)
								: "t"}
						</time>
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
				<Link
					to={analyzerPage({
						weaponId: weapons[0].weaponSplId,
						abilities: abilities.flat(),
					})}
				>
					<Image
						alt={t("common:pages.analyzer")}
						className={styles.icon}
						path={navIconUrl("analyzer")}
					/>
				</Link>
				{description ? (
					<SendouPopover
						trigger={
							<SendouButton
								variant="minimal"
								icon={<SpeechBubbleIcon />}
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
							className={styles.smallText}
							variant="minimal"
							size="small"
							to={`new?buildId=${id}&userId=${user!.id}`}
							testId="edit-build"
						>
							<EditIcon className={styles.icon} />
						</LinkButton>
						<FormWithConfirm
							dialogHeading={t("builds:deleteConfirm", { title })}
							fields={[
								["buildToDeleteId", id],
								["_action", "DELETE_BUILD"],
							]}
						>
							<SendouButton
								icon={<TrashIcon className={styles.icon} />}
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

function RoundWeaponImage({ weapon }: { weapon: BuildWeaponWithTop500Info }) {
	const { weaponSplId, maxPower, minRank } = weapon;
	const normalizedWeaponSplId = altWeaponIdToId.get(weaponSplId) ?? weaponSplId;

	const { t } = useTranslation(["weapons"]);
	const slug = mySlugify(
		t(`weapons:MAIN_${normalizedWeaponSplId}`, { lng: "en" }),
	);

	const isTop500 = typeof maxPower === "number" && typeof minRank === "number";

	return (
		<div key={weaponSplId} className={styles.weapon}>
			{isTop500 ? (
				<Image
					className={styles.top500}
					path={navIconUrl("xsearch")}
					alt=""
					title={`Max X Power: ${maxPower} | Best Rank: ${minRank}`}
					height={24}
					width={24}
					testId="top500-crown"
				/>
			) : null}
			<Link to={weaponBuildPage(slug)}>
				<Image
					path={mainWeaponImageUrl(weaponSplId)}
					alt={t(`weapons:MAIN_${weaponSplId}` as any)}
					title={t(`weapons:MAIN_${weaponSplId}` as any)}
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
	gearId: number;
}) {
	const { t } = useTranslation(["gear"]);
	const translatedGearName = t(
		`gear:${gearTypeToInitial(gearType)}_${gearId}` as any,
	);

	return (
		<>
			{gearId !== -1 ? (
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
