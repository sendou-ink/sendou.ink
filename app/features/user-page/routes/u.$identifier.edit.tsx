import {
	type ActionFunction,
	type LoaderFunctionArgs,
	redirect,
} from "@remix-run/node";
import { Form, Link, useLoaderData, useMatches } from "@remix-run/react";
import type { TCountryCode } from "countries-list";
import { countries, getEmojiFlag } from "countries-list";
import * as React from "react";
import { Trans, useTranslation } from "react-i18next";
import { z } from "zod";
import { Button } from "~/components/Button";
import { WeaponCombobox } from "~/components/Combobox";
import { CustomizedColorsInput } from "~/components/CustomizedColorsInput";
import { FormErrors } from "~/components/FormErrors";
import { FormMessage } from "~/components/FormMessage";
import { WeaponImage } from "~/components/Image";
import { Input } from "~/components/Input";
import { Label } from "~/components/Label";
import { SubmitButton } from "~/components/SubmitButton";
import { StarIcon } from "~/components/icons/Star";
import { StarFilledIcon } from "~/components/icons/StarFilled";
import { TrashIcon } from "~/components/icons/Trash";
import { USER } from "~/constants";
import type { User } from "~/db/types";
import { useUser } from "~/features/auth/core/user";
import { requireUser, requireUserId } from "~/features/auth/core/user.server";
import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { i18next } from "~/modules/i18n/i18next.server";
import type { MainWeaponId } from "~/modules/in-game-lists";
import { canAddCustomizedColorsToUserProfile } from "~/permissions";
import { translatedCountry } from "~/utils/i18n.server";
import invariant from "~/utils/invariant";
import {
	notFoundIfFalsy,
	safeParseRequestFormData,
} from "~/utils/remix.server";
import { errorIsSqliteUniqueConstraintFailure } from "~/utils/sql";
import { rawSensToString } from "~/utils/strings";
import { FAQ_PAGE, isCustomUrl, userPage } from "~/utils/urls";
import {
	actualNumber,
	checkboxValueToDbBoolean,
	customCssVarObject,
	dbBoolean,
	falsyToNull,
	id,
	processMany,
	safeJSONParse,
	undefinedToNull,
	weaponSplId,
} from "~/utils/zod";
import { userParamsSchema } from "../user-page-schemas.server";
import type { UserPageLoaderData } from "./u.$identifier";
import "~/styles/u-edit.css";
import { SendouSwitch } from "~/components/elements/Switch";
import { clearTournamentDataCache } from "~/features/tournament-bracket/core/Tournament.server";

export const userEditActionSchema = z
	.object({
		country: z.preprocess(
			falsyToNull,
			z
				.string()
				.refine(
					(val) => !val || Object.keys(countries).some((code) => val === code),
				)
				.nullable(),
		),
		bio: z.preprocess(
			falsyToNull,
			z.string().max(USER.BIO_MAX_LENGTH).nullable(),
		),
		customUrl: z.preprocess(
			falsyToNull,
			z
				.string()
				.max(USER.CUSTOM_URL_MAX_LENGTH)
				.refine((val) => val === null || isCustomUrl(val), {
					message: "forms.errors.invalidCustomUrl.numbers",
				})
				.refine((val) => val === null || /^[a-zA-Z0-9-_]+$/.test(val), {
					message: "forms.errors.invalidCustomUrl.strangeCharacter",
				})
				.transform((val) => val?.toLowerCase())
				.nullable(),
		),
		customName: z.preprocess(
			falsyToNull,
			z
				.string()
				.trim()
				.regex(USER.CUSTOM_NAME_REGEXP)
				.max(USER.CUSTOM_NAME_MAX_LENGTH)
				.nullable(),
		),
		battlefy: z.preprocess(
			falsyToNull,
			z.string().max(USER.BATTLEFY_MAX_LENGTH).nullable(),
		),
		stickSens: z.preprocess(
			processMany(actualNumber, undefinedToNull),
			z
				.number()
				.min(-50)
				.max(50)
				.refine((val) => val % 5 === 0)
				.nullable(),
		),
		motionSens: z.preprocess(
			processMany(actualNumber, undefinedToNull),
			z
				.number()
				.min(-50)
				.max(50)
				.refine((val) => val % 5 === 0)
				.nullable(),
		),
		inGameNameText: z.preprocess(
			falsyToNull,
			z.string().max(USER.IN_GAME_NAME_TEXT_MAX_LENGTH).nullable(),
		),
		inGameNameDiscriminator: z.preprocess(
			falsyToNull,
			z
				.string()
				.refine((val) => /^[0-9a-z]{4,5}$/.test(val))
				.nullable(),
		),
		css: customCssVarObject,
		weapons: z.preprocess(
			safeJSONParse,
			z
				.array(
					z.object({
						weaponSplId,
						isFavorite: dbBoolean,
					}),
				)
				.max(USER.WEAPON_POOL_MAX_SIZE),
		),
		favoriteBadgeId: z.preprocess(
			processMany(actualNumber, undefinedToNull),
			id.nullable(),
		),
		showDiscordUniqueName: z.preprocess(checkboxValueToDbBoolean, dbBoolean),
		commissionsOpen: z.preprocess(checkboxValueToDbBoolean, dbBoolean),
		commissionText: z.preprocess(
			falsyToNull,
			z.string().max(USER.COMMISSION_TEXT_MAX_LENGTH).nullable(),
		),
	})
	.refine(
		(val) => {
			if (val.motionSens !== null && val.stickSens === null) {
				return false;
			}

			return true;
		},
		{
			message: "forms.errors.invalidSens",
		},
	);

export const action: ActionFunction = async ({ request }) => {
	const parsedInput = await safeParseRequestFormData({
		request,
		schema: userEditActionSchema,
	});

	if (!parsedInput.success) {
		return {
			errors: parsedInput.errors,
		};
	}

	const { inGameNameText, inGameNameDiscriminator, ...data } = parsedInput.data;

	const user = await requireUserId(request);
	const inGameName =
		inGameNameText && inGameNameDiscriminator
			? `${inGameNameText}#${inGameNameDiscriminator}`
			: null;

	try {
		const editedUser = await UserRepository.updateProfile({
			...data,
			inGameName,
			userId: user.id,
		});

		// TODO: to transaction
		if (inGameName) {
			const tournamentIdsAffected =
				await TournamentTeamRepository.updateMemberInGameNameForNonStarted({
					inGameName,
					userId: user.id,
				});

			for (const tournamentId of tournamentIdsAffected) {
				clearTournamentDataCache(tournamentId);
			}
		}

		throw redirect(userPage(editedUser));
	} catch (e) {
		if (!errorIsSqliteUniqueConstraintFailure(e)) {
			throw e;
		}

		return {
			errors: ["forms.errors.invalidCustomUrl.duplicate"],
		};
	}
};

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
	const locale = await i18next.getLocale(request);

	const user = await requireUser(request);
	const { identifier } = userParamsSchema.parse(params);
	const userToBeEdited = notFoundIfFalsy(
		await UserRepository.findLayoutDataByIdentifier(identifier),
	);
	if (user.id !== userToBeEdited.id) {
		throw redirect(userPage(userToBeEdited));
	}

	const userProfile = (await UserRepository.findProfileByIdentifier(
		identifier,
		true,
	))!;

	return {
		user: userProfile,
		favoriteBadgeId: user.favoriteBadgeId,
		discordUniqueName: userProfile.discordUniqueName,
		countries: Object.entries(countries)
			.map(([code, country]) => ({
				code,
				emoji: getEmojiFlag(code as TCountryCode),
				name:
					translatedCountry({
						countryCode: code,
						language: locale,
					}) ?? country.name,
			}))
			.sort((a, b) => a.name.localeCompare(b.name)),
	};
};

export default function UserEditPage() {
	const user = useUser();
	const { t } = useTranslation(["common", "user"]);
	const [, parentRoute] = useMatches();
	invariant(parentRoute);
	const layoutData = parentRoute.data as UserPageLoaderData;
	const data = useLoaderData<typeof loader>();

	return (
		<div className="half-width">
			<Form className="u-edit__container" method="post">
				{canAddCustomizedColorsToUserProfile(user) ? (
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
				{user?.isArtist ? (
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
	const { t } = useTranslation(["user"]);
	const data = useLoaderData<typeof loader>();

	return (
		<div>
			<label htmlFor="country">{t("user:country")}</label>
			<select
				className="u-edit__country-select"
				name="country"
				id="country"
				defaultValue={data.user.country ?? ""}
			>
				<option value="" />
				{data.countries.map((country) => (
					<option key={country.code} value={country.code}>
						{`${country.name} ${country.emoji}`}
					</option>
				))}
			</select>
		</div>
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

function BioTextarea({ initialValue }: { initialValue: User["bio"] }) {
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

	// doesn't make sense to select favorite badge
	// if user has no badges or only has 1 badge
	if (data.user.badges.length < 2) return null;

	// user's current favorite badge is the initial value
	const initialBadge = data.user.badges.find(
		(badge) => badge.id === data.favoriteBadgeId,
	);

	return (
		<div>
			<label htmlFor="favoriteBadgeId">{t("user:favoriteBadge")}</label>
			<select
				className=""
				name="favoriteBadgeId"
				id="favoriteBadgeId"
				defaultValue={initialBadge?.id}
			>
				{data.user.badges.map((badge) => (
					<option key={badge.id} value={badge.id}>
						{`${badge.displayName}`}
					</option>
				))}
			</select>
			<FormMessage type="info">
				{t("user:forms.info.favoriteBadge")}
			</FormMessage>
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
	initialValue: User["commissionText"];
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
