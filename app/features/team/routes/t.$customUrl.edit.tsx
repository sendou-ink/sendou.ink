import { useTranslation } from "react-i18next";
import type { MetaFunction } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { CustomThemeSelector } from "~/components/CustomThemeSelector";
import { Divider } from "~/components/Divider";
import { Main, mainStyles } from "~/components/Main";
import { TeamGoBackButton } from "~/features/team/components/TeamGoBackButton";
import { existingImage } from "~/form/image-field";
import { SendouForm } from "~/form/SendouForm";
import type { ThemeInput } from "~/utils/oklch-gamut";
import { metaTags } from "~/utils/remix";
import { action } from "../actions/t.$customUrl.edit.server";
import { loader } from "../loaders/t.$customUrl.edit.server";
import styles from "../team.module.css";
import { editTeamFormSchema } from "../team-schemas";

export { action, loader };

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

function TeamCustomThemeSelector() {
	const { customTheme, canAddCustomizedColors } =
		useLoaderData<typeof loader>();
	const fetcher = useFetcher();

	const handleSave = (themeInput: ThemeInput) => {
		fetcher.submit(
			{
				_action: "UPDATE_CUSTOM_THEME",
				newValue: themeInput,
			} as unknown as Parameters<typeof fetcher.submit>[0],
			{ method: "post", encType: "application/json" },
		);
	};

	const handleReset = () => {
		fetcher.submit(
			{ _action: "UPDATE_CUSTOM_THEME", newValue: null },
			{ method: "post", encType: "application/json" },
		);
	};

	return (
		<CustomThemeSelector
			initialTheme={customTheme}
			isSupporter={canAddCustomizedColors}
			isPersonalTheme={false}
			onSave={handleSave}
			onReset={handleReset}
			fetcherState={fetcher.state}
		/>
	);
}
