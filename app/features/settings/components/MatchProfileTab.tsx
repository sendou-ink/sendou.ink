import { Pencil } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLoaderData, useLocation } from "react-router";
import { LinkButton } from "~/components/elements/Button";
import { FormMessage } from "~/components/FormMessage";
import type { UserMapModePreferences } from "~/db/tables-json";
import { userCardEditPage } from "~/features/user-card/user-card-urls";
import { SendouForm } from "~/form/SendouForm";
import type { loader } from "../loaders/settings.server";
import { updateMatchProfileSchema } from "../match-profile-schemas";
import {
	MapModePreferencesField,
	preferencesFromRaw,
} from "./MapModePreferencesField";

export function MatchProfileTab() {
	const { t } = useTranslation(["user", "settings"]);
	const data = useLoaderData<typeof loader>();
	const location = useLocation();
	const matchProfile = data.matchProfile;

	if (!matchProfile) return null;

	return (
		<div className="stack md">
			<LinkButton
				to={userCardEditPage({
					returnTo: `${location.pathname}${location.search}`,
				})}
				size="small"
				variant="outlined"
				icon={<Pencil />}
				className="self-start"
			>
				{t("user:card.edit.title")}
			</LinkButton>
			<SendouForm
				schema={updateMatchProfileSchema}
				defaultValues={{
					mapModePreferences: preferencesFromRaw(
						matchProfile.mapModePreferences,
					),
					weaponPool: (matchProfile.weaponPool ?? []).map((w) => ({
						id: w.weaponSplId,
						isFavorite: Boolean(w.isFavorite),
					})),
					vc: matchProfile.vc ?? "NO",
					languages: matchProfile.languages ?? [],
					noScreen: Boolean(matchProfile.noScreen),
				}}
				revalidateRoot
			>
				{({ FormField }) => (
					<>
						<FormField name="mapModePreferences">
							{(props: {
								value: unknown;
								onChange: (value: UserMapModePreferences) => void;
							}) => (
								<MapModePreferencesField
									value={props.value as UserMapModePreferences}
									onChange={props.onChange}
								/>
							)}
						</FormField>
						<FormMessage type="info">
							{t("settings:matchProfile.maps.teamPreferencesHint")}
						</FormMessage>
						<FormField name="weaponPool" />
						<FormField name="vc" />
						<FormField name="languages" />
						<FormField name="noScreen" />
					</>
				)}
			</SendouForm>
		</div>
	);
}
