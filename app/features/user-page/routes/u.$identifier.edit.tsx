import { Trans, useTranslation } from "react-i18next";
import { Link, useLoaderData, useMatches } from "react-router";
import { FormMessage } from "~/components/FormMessage";
import { FriendCodePopover } from "~/components/FriendCodePopover";
import { BADGE } from "~/features/badges/badges-constants";
import { SendouForm } from "~/form/SendouForm";
import { useHydrated } from "~/hooks/useHydrated";
import { useHasRole } from "~/modules/permissions/hooks";
import { countryCodeToTranslatedName } from "~/utils/i18n";
import invariant from "~/utils/invariant";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { FAQ_PAGE } from "~/utils/urls";
import { action } from "../actions/u.$identifier.edit.server";
import { loader } from "../loaders/u.$identifier.edit.server";
import type { UserPageLoaderData } from "../loaders/u.$identifier.server";
import { COUNTRY_CODES } from "../user-page-constants";
import { userEditProfileBaseSchema } from "../user-page-schemas";

export { action, loader };

export const handle: SendouRouteHandle = {
	i18n: ["common", "user"],
};

export default function UserEditPage() {
	const { t } = useTranslation(["common", "user"]);
	const [, parentRoute] = useMatches();
	invariant(parentRoute);
	const layoutData = parentRoute.data as UserPageLoaderData;
	const data = useLoaderData<typeof loader>();
	const isSupporter = useHasRole("SUPPORTER");
	const isArtist = useHasRole("ARTIST");

	const countryOptions = useCountryOptions();

	const badgeOptions = data.user.badges.map((badge) => ({
		id: badge.id,
		displayName: badge.displayName,
		code: badge.code,
		hue: badge.hue,
	}));

	const defaultValues = {
		customName: data.user.customName ?? "",
		customUrl: layoutData.user.customUrl ?? "",
		inGameName: data.user.inGameName ?? "",
		sensitivity: sensDefaultValue(data.user.motionSens, data.user.stickSens),
		pronouns: pronounsDefaultValue(data.user.pronouns),
		battlefy: data.user.battlefy ?? "",
		country: data.user.country ?? null,
		favoriteBadgeIds: data.favoriteBadgeIds ?? [],
		weapons: data.user.weapons.map((w) => ({
			id: w.weaponSplId,
			isFavorite: Boolean(w.isFavorite),
		})),
		bio: data.user.bio ?? "",
		showDiscordUniqueName: Boolean(data.user.showDiscordUniqueName),
		commissionsOpen: Boolean(layoutData.user.commissionsOpen),
		commissionText: layoutData.user.commissionText ?? "",
		newProfileEnabled: isSupporter && data.newProfileEnabled,
	};

	return (
		<div className="half-width">
			<SendouForm
				schema={userEditProfileBaseSchema}
				defaultValues={defaultValues}
				submitButtonText={t("common:actions.save")}
			>
				{({ FormField }) => (
					<>
						<FriendCodePopover />
						<FormField name="customName" />
						<FormField name="customUrl" />
						<FormField name="inGameName" />
						<FormField name="sensitivity" />
						<FormField name="pronouns" />
						<FormField name="battlefy" />
						<FormField name="country" options={countryOptions} />
						{data.user.badges.length >= 2 ? (
							<FormField
								name="favoriteBadgeIds"
								options={badgeOptions}
								maxCount={
									isSupporter ? BADGE.SMALL_BADGES_PER_DISPLAY_PAGE + 1 : 1
								}
							/>
						) : null}
						<FormField name="weapons" />
						<FormField name="bio" />
						{data.discordUniqueName ? (
							<FormField name="showDiscordUniqueName" />
						) : null}
						{isArtist ? (
							<>
								<FormField name="commissionsOpen" />
								<FormField name="commissionText" />
							</>
						) : null}
						<FormField name="newProfileEnabled" disabled={!isSupporter} />
						<FormMessage type="info">
							<Trans i18nKey={"user:discordExplanation"} t={t}>
								Username, profile picture, YouTube, Bluesky and Twitch accounts
								come from your Discord account. See
								<Link to={FAQ_PAGE}>FAQ</Link> for more information.
							</Trans>
						</FormMessage>
					</>
				)}
			</SendouForm>
		</div>
	);
}

function useCountryOptions() {
	const { i18n } = useTranslation();
	const isHydrated = useHydrated();

	return COUNTRY_CODES.map((countryCode) => ({
		value: countryCode,
		label: isHydrated
			? countryCodeToTranslatedName({
					countryCode,
					language: i18n.language,
				})
			: countryCode,
	})).sort((a, b) =>
		a.label.localeCompare(b.label, i18n.language, { sensitivity: "base" }),
	);
}

function pronounsDefaultValue(
	pronouns: { subject: string; object: string } | null,
): [string | null, string | null] {
	if (!pronouns) return [null, null];
	return [pronouns.subject, pronouns.object];
}

function sensDefaultValue(
	motionSens: number | null,
	stickSens: number | null,
): [string | null, string | null] {
	if (motionSens === null && stickSens === null) return [null, null];
	return [
		motionSens !== null ? String(motionSens) : null,
		stickSens !== null ? String(stickSens) : null,
	];
}
