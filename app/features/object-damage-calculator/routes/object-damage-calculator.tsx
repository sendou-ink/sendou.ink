import clsx from "clsx";
import React, { type JSX } from "react";
import { useTranslation } from "react-i18next";
import type { MetaFunction, ShouldRevalidateFunction } from "react-router";
import { Ability } from "~/components/Ability";
import { SendouPopover } from "~/components/elements/Popover";
import { SendouSwitch } from "~/components/elements/Switch";
import {
	Image,
	SpecialWeaponImage,
	SubWeaponImage,
	WeaponImage,
} from "~/components/Image";
import { Label } from "~/components/Label";
import { Main } from "~/components/Main";
import { WeaponSelect } from "~/components/WeaponSelect";
import { possibleApValues } from "~/features/build-analyzer/analyzer-constants";
import type { DamageType } from "~/features/build-analyzer/analyzer-types";
import type {
	SpecialWeaponId,
	SubWeaponId,
} from "~/modules/in-game-lists/types";
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
import { metaTags, ogPageImage } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import {
	mainWeaponImageUrl,
	mainWeaponVariantImageUrl,
	modeImageUrl,
	navIconUrl,
	OBJECT_DAMAGE_CALCULATOR_URL,
	type SpecialWeaponImageVariant,
} from "~/utils/urls";
import { translateDamageReceiver } from "../calculator-constants";
import { useObjectDamage } from "../calculator-hooks";
import type { DamageReceiver } from "../calculator-types";
import styles from "./object-damage-calculator.module.css";

export const CURRENT_PATCH = "11.3";

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
		image: ogPageImage("object-damage-calculator"),
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
					<div>
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
			{allDamageTypes.map((optionDamageType) => {
				return (
					<option key={optionDamageType} value={optionDamageType}>
						{t(`analyzer:damage.${optionDamageType}` as any)}
					</option>
				);
			})}
		</select>
	);
}

const RECEIVER_IMAGE_SIZE = 24;

type DamageReceiverIcon =
	| { kind: "sub"; id: SubWeaponId }
	| {
			kind: "special";
			id: SpecialWeaponId;
			variant?: SpecialWeaponImageVariant;
	  }
	| { kind: "path"; path: string };

const damageReceiverImages: Record<DamageReceiver, DamageReceiverIcon> = {
	Bomb_TorpedoBullet: { kind: "sub", id: TORPEDO_ID },
	BlowerInhale: { kind: "special", id: INK_VAC_ID },
	Chariot: { kind: "special", id: CRAB_TANK_ID },
	Gachihoko_Barrier: { kind: "path", path: modeImageUrl("RM") },
	GreatBarrier_Barrier: { kind: "special", id: BIG_BUBBLER_ID },
	GreatBarrier_WeakPoint: {
		kind: "special",
		id: BIG_BUBBLER_ID,
		variant: "weakpoints",
	},
	NiceBall_Armor: { kind: "special", id: BOOYAH_BOMB_ID },
	ShockSonar: { kind: "special", id: WAVE_BREAKER_ID },
	Wsb_Flag: { kind: "sub", id: SQUID_BEAKON_ID },
	Wsb_Shield: { kind: "sub", id: SPLASH_WALL_ID },
	Wsb_Sprinkler: { kind: "sub", id: SPRINKLER_ID },
	BulletUmbrellaCanopyNormal: { kind: "path", path: mainWeaponImageUrl(6000) },
	BulletUmbrellaCanopyWide: { kind: "path", path: mainWeaponImageUrl(6010) },
	BulletUmbrellaCanopyCompact: {
		kind: "path",
		path: mainWeaponImageUrl(6020),
	},
	BulletShelterCanopyFocus: { kind: "path", path: mainWeaponImageUrl(6030) },
	BulletUmbrellaCanopyNormal_Launched: {
		kind: "path",
		path: mainWeaponVariantImageUrl(6000, "launched"),
	},
	BulletUmbrellaCanopyWide_Launched: {
		kind: "path",
		path: mainWeaponVariantImageUrl(6010, "launched"),
	},
	BulletShelterCanopyFocus_Launched: {
		kind: "path",
		path: mainWeaponVariantImageUrl(6030, "launched"),
	},
	Decoy: { kind: "special", id: SUPER_CHUMP_ID },
	BulletPogo: { kind: "special", id: TRIPLE_SPLASHDOWN_ID },
};

function DamageReceiverImage({
	icon,
	alt,
}: {
	icon: DamageReceiverIcon;
	alt: string;
}) {
	switch (icon.kind) {
		case "sub":
			return (
				<SubWeaponImage
					subWeaponId={icon.id}
					alt={alt}
					size={RECEIVER_IMAGE_SIZE}
					containerClassName={styles.receiverImage}
				/>
			);
		case "special":
			return (
				<SpecialWeaponImage
					specialWeaponId={icon.id}
					variant={icon.variant}
					alt={alt}
					size={RECEIVER_IMAGE_SIZE}
					containerClassName={styles.receiverImage}
				/>
			);
		case "path":
			return (
				<Image
					containerClassName={styles.receiverImage}
					alt={alt}
					path={icon.path}
					size={RECEIVER_IMAGE_SIZE}
				/>
			);
	}
}

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

	const translateReceiver = (receiver: DamageReceiver) =>
		translateDamageReceiver(t, receiver);
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
								<SubWeaponImage
									subWeaponId={weapon.id}
									size={24}
									className={styles.weaponImage}
								/>
							) : (
								<SpecialWeaponImage
									specialWeaponId={weapon.id}
									size={24}
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
							{damage.objectShredder ? (
								<Ability ability="OS" size="TINY" />
							) : null}
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
											{abilityPoints !== "0"
												? damageReceiverAp[damageToReceiver.receiver]
												: null}
										</div>
									</Label>
									<SendouPopover
										trigger={
											<button type="button" className={styles.receiverButton}>
												<DamageReceiverImage
													icon={damageReceiverImages[damageToReceiver.receiver]}
													alt={translateReceiver(damageToReceiver.receiver)}
												/>
											</button>
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
