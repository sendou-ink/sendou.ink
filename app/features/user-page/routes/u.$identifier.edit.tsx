import { Trans, useTranslation } from "react-i18next";
import { Link, useLoaderData, useMatches } from "react-router";
import { FormMessage } from "~/components/FormMessage";
import { FriendCodePopover } from "~/components/FriendCodePopover";
import { BADGE } from "~/features/badges/badges-constants";
import { SMALL_TROPHIES_PER_DISPLAY_PAGE } from "~/features/trophies/trophies-constants";
import { existingImage } from "~/form/image-field";
import { SendouForm } from "~/form/SendouForm";
import { useHydrated } from "~/hooks/useHydrated";
import { useHasRole } from "~/modules/permissions/hooks";
import { countryCodeToTranslatedName } from "~/utils/i18n";
import invariant from "~/utils/invariant";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { FAQ_PAGE, userPage } from "~/utils/urls";
import { action } from "../actions/u.$identifier.edit.server";
import { SubPageHeader } from "../components/SubPageHeader";
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
	const layoutData = parentRoute.loaderData as UserPageLoaderData;
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

	const trophyOptions = data.ownedTrophies.map((trophy) => ({
		id: trophy.id,
		name: trophy.name,
		model: trophy.model,
		tier: trophy.tier,
	}));

	const defaultValues = {
		customAvatar: existingImage(
			data.user.customAvatarImgId,
			data.user.customAvatarUrl,
		),
		customName: data.user.customName ?? "",
		customUrl: layoutData.user.customUrl ?? "",
		inGameName: data.user.inGameName ?? "",
		pronouns: pronounsDefaultValue(data.user.pronouns),
		country: data.user.country ?? null,
		favoriteBadgeIds: data.favoriteBadgeIds ?? [],
		favoriteTrophyIds: data.favoriteTrophyIds ?? [],
		hiddenTrophyIds: data.hiddenTrophyIds ?? [],
		showDiscordUniqueName: Boolean(data.user.showDiscordUniqueName),
		commissionsOpen: Boolean(layoutData.user.commissionsOpen),
		commissionText: layoutData.user.commissionText ?? "",
	};

	return (
		<div className="stack lg">
			<SubPageHeader
				user={layoutData.user}
				backTo={userPage(layoutData.user)}
			/>
			<div className="half-width">
				<SendouForm
					schema={userEditProfileBaseSchema}
					defaultValues={defaultValues}
					submitButtonText={t("common:actions.save")}
					revalidateRoot
				>
					{({ FormField }) => (
						<>
							<FriendCodePopover />
							<FormField name="customName" />
							<FormField name="customUrl" />
							<FormField name="customAvatar" disabled={!isSupporter} />
							<FormField name="inGameName" />
							<FormField name="pronouns" />
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
							{isSupporter && data.ownedTrophies.length >= 2 ? (
								<FormField
									name="favoriteTrophyIds"
									options={trophyOptions}
									maxCount={SMALL_TROPHIES_PER_DISPLAY_PAGE}
								/>
							) : null}
							{data.ownedTrophies.length >= 1 ? (
								<FormField name="hiddenTrophyIds" options={trophyOptions} />
							) : null}
							{data.discordUniqueName ? (
								<FormField name="showDiscordUniqueName" />
							) : null}
							{isArtist ? (
								<>
									<FormField name="commissionsOpen" />
									<FormField name="commissionText" />
								</>
							) : null}
							<FormMessage type="info">
								<Trans i18nKey={"user:discordExplanation"} t={t}>
									Username, profile picture, YouTube, Bluesky and Twitch
									accounts come from your Discord account. See
									<Link to={FAQ_PAGE}>FAQ</Link> for more information.
								</Trans>
							</FormMessage>
						</>
					)}
				</SendouForm>
			</div>
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
