import clsx from "clsx";
import React, { type JSX } from "react";
import { Button } from "react-aria-components";
import { useTranslation } from "react-i18next";
import type { MetaFunction, ShouldRevalidateFunction } from "react-router";
import { Ability } from "~/components/Ability";
import { SendouPopover } from "~/components/elements/Popover";
import { SendouSwitch } from "~/components/elements/Switch";
import { Image, WeaponImage } from "~/components/Image";
import { Label } from "~/components/Label";
import { Main } from "~/components/Main";
import { WeaponSelect } from "~/components/WeaponSelect";
import type { DamageType } from "~/features/build-analyzer/analyzer-types";
import { possibleApValues } from "~/features/build-analyzer/core/utils";
import {
	BIG_BUBBLER_ID,
	BOOYAH_BOMB_ID,
	CRAB_TANK_ID,
	INK_VAC_ID,
	SPLASH_WALL_ID,
	SPRINKLER_ID,
	SQUID_BEAKON_ID,
	SUPER_CHUMP_ID,
	TORPEDO_ID,
	TRIPLE_SPLASHDOWN_ID,
	WAVE_BREAKER_ID,
} from "~/modules/in-game-lists/weapon-ids";
import { roundToNDecimalPlaces } from "~/utils/number";
import { metaTags } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import {
	mainWeaponImageUrl,
	mainWeaponVariantImageUrl,
	modeImageUrl,
	navIconUrl,
	OBJECT_DAMAGE_CALCULATOR_URL,
	specialWeaponImageUrl,
	specialWeaponVariantImageUrl,
	subWeaponImageUrl,
} from "~/utils/urls";
import { useObjectDamage } from "../calculator-hooks";
import type { DamageReceiver } from "../calculator-types";
import styles from "./object-damage-calculator.module.css";

export const CURRENT_PATCH = "10.1";

export const shouldRevalidate: ShouldRevalidateFunction = () => false;

export const handle: SendouRouteHandle = {
	i18n: ["weapons", "analyzer", "builds", "game-misc"],
	breadcrumb: () => ({
		imgPath: navIconUrl("object-damage-calculator"),
		href: OBJECT_DAMAGE_CALCULATOR_URL,
		type: "IMAGE",
	}),
};

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "Object Damage Calculator",
		ogTitle: "Splatoon 3 object damage calculator",
		description:
			"Calculate how much damage weapons do to objects in Splatoon 3. The list of objects includes Crab Tank, Big Bubbler, Splash Wall, Rainmaker shield and more.",
		location: args.location,
	});
};

export default function ObjectDamagePage() {
	const { t } = useTranslation(["analyzer"]);
	const {
		weapon,
		handleChange,
		damagesToReceivers,
		abilityPoints,
		damageType,
		allDamageTypes,
		multiShotCount,
		isMultiShot,
	} = useObjectDamage();

	return (
		<Main className="stack lg">
			<div className={styles.controls}>
				<div className={styles.selects}>
					<div className={styles.selectsWeapon}>
						<Label htmlFor="weapon">{t("analyzer:labels.weapon")}</Label>
						<WeaponSelect
							includeSubSpecial
							value={weapon}
							onChange={(newAnyWeapon) => {
								handleChange({
									newAnyWeapon,
								});
							}}
						/>
					</div>
					{allDamageTypes.length > 0 ? (
						<div
							className={clsx({
								invisible: !damagesToReceivers || allDamageTypes.length === 1,
							})}
						>
							<Label htmlFor="damage">{t("analyzer:labels.damageType")}</Label>
							<DamageTypesSelect
								handleChange={handleChange}
								damageType={damageType}
								allDamageTypes={allDamageTypes}
							/>
						</div>
					) : null}
				</div>
				{multiShotCount ? (
					<div className="stack sm horizontal items-center label-no-spacing">
						<label htmlFor="multi">×{multiShotCount}</label>
						<SendouSwitch
							id="multi"
							isSelected={isMultiShot}
							onChange={(isSelected) =>
								handleChange({ newIsMultiShot: isSelected })
							}
							data-testid="multi-switch"
						/>
					</div>
				) : null}
			</div>
			{damagesToReceivers ? (
				<DamageReceiversGrid
					damagesToReceivers={damagesToReceivers}
					abilityPoints={abilityPoints}
					weapon={weapon}
				>
					<div>
						<select
							id="ap"
							value={abilityPoints}
							onChange={(e) =>
								handleChange({ newAbilityPoints: Number(e.target.value) })
							}
						>
							{possibleApValues().map((ap) => (
								<option key={ap} value={ap}>
									{ap}
									{t("analyzer:abilityPoints.short")}
								</option>
							))}
						</select>
					</div>
				</DamageReceiversGrid>
			) : (
				<div>{t("analyzer:noDmgData")}</div>
			)}
			<div className={styles.bottomContainer}>
				<div className="text-lighter text-xs">
					{t("analyzer:dmgHtdExplanation")}
				</div>
				<div className={styles.patch}>
					{t("analyzer:patch")} {CURRENT_PATCH}
				</div>
			</div>
		</Main>
	);
}

function DamageTypesSelect({
	allDamageTypes,
	handleChange,
	damageType,
}: Pick<
	ReturnType<typeof useObjectDamage>,
	"handleChange" | "damageType" | "allDamageTypes"
>) {
	const { t } = useTranslation(["analyzer"]);

	return (
		<select
			id="damage"
			value={damageType}
			onChange={(e) =>
				handleChange({ newDamageType: e.target.value as DamageType })
			}
		>
			{allDamageTypes.map((damageType) => {
				return (
					<option key={damageType} value={damageType}>
						{t(`analyzer:damage.${damageType}` as any)}
					</option>
				);
			})}
		</select>
	);
}

const damageReceiverImages: Record<DamageReceiver, string> = {
	Bomb_TorpedoBullet: subWeaponImageUrl(TORPEDO_ID),
	BlowerInhale: specialWeaponImageUrl(INK_VAC_ID),
	Chariot: specialWeaponImageUrl(CRAB_TANK_ID),
	Gachihoko_Barrier: modeImageUrl("RM"),
	GreatBarrier_Barrier: specialWeaponImageUrl(BIG_BUBBLER_ID),
	GreatBarrier_WeakPoint: specialWeaponVariantImageUrl(
		BIG_BUBBLER_ID,
		"weakpoints",
	),
	NiceBall_Armor: specialWeaponImageUrl(BOOYAH_BOMB_ID),
	ShockSonar: specialWeaponImageUrl(WAVE_BREAKER_ID),
	Wsb_Flag: subWeaponImageUrl(SQUID_BEAKON_ID),
	Wsb_Shield: subWeaponImageUrl(SPLASH_WALL_ID),
	Wsb_Sprinkler: subWeaponImageUrl(SPRINKLER_ID),
	BulletUmbrellaCanopyNormal: mainWeaponImageUrl(6000),
	BulletUmbrellaCanopyWide: mainWeaponImageUrl(6010),
	BulletUmbrellaCanopyCompact: mainWeaponImageUrl(6020),
	BulletShelterCanopyFocus: mainWeaponImageUrl(6030),
	BulletUmbrellaCanopyNormal_Launched: mainWeaponVariantImageUrl(
		6000,
		"launched",
	),
	BulletUmbrellaCanopyWide_Launched: mainWeaponVariantImageUrl(
		6010,
		"launched",
	),
	BulletShelterCanopyFocus_Launched: mainWeaponVariantImageUrl(
		6030,
		"launched",
	),
	Decoy: specialWeaponImageUrl(SUPER_CHUMP_ID),
	BulletPogo: specialWeaponImageUrl(TRIPLE_SPLASHDOWN_ID),
};

const damageReceiverAp: Partial<Record<DamageReceiver, JSX.Element>> = {
	GreatBarrier_Barrier: (
		<Ability ability="SPU" size="TINY" className={styles.ability} />
	),
	GreatBarrier_WeakPoint: (
		<Ability ability="SPU" size="TINY" className={styles.ability} />
	),
	Wsb_Shield: (
		<Ability ability="BRU" size="TINY" className="object-damage__ability" />
	),
};

type ReceiverTranslation =
	| { key: string }
	| { weaponKey: string; suffixKey: string };

const damageReceiverTranslations: Record<DamageReceiver, ReceiverTranslation> =
	{
		Chariot: { key: "weapons:SPECIAL_12" },
		NiceBall_Armor: {
			weaponKey: "weapons:SPECIAL_6",
			suffixKey: "analyzer:damageReceiver.suffix.armor",
		},
		ShockSonar: { key: "weapons:SPECIAL_7" },
		GreatBarrier_Barrier: {
			weaponKey: "weapons:SPECIAL_2",
			suffixKey: "analyzer:damageReceiver.suffix.shield",
		},
		GreatBarrier_WeakPoint: {
			weaponKey: "weapons:SPECIAL_2",
			suffixKey: "analyzer:damageReceiver.suffix.weakPoint",
		},
		BlowerInhale: {
			weaponKey: "weapons:SPECIAL_8",
			suffixKey: "analyzer:damageReceiver.suffix.inhale",
		},
		Decoy: { key: "weapons:SPECIAL_16" },
		BulletPogo: { key: "weapons:SPECIAL_18" },
		Gachihoko_Barrier: {
			weaponKey: "game-misc:MODE_LONG_RM",
			suffixKey: "analyzer:damageReceiver.suffix.shield",
		},
		Wsb_Flag: { key: "weapons:SUB_8" },
		Wsb_Shield: { key: "weapons:SUB_4" },
		Wsb_Sprinkler: { key: "weapons:SUB_3" },
		Bomb_TorpedoBullet: { key: "weapons:SUB_13" },
		BulletUmbrellaCanopyCompact: {
			weaponKey: "weapons:MAIN_6020",
			suffixKey: "analyzer:damageReceiver.suffix.canopy",
		},
		BulletUmbrellaCanopyNormal: {
			weaponKey: "weapons:MAIN_6000",
			suffixKey: "analyzer:damageReceiver.suffix.canopy",
		},
		BulletUmbrellaCanopyNormal_Launched: {
			weaponKey: "weapons:MAIN_6000",
			suffixKey: "analyzer:damageReceiver.suffix.canopyLaunched",
		},
		BulletUmbrellaCanopyWide: {
			weaponKey: "weapons:MAIN_6010",
			suffixKey: "analyzer:damageReceiver.suffix.canopy",
		},
		BulletUmbrellaCanopyWide_Launched: {
			weaponKey: "weapons:MAIN_6010",
			suffixKey: "analyzer:damageReceiver.suffix.canopyLaunched",
		},
		BulletShelterCanopyFocus: {
			weaponKey: "weapons:MAIN_6030",
			suffixKey: "analyzer:damageReceiver.suffix.canopy",
		},
		BulletShelterCanopyFocus_Launched: {
			weaponKey: "weapons:MAIN_6030",
			suffixKey: "analyzer:damageReceiver.suffix.canopyLaunched",
		},
	};

function DamageReceiversGrid({
	weapon,
	damagesToReceivers,
	children,
	abilityPoints,
}: {
	weapon: ReturnType<typeof useObjectDamage>["weapon"];
	damagesToReceivers: NonNullable<
		ReturnType<typeof useObjectDamage>["damagesToReceivers"]
	>;
	children: React.ReactNode;
	abilityPoints: string;
}): JSX.Element {
	const { t } = useTranslation(["weapons", "analyzer", "common", "game-misc"]);

	const translateReceiver = (receiver: DamageReceiver) => {
		const config = damageReceiverTranslations[receiver];
		if ("key" in config) {
			return t(config.key as any);
		}
		return t(config.suffixKey as any, { weapon: t(config.weaponKey as any) });
	};
	return (
		<div>
			<div
				className={`${styles.grid} scrollbar`}
				style={{
					gridTemplateColumns: gridTemplateColumnsValue(
						damagesToReceivers[0]?.damages.length ?? 0,
					),
				}}
			>
				<div
					className={styles.tableHeader}
					style={{ zIndex: "1", justifyContent: "center" }}
				>
					<div>
						<Label htmlFor="ap">
							{t("analyzer:labels.amountOf")}
							<div className={styles.apLabel}>
								<Ability ability="BRU" size="TINY" />
								<Ability ability="SPU" size="TINY" />
							</div>
						</Label>
					</div>
					<div>{children}</div>
				</div>
				{damagesToReceivers[0]?.damages.map((damage) => (
					<div key={damage.id} className={styles.tableHeader}>
						{t(`weapons:${weapon.type}_${weapon.id}` as any)}
						<div className="text-lighter stack horizontal sm justify-center items-center">
							{weapon.type === "MAIN" ? (
								<WeaponImage
									weaponSplId={weapon.id}
									width={24}
									height={24}
									variant="build"
									className={styles.weaponImage}
								/>
							) : weapon.type === "SUB" ? (
								<Image
									alt=""
									path={subWeaponImageUrl(weapon.id)}
									width={24}
									height={24}
									className={styles.weaponImage}
								/>
							) : (
								<Image
									alt=""
									path={specialWeaponImageUrl(weapon.id)}
									width={24}
									height={24}
									className={styles.weaponImage}
								/>
							)}
						</div>
						<div
							className={clsx(styles.distance, !damage.distance && "invisible")}
						>
							{t("analyzer:distanceInline", {
								value: Array.isArray(damage.distance)
									? damage.distance.join("-")
									: damage.distance,
							})}
						</div>
						<div className="stack horizontal sm justify-center items-center">
							{t(`analyzer:damage.${damage.type}` as any)}
							{damage.objectShredder && <Ability ability="OS" size="TINY" />}
						</div>
					</div>
				))}
				{damagesToReceivers.map((damageToReceiver) => {
					return (
						<React.Fragment key={damageToReceiver.receiver}>
							<div className={styles.tableHeader}>
								<div>
									<Label htmlFor="ap">
										<div className={styles.apLabel}>
											{abilityPoints !== "0" &&
												damageReceiverAp[damageToReceiver.receiver]}
										</div>
									</Label>
									<SendouPopover
										trigger={
											<Button className="object-damage__receiver-button">
												<Image
													className="object-damage__receiver-image"
													alt={translateReceiver(damageToReceiver.receiver)}
													path={damageReceiverImages[damageToReceiver.receiver]}
													width={40}
													height={40}
												/>
											</Button>
										}
									>
										{translateReceiver(damageToReceiver.receiver)}
									</SendouPopover>
								</div>
								<div className={styles.hp}>
									<span data-testid={`hp-${damageToReceiver.receiver}`}>
										{roundToNDecimalPlaces(damageToReceiver.hitPoints)}
									</span>
									{t("analyzer:suffix.hp")}
								</div>
							</div>
							{damageToReceiver.damages.map((damage) => {
								return (
									<div key={damage.id} className={styles.tableCard}>
										<div className={styles.tableCardResults}>
											<abbr
												className={styles.abbr}
												title={t("analyzer:stat.category.damage")}
											>
												{t("analyzer:damageShort")}
											</abbr>
											<div
												data-testid={`dmg${
													damage.objectShredder ? "-os" : ""
												}-${damageToReceiver.receiver}`}
											>
												{damage.value}
											</div>
											<abbr
												className={styles.abbr}
												title={t("analyzer:hitsToDestroyLong")}
											>
												{t("analyzer:hitsToDestroyShort")}
											</abbr>
											<div
												data-testid={`htd${
													damage.objectShredder ? "-os" : ""
												}-${damageToReceiver.receiver}`}
											>
												{damage.hitsToDestroy}
											</div>
										</div>
										<div className={styles.multiplier}>
											×{damage.multiplier}
										</div>
									</div>
								);
							})}
						</React.Fragment>
					);
				})}
			</div>
		</div>
	);
}

function gridTemplateColumnsValue(dataColumnsCount: number) {
	return `max-content ${new Array(dataColumnsCount)
		.fill(null)
		.map(() => "1fr")
		.join(" ")}`;
}
