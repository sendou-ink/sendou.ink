import { Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { ActionButton } from "~/components/ActionButton";
import { CustomThemeSelector } from "~/components/CustomThemeSelector";
import { Divider } from "~/components/Divider";
import { Main, mainStyles } from "~/components/Main";
import type { UserMapModePreferences } from "~/db/tables-json";
import {
	MapModePreferencesField,
	preferencesFromRaw,
} from "~/features/settings/components/MapModePreferencesField";
import { TeamGoBackButton } from "~/features/team/components/TeamGoBackButton";
import { existingImage } from "~/form/image-field";
import { SendouForm } from "~/form/SendouForm";
import { useActionSubmit } from "~/hooks/useActionSubmit";
import type { ThemeInput } from "~/utils/oklch-gamut";
import { metaTags } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { action } from "../actions/t.$customUrl.edit.server";
import { loader } from "../loaders/t.$customUrl.edit.server";
import {
	editTeamActionSchema,
	editTeamFormSchema,
	updateTeamCustomThemeSchema,
	updateTeamMapModePreferencesSchema,
} from "../team-schemas";
import styles from "./t.$customUrl.edit.module.css";

export { action, loader };

export const handle: SendouRouteHandle = {
	i18n: ["settings"],
};

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "Editing team",
		location: args.location,
	});
};

export default function EditTeamPage() {
	const { t } = useTranslation(["common", "team"]);
	const { team, canAddCustomizedColors } = useLoaderData<typeof loader>();

	return (
		<Main className="stack lg">
			<TeamGoBackButton />
			<div className={mainStyles.narrow}>
				<SendouForm
					schema={editTeamFormSchema}
					title={t("team:editTeam.header", { teamName: team.name })}
					defaultValues={{
						name: team.name,
						tag: team.tag ?? "",
						bsky: team.bsky ?? "",
						bio: team.bio ?? "",
						logo: existingImage(team.avatarImgId, team.avatarUrl),
						banner: existingImage(team.bannerImgId, team.bannerUrl),
					}}
					submitButtonText={t("common:actions.submit")}
					submitButtonTestId="edit-team-submit-button"
				>
					{({ FormField }) => (
						<>
							<FormField name="name" />
							<FormField name="tag" />
							<FormField name="bsky" />
							<FormField name="bio" />
							<FormField name="logo" />
							<FormField name="banner" />
						</>
					)}
				</SendouForm>
				<Divider className={styles.mapPreferencesDivider} smallText>
					{t("team:mapPreferences.header")}
				</Divider>
				<TeamMapModePreferences />
				{canAddCustomizedColors ? (
					<>
						<Divider className={styles.formDivider} smallText>
							{t("team:forms.customTheme.header")}
						</Divider>
						<TeamCustomThemeSelector />
					</>
				) : null}
			</div>
		</Main>
	);
}

function TeamMapModePreferences() {
	const { t } = useTranslation(["common", "team"]);
	const { team } = useLoaderData<typeof loader>();

	return (
		<div className="stack md">
			{team.mapModePreferences ? (
				<ActionButton
					schema={editTeamActionSchema}
					action="REMOVE_MAP_MODE_PREFERENCES"
					variant="minimal-destructive"
					size="small"
					icon={<Trash2 />}
					className="mx-auto"
					aria-label="Remove team map preferences"
					confirm={{
						dialogHeading: t("team:mapPreferences.remove.header", {
							teamName: team.name,
						}),
					}}
				>
					{t("common:actions.remove")}
				</ActionButton>
			) : null}
			<div className="text-lighter text-sm text-center">
				{t("team:mapPreferences.explanation")}
			</div>
			<SendouForm
				key={JSON.stringify(team.mapModePreferences ?? null)}
				schema={updateTeamMapModePreferencesSchema}
				defaultValues={{
					mapModePreferences: preferencesFromRaw(team.mapModePreferences),
				}}
				submitButtonText={t("common:actions.save")}
				submitButtonTestId="team-map-preferences-submit-button"
			>
				{({ FormField }) => (
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
				)}
			</SendouForm>
		</div>
	);
}

function TeamCustomThemeSelector() {
	const { customTheme, canAddCustomizedColors } =
		useLoaderData<typeof loader>();
	const { submit, state } = useActionSubmit(updateTeamCustomThemeSchema, {
		encType: "application/json",
	});

	const handleSave = (themeInput: ThemeInput) => {
		submit("UPDATE_CUSTOM_THEME", { newValue: themeInput });
	};

	const handleReset = () => {
		submit("UPDATE_CUSTOM_THEME", { newValue: null });
	};

	return (
		<CustomThemeSelector
			initialTheme={customTheme}
			isSupporter={canAddCustomizedColors}
			isPersonalTheme={false}
			onSave={handleSave}
			onReset={handleReset}
			fetcherState={state}
		/>
	);
}
