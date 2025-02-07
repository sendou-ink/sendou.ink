import type { ShouldRevalidateFunction } from "@remix-run/react";
import clsx from "clsx";
import React from "react";
import { useTranslation } from "react-i18next";
import { Ability } from "~/components/Ability";
import { AllWeaponCombobox } from "~/components/Combobox";
import { Image, WeaponImage } from "~/components/Image";
import { Label } from "~/components/Label";
import { Main } from "~/components/Main";
import type { AnyWeapon, DamageType } from "~/features/build-analyzer";
import { possibleApValues } from "~/features/build-analyzer";
import {
	BIG_BUBBLER_ID,
	BOOYAH_BOMB_ID,
	CRAB_TANK_ID,
	INK_VAC_ID,
	SPLASH_WALL_ID,
	SPRINKLER_ID,
	SQUID_BEAKON_ID,
	TORPEDO_ID,
	WAVE_BREAKER_ID,
} from "~/modules/in-game-lists";
import {
	SUPER_CHUMP_ID,
	TRIPLE_SPLASHDOWN_ID,
} from "~/modules/in-game-lists/weapon-ids";
import { damageTypeTranslationString } from "~/utils/i18next";
import type { SendouRouteHandle } from "~/utils/remix.server";
import {
	OBJECT_DAMAGE_CALCULATOR_URL,
	mainWeaponImageUrl,
	modeImageUrl,
	navIconUrl,
	specialWeaponImageUrl,
	subWeaponImageUrl,
} from "~/utils/urls";
import { useObjectDamage } from "../calculator-hooks";
import type { DamageReceiver } from "../calculator-types";
import "../calculator.css";
import type { MetaFunction } from "@remix-run/node";
import { SendouSwitch } from "~/components/elements/Switch";
import { metaTags } from "~/utils/remix";

export const CURRENT_PATCH = "9.2";

export const shouldRevalidate: ShouldRevalidateFunction = () => false;

export const handle: SendouRouteHandle = {
	i18n: ["weapons", "analyzer", "builds"],
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
			<div className="object-damage__controls">
				<div className="object-damage__selects">
					<div className="object-damage__selects__weapon">
						<Label htmlFor="weapon">{t("analyzer:labels.weapon")}</Label>
						<AllWeaponCombobox
							id="weapon"
							inputName="weapon"
							onChange={(opt) => {
								if (!opt) return;

								const [type, id] = opt.value.split("_");

								handleChange({
									newAnyWeapon: {
										id: Number(id),
										type,
									} as AnyWeapon,
								});
							}}
							fullWidth
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
						<label className="plain" htmlFor="multi">
							×{multiShotCount}
						</label>
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
							className="object-damage__select"
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
			<div className="object-damage__bottom-container">
				<div className="text-lighter text-xs">
					{t("analyzer:dmgHtdExplanation")}
				</div>
				<div className="object-damage__patch">
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
			className="object-damage__select"
			id="damage"
			value={damageType}
			onChange={(e) =>
				handleChange({ newDamageType: e.target.value as DamageType })
			}
		>
			{allDamageTypes.map((damageType) => {
				return (
					<option key={damageType} value={damageType}>
						{t(
							damageTypeTranslationString({
								damageType,
							}) as any,
						)}
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
	GreatBarrier_WeakPoint: specialWeaponImageUrl(BIG_BUBBLER_ID),
	NiceBall_Armor: specialWeaponImageUrl(BOOYAH_BOMB_ID),
	ShockSonar: specialWeaponImageUrl(WAVE_BREAKER_ID),
	Wsb_Flag: subWeaponImageUrl(SQUID_BEAKON_ID),
	Wsb_Shield: subWeaponImageUrl(SPLASH_WALL_ID),
	Wsb_Sprinkler: subWeaponImageUrl(SPRINKLER_ID),
	BulletUmbrellaCanopyNormal: mainWeaponImageUrl(6000),
	BulletUmbrellaCanopyWide: mainWeaponImageUrl(6010),
	BulletUmbrellaCanopyCompact: mainWeaponImageUrl(6020),
	BulletShelterCanopyFocus: mainWeaponImageUrl(6030),
	Firework: specialWeaponImageUrl(SUPER_CHUMP_ID),
	BulletPogo: specialWeaponImageUrl(TRIPLE_SPLASHDOWN_ID),
};

const damageReceiverAp: Partial<Record<DamageReceiver, JSX.Element>> = {
	GreatBarrier_Barrier: (
		<Ability ability="SPU" size="TINY" className="object-damage__ability" />
	),
	GreatBarrier_WeakPoint: (
		<Ability ability="SPU" size="TINY" className="object-damage__ability" />
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
	const { t } = useTranslation(["weapons", "analyzer", "common"]);
	return (
		<div>
			<div
				className="object-damage__grid"
				style={{
					gridTemplateColumns: gridTemplateColumnsValue(
						damagesToReceivers[0]?.damages.length ?? 0,
					),
				}}
			>
				<div
					className="object-damage__table-header"
					style={{ zIndex: "1", justifyContent: "center" }}
				>
					<div>
						<Label htmlFor="ap">
							{t("analyzer:labels.amountOf")}
							<div className="object-damage__ap-label">
								<Ability ability="BRU" size="TINY" />
								<Ability ability="SPU" size="TINY" />
							</div>
						</Label>
					</div>
					<div>{children}</div>
				</div>
				{damagesToReceivers[0]?.damages.map((damage) => (
					<div key={damage.id} className="object-damage__table-header">
						{t(`weapons:${weapon.type}_${weapon.id}` as any)}
						<div className="text-lighter stack horizontal sm justify-center items-center">
							{weapon.type === "MAIN" ? (
								<WeaponImage
									weaponSplId={weapon.id}
									width={24}
									height={24}
									variant="build"
									className="object-damage__weapon-image"
								/>
							) : weapon.type === "SUB" ? (
								<Image
									alt=""
									path={subWeaponImageUrl(weapon.id)}
									width={24}
									height={24}
									className="object-damage__weapon-image"
								/>
							) : (
								<Image
									alt=""
									path={specialWeaponImageUrl(weapon.id)}
									width={24}
									height={24}
									className="object-damage__weapon-image"
								/>
							)}
						</div>
						<div
							className={clsx("object-damage__distance", {
								invisible: !damage.distance,
							})}
						>
							{t("analyzer:distanceInline", {
								value: Array.isArray(damage.distance)
									? damage.distance.join("-")
									: damage.distance,
							})}
						</div>
						<div className="stack horizontal sm justify-center items-center">
							{t(
								damageTypeTranslationString({
									damageType: damage.type,
								}) as any,
							)}
							{damage.objectShredder && <Ability ability="OS" size="TINY" />}
						</div>
					</div>
				))}
				{damagesToReceivers.map((damageToReceiver, i) => {
					return (
						<React.Fragment key={damageToReceiver.receiver}>
							<div className="object-damage__table-header">
								<div>
									<Label htmlFor="ap">
										<div className="object-damage__ap-label">
											{abilityPoints !== "0" &&
												damageReceiverAp[damageToReceiver.receiver]}
										</div>
									</Label>
									<Image
										className="object-damage__receiver-image"
										key={i}
										alt=""
										path={damageReceiverImages[damageToReceiver.receiver]}
										width={40}
										height={40}
									/>
								</div>
								<div className="object-damage__hp">
									<span data-testid={`hp-${damageToReceiver.receiver}`}>
										{damageToReceiver.hitPoints}
									</span>
									{t("analyzer:suffix.hp")}
								</div>
							</div>
							{damageToReceiver.damages.map((damage) => {
								return (
									<div key={damage.id} className="object-damage__table-card">
										<div className="object-damage__table-card__results">
											<abbr
												className="object-damage__abbr"
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
												className="object-damage__abbr"
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
										<div className="object-damage__multiplier">
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
