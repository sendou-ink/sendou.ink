import { Trans, useTranslation } from "react-i18next";
import { Link, useLoaderData, useMatches } from "react-router";
import { CustomizedColorsInput } from "~/components/CustomizedColorsInput";
import { FormMessage } from "~/components/FormMessage";
import { OBJECT_PRONOUNS, SUBJECT_PRONOUNS } from "~/db/tables";
import type { CustomFieldRenderProps } from "~/form/FormField";
import { SendouForm } from "~/form/SendouForm";
import { useIsMounted } from "~/hooks/useIsMounted";
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
export { loader, action };

import styles from "~/styles/u.$identifier.module.css";

export const handle: SendouRouteHandle = {
	i18n: ["user"],
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
		css: layoutData.css ?? null,
		customName: data.user.customName ?? "",
		customUrl: layoutData.user.customUrl ?? "",
		inGameName: data.user.inGameName ?? "",
		sensitivity: sensDefaultValue(data.user.motionSens, data.user.stickSens),
		pronouns: data.user.pronouns ?? { subject: null, object: null },
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
						{isSupporter ? (
							<FormField name="css">
								{(props: CustomFieldRenderProps) => (
									<CssCustomField {...props} initialColors={layoutData.css} />
								)}
							</FormField>
						) : null}
						<FormField name="customName" />
						<FormField name="customUrl" />
						<FormField name="inGameName" />
						<FormField name="sensitivity" />
						<FormField name="pronouns">
							{(props: CustomFieldRenderProps) => {
								const pronouns = (props.value as {
									subject: string | null;
									object: string | null;
								}) ?? { subject: null, object: null };
								return (
									<PronounsCustomField
										pronouns={pronouns}
										onChange={
											props.onChange as (value: {
												subject: string | null;
												object: string | null;
											}) => void
										}
									/>
								);
							}}
						</FormField>
						<FormField name="battlefy" />
						<FormField name="country" options={countryOptions} />
						{data.user.badges.length >= 2 ? (
							<FormField name="favoriteBadgeIds" options={badgeOptions} />
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
						<FormField name="newProfileEnabled" />
						<FormMessage type="info">
							<Trans i18nKey={"user:discordExplanation"} t={t}>
								Username, profile picture, YouTube, Bluesky and Twitch accounts
								come from your Discord account. See{" "}
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
	const isMounted = useIsMounted();

	return COUNTRY_CODES.map((countryCode) => ({
		value: countryCode,
		label: isMounted
			? countryCodeToTranslatedName({
					countryCode,
					language: i18n.language,
				})
			: countryCode,
	})).sort((a, b) =>
		a.label.localeCompare(b.label, i18n.language, { sensitivity: "base" }),
	);
}

function CssCustomField({
	value,
	onChange,
	initialColors,
}: CustomFieldRenderProps & {
	initialColors?: Record<string, string> | null;
}) {
	return (
		<CustomizedColorsInput
			initialColors={initialColors}
			value={value as Record<string, string> | null}
			onChange={onChange as (value: Record<string, string> | null) => void}
		/>
	);
}

// xxx: alignment off
function PronounsCustomField({
	pronouns,
	onChange,
}: {
	pronouns: { subject: string | null; object: string | null };
	onChange: (value: { subject: string | null; object: string | null }) => void;
}) {
	const { t } = useTranslation(["user"]);

	return (
		<div>
			<div className="stack horizontal md">
				<div>
					<label htmlFor="subjectPronoun">{t("user:pronoun")}</label>
					<select
						id="subjectPronoun"
						value={pronouns.subject ?? ""}
						onChange={(e) =>
							onChange({
								...pronouns,
								subject: e.target.value || null,
							})
						}
					>
						<option value="">{"-"}</option>
						{SUBJECT_PRONOUNS.map((pronoun) => (
							<option key={pronoun} value={pronoun}>
								{pronoun}
							</option>
						))}
					</select>
					<span className={styles.seperator}>/</span>
				</div>
				<div>
					<label htmlFor="objectPronoun">{t("user:pronoun")}</label>
					<select
						id="objectPronoun"
						value={pronouns.object ?? ""}
						onChange={(e) =>
							onChange({
								...pronouns,
								object: e.target.value || null,
							})
						}
					>
						<option value="">{"-"}</option>
						{OBJECT_PRONOUNS.map((pronoun) => (
							<option key={pronoun} value={pronoun}>
								{pronoun}
							</option>
						))}
					</select>
				</div>
			</div>
			<FormMessage type="info">{t("user:pronounsInfo")}</FormMessage>
		</div>
	);
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
