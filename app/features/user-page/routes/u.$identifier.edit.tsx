import { Form, Link, useLoaderData, useMatches } from "@remix-run/react";
import * as React from "react";
import { Trans, useTranslation } from "react-i18next";
import { Button } from "~/components/Button";
import { WeaponCombobox } from "~/components/Combobox";
import { CustomizedColorsInput } from "~/components/CustomizedColorsInput";
import { FormErrors } from "~/components/FormErrors";
import { FormMessage } from "~/components/FormMessage";
import { WeaponImage } from "~/components/Image";
import { Input } from "~/components/Input";
import { Label } from "~/components/Label";
import { SubmitButton } from "~/components/SubmitButton";
import { SendouSelect, SendouSelectItem } from "~/components/elements/Select";
import { SendouSwitch } from "~/components/elements/Switch";
import { StarIcon } from "~/components/icons/Star";
import { StarFilledIcon } from "~/components/icons/StarFilled";
import { TrashIcon } from "~/components/icons/Trash";
import type { Tables } from "~/db/tables";
import { BADGE } from "~/features/badges/badges-constants";
import { BadgesSelector } from "~/features/badges/components/BadgesSelector";
import { useIsMounted } from "~/hooks/useIsMounted";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { useHasRole } from "~/modules/permissions/hooks";
import invariant from "~/utils/invariant";
import { rawSensToString } from "~/utils/strings";
import { FAQ_PAGE } from "~/utils/urls";
import type { UserPageLoaderData } from "../loaders/u.$identifier.server";
import { COUNTRY_CODES, USER } from "../user-page-constants";

import { action } from "../actions/u.$identifier.edit.server";
import { loader } from "../loaders/u.$identifier.edit.server";
export { loader, action };

import "~/styles/u-edit.css";

export default function UserEditPage() {
	const { t } = useTranslation(["common", "user"]);
	const [, parentRoute] = useMatches();
	invariant(parentRoute);
	const layoutData = parentRoute.data as UserPageLoaderData;
	const data = useLoaderData<typeof loader>();

	const isSupporter = useHasRole("SUPPORTER");
	const isArtist = useHasRole("ARTIST");

	return (
		<div className="half-width">
			<Form className="u-edit__container" method="post">
				{isSupporter ? (
					<CustomizedColorsInput initialColors={layoutData.css} />
				) : null}
				<CustomNameInput />
				<CustomUrlInput parentRouteData={layoutData} />
				<InGameNameInputs />
				<SensSelects />
				<BattlefyInput />
				<CountrySelect />
				<FavBadgeSelect />
				<WeaponPoolSelect />
				<BioTextarea initialValue={data.user.bio} />
				{data.discordUniqueName ? (
					<ShowUniqueDiscordNameToggle />
				) : (
					<input type="hidden" name="showDiscordUniqueName" value="on" />
				)}
				{isArtist ? (
					<>
						<CommissionsOpenToggle parentRouteData={layoutData} />
						<CommissionTextArea initialValue={layoutData.user.commissionText} />
					</>
				) : (
					<>
						<input type="hidden" name="commissionsOpen" value="off" />
						<input type="hidden" name="commissionText" value="" />
					</>
				)}
				<FormMessage type="info">
					<Trans i18nKey={"user:discordExplanation"} t={t}>
						Username, profile picture, YouTube, Bluesky and Twitch accounts come
						from your Discord account. See <Link to={FAQ_PAGE}>FAQ</Link> for
						more information.
					</Trans>
				</FormMessage>
				<SubmitButton>{t("common:actions.save")}</SubmitButton>
				<FormErrors namespace="user" />
			</Form>
		</div>
	);
}

function CustomUrlInput({
	parentRouteData,
}: {
	parentRouteData: UserPageLoaderData;
}) {
	const { t } = useTranslation(["user"]);

	return (
		<div className="w-full">
			<Label htmlFor="customUrl">{t("user:customUrl")}</Label>
			<Input
				name="customUrl"
				id="customUrl"
				leftAddon="https://sendou.ink/u/"
				maxLength={USER.CUSTOM_URL_MAX_LENGTH}
				defaultValue={parentRouteData.user.customUrl ?? undefined}
			/>
			<FormMessage type="info">{t("user:forms.info.customUrl")}</FormMessage>
		</div>
	);
}

function CustomNameInput() {
	const { t } = useTranslation(["user"]);
	const data = useLoaderData<typeof loader>();

	return (
		<div className="w-full">
			<Label htmlFor="customName">{t("user:customName")}</Label>
			<Input
				name="customName"
				id="customName"
				maxLength={USER.CUSTOM_NAME_MAX_LENGTH}
				defaultValue={data.user.customName ?? undefined}
			/>
			<FormMessage type="info">
				{t("user:forms.customName.info", {
					discordName: data.user.discordName,
				})}
			</FormMessage>
		</div>
	);
}

function InGameNameInputs() {
	const { t } = useTranslation(["user"]);
	const data = useLoaderData<typeof loader>();

	const inGameNameParts = data.user.inGameName?.split("#");

	return (
		<div className="stack items-start">
			<Label>{t("user:ign")}</Label>
			<div className="stack horizontal sm items-center">
				<Input
					className="u-edit__in-game-name-text"
					name="inGameNameText"
					aria-label="In game name"
					maxLength={USER.IN_GAME_NAME_TEXT_MAX_LENGTH}
					defaultValue={inGameNameParts?.[0]}
				/>
				<div className="u-edit__in-game-name-hashtag">#</div>
				<Input
					className="u-edit__in-game-name-discriminator"
					name="inGameNameDiscriminator"
					aria-label="In game name discriminator"
					maxLength={USER.IN_GAME_NAME_DISCRIMINATOR_MAX_LENGTH}
					pattern="[0-9a-z]{4,5}"
					defaultValue={inGameNameParts?.[1]}
				/>
			</div>
		</div>
	);
}

const SENS_OPTIONS = [
	-50, -45, -40, -35, -30, -25, -20, -15, -10, -5, 0, 5, 10, 15, 20, 25, 30, 35,
	40, 45, 50,
];
function SensSelects() {
	const { t } = useTranslation(["user"]);
	const data = useLoaderData<typeof loader>();

	return (
		<div className="stack horizontal md">
			<div>
				<Label htmlFor="motionSens">{t("user:motionSens")}</Label>
				<select
					id="motionSens"
					name="motionSens"
					defaultValue={data.user.motionSens ?? undefined}
					className="u-edit__sens-select"
				>
					<option value="">{"-"}</option>
					{SENS_OPTIONS.map((sens) => (
						<option key={sens} value={sens}>
							{rawSensToString(Number(sens))}
						</option>
					))}
				</select>
			</div>

			<div>
				<Label htmlFor="stickSens">{t("user:stickSens")}</Label>
				<select
					id="stickSens"
					name="stickSens"
					defaultValue={data.user.stickSens ?? undefined}
					className="u-edit__sens-select"
				>
					<option value="">{"-"}</option>
					{SENS_OPTIONS.map((sens) => (
						<option key={sens} value={sens}>
							{rawSensToString(Number(sens))}
						</option>
					))}
				</select>
			</div>
		</div>
	);
}

function CountrySelect() {
	const { t, i18n } = useTranslation(["user"]);
	const data = useLoaderData<typeof loader>();
	const isMounted = useIsMounted();

	const displayName = new Intl.DisplayNames(i18n.language, { type: "region" });

	// TODO: if react-aria-components start supporting "suppressHydrationWarning" it would likely be a better solution here
	const items = COUNTRY_CODES.map((countryCode) => ({
		name: isMounted
			? (displayName.of(countryCode) ?? countryCode)
			: countryCode,
		id: countryCode,
		key: countryCode,
	})).sort((a, b) =>
		a.name.localeCompare(b.name, i18n.language, { sensitivity: "base" }),
	);

	return (
		<SendouSelect
			items={items}
			label={t("user:country")}
			search={{
				placeholder: t("user:forms.country.search.placeholder"),
			}}
			name="country"
			defaultSelectedKey={data.user.country ?? undefined}
		>
			{({ key, ...item }) => (
				<SendouSelectItem key={key} {...item}>
					{item.name}
				</SendouSelectItem>
			)}
		</SendouSelect>
	);
}

function BattlefyInput() {
	const { t } = useTranslation(["user"]);
	const data = useLoaderData<typeof loader>();

	return (
		<div className="w-full">
			<Label htmlFor="customName">{t("user:battlefy")}</Label>
			<Input
				name="battlefy"
				id="battlefy"
				maxLength={USER.BATTLEFY_MAX_LENGTH}
				defaultValue={data.user.battlefy ?? undefined}
				leftAddon="https://battlefy.com/users/"
			/>
			<FormMessage type="info">{t("user:forms.info.battlefy")}</FormMessage>
		</div>
	);
}

function WeaponPoolSelect() {
	const data = useLoaderData<typeof loader>();
	const [weapons, setWeapons] = React.useState(data.user.weapons);
	const { t } = useTranslation(["user"]);

	const latestWeapon = weapons[weapons.length - 1];

	return (
		<div className="stack md u-edit__weapon-pool">
			<input type="hidden" name="weapons" value={JSON.stringify(weapons)} />
			<div>
				<label htmlFor="weapon">{t("user:weaponPool")}</label>
				{weapons.length < USER.WEAPON_POOL_MAX_SIZE ? (
					<WeaponCombobox
						inputName="weapon"
						id="weapon"
						onChange={(weapon) => {
							if (!weapon) return;
							setWeapons([
								...weapons,
								{
									weaponSplId: Number(weapon.value) as MainWeaponId,
									isFavorite: 0,
								},
							]);
						}}
						// empty on selection
						key={latestWeapon?.weaponSplId ?? "empty"}
						weaponIdsToOmit={new Set(weapons.map((w) => w.weaponSplId))}
						fullWidth
					/>
				) : (
					<span className="text-xs text-warning">
						{t("user:forms.errors.maxWeapons")}
					</span>
				)}
			</div>
			<div className="stack horizontal sm justify-center">
				{weapons.map((weapon) => {
					return (
						<div key={weapon.weaponSplId} className="stack xs">
							<div className="u__weapon">
								<WeaponImage
									weaponSplId={weapon.weaponSplId}
									variant={weapon.isFavorite ? "badge-5-star" : "badge"}
									width={38}
									height={38}
								/>
							</div>
							<div className="stack sm horizontal items-center justify-center">
								<Button
									icon={weapon.isFavorite ? <StarFilledIcon /> : <StarIcon />}
									variant="minimal"
									aria-label="Favorite weapon"
									onClick={() =>
										setWeapons(
											weapons.map((w) =>
												w.weaponSplId === weapon.weaponSplId
													? {
															...weapon,
															isFavorite: weapon.isFavorite === 1 ? 0 : 1,
														}
													: w,
											),
										)
									}
								/>
								<Button
									icon={<TrashIcon />}
									variant="minimal-destructive"
									aria-label="Delete weapon"
									onClick={() =>
										setWeapons(
											weapons.filter(
												(w) => w.weaponSplId !== weapon.weaponSplId,
											),
										)
									}
									testId={`delete-weapon-${weapon.weaponSplId}`}
									size="tiny"
								/>
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}

function BioTextarea({
	initialValue,
}: { initialValue: Tables["User"]["bio"] }) {
	const { t } = useTranslation("user");
	const [value, setValue] = React.useState(initialValue ?? "");

	return (
		<div className="u-edit__bio-container">
			<Label
				htmlFor="bio"
				valueLimits={{ current: value.length, max: USER.BIO_MAX_LENGTH }}
			>
				{t("bio")}
			</Label>
			<textarea
				id="bio"
				name="bio"
				value={value}
				onChange={(e) => setValue(e.target.value)}
				maxLength={USER.BIO_MAX_LENGTH}
			/>
		</div>
	);
}

function FavBadgeSelect() {
	const data = useLoaderData<typeof loader>();
	const { t } = useTranslation(["user"]);
	const [value, setValue] = React.useState(data.favoriteBadgeIds ?? []);
	const isSupporter = useHasRole("SUPPORTER");

	// doesn't make sense to select favorite badge
	// if user has no badges or only has 1 badge
	if (data.user.badges.length < 2) return null;

	const onChange = (newBadges: number[]) => {
		if (isSupporter) {
			setValue(newBadges);
		} else {
			// non-supporters can only set which badge is the big one
			setValue(newBadges.length > 0 ? [newBadges[0]] : []);
		}
	};

	return (
		<div>
			<input
				type="hidden"
				name="favoriteBadgeIds"
				value={JSON.stringify(value)}
			/>
			<label htmlFor="favoriteBadgeIds">{t("user:favoriteBadges")}</label>
			<BadgesSelector
				options={data.user.badges}
				selectedBadges={value}
				onChange={onChange}
				maxCount={BADGE.SMALL_BADGES_PER_DISPLAY_PAGE + 1}
			>
				{!isSupporter ? (
					<div className="text-sm text-lighter font-semi-bold text-center">
						{t("user:forms.favoriteBadges.nonSupporter")}
					</div>
				) : null}
			</BadgesSelector>
		</div>
	);
}

function ShowUniqueDiscordNameToggle() {
	const { t } = useTranslation(["user"]);
	const data = useLoaderData<typeof loader>();
	const [checked, setChecked] = React.useState(
		Boolean(data.user.showDiscordUniqueName),
	);

	return (
		<div>
			<label htmlFor="showDiscordUniqueName">
				{t("user:forms.showDiscordUniqueName")}
			</label>
			<SendouSwitch
				isSelected={checked}
				onChange={setChecked}
				name="showDiscordUniqueName"
			/>
			<FormMessage type="info">
				{t("user:forms.showDiscordUniqueName.info", {
					discordUniqueName: data.discordUniqueName,
				})}
			</FormMessage>
		</div>
	);
}

function CommissionsOpenToggle({
	parentRouteData,
}: {
	parentRouteData: UserPageLoaderData;
}) {
	const { t } = useTranslation(["user"]);
	const [checked, setChecked] = React.useState(
		Boolean(parentRouteData.user.commissionsOpen),
	);

	return (
		<div>
			<label htmlFor="commissionsOpen">{t("user:forms.commissionsOpen")}</label>
			<SendouSwitch
				isSelected={checked}
				onChange={setChecked}
				name="commissionsOpen"
			/>
		</div>
	);
}

function CommissionTextArea({
	initialValue,
}: {
	initialValue: Tables["User"]["commissionText"];
}) {
	const { t } = useTranslation(["user"]);
	const [value, setValue] = React.useState(initialValue ?? "");

	return (
		<div className="u-edit__bio-container">
			<Label
				htmlFor="commissionText"
				valueLimits={{
					current: value.length,
					max: USER.COMMISSION_TEXT_MAX_LENGTH,
				}}
			>
				{t("user:forms.commissionText")}
			</Label>
			<textarea
				id="commissionText"
				name="commissionText"
				value={value}
				onChange={(e) => setValue(e.target.value)}
				maxLength={USER.COMMISSION_TEXT_MAX_LENGTH}
			/>
			<FormMessage type="info">
				{t("user:forms.commissionText.info")}
			</FormMessage>
		</div>
	);
}
