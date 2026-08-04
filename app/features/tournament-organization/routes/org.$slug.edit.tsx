import { useTranslation } from "react-i18next";
import { useFetcher, useLoaderData } from "react-router";
import { CustomThemeSelector } from "~/components/CustomThemeSelector";
import { Divider } from "~/components/Divider";
import { Main } from "~/components/Main";
import { existingImage } from "~/form/image-field";
import { SendouForm } from "~/form/SendouForm";
import styles from "~/form/SendouForm.module.css";
import type { ThemeInput } from "~/utils/oklch-gamut";
import { action } from "../actions/org.$slug.edit.server";
import { loader } from "../loaders/org.$slug.edit.server";
import { handle, meta } from "../routes/org.$slug";
import { organizationEditFormSchema } from "../tournament-organization-schemas";

export { action, handle, loader, meta };

export default function TournamentOrganizationEditPage() {
	const data = useLoaderData<typeof loader>();
	const { t } = useTranslation(["org"]);

	return (
		<Main>
			<SendouForm
				title={t("org:edit.form.title")}
				schema={organizationEditFormSchema}
				defaultValues={{
					name: data.organization.name,
					logo: existingImage(
						data.organization.avatarImgId,
						data.organization.avatarUrl,
					),
					description: data.organization.description ?? "",
					socials: data.organization.socials ?? [],
					members: data.organization.members.map((member) => ({
						userId: member.id,
						role: member.role,
						roleDisplayName: member.roleDisplayName ?? "",
					})),
					series: data.organization.series.map((series) => ({
						name: series.name,
						description: series.description ?? "",
						showLeaderboard: Boolean(series.showLeaderboard),
					})),
					badges: data.organization.badges.map((badge) => badge.id),
				}}
			>
				{({ FormField }) => (
					<>
						<FormField name="name" />
						<FormField name="logo" />
						<FormField name="description" />
						<FormField name="members" />
						<FormField name="socials" />
						<FormField name="series" />
						<FormField name="badges" options={data.badgeOptions} />
					</>
				)}
			</SendouForm>
			{data.canSetCustomTheme ? (
				<div className={styles.form}>
					<Divider className="mt-10" smallText>
						{t("org:edit.form.customTheme.title")}
					</Divider>
					<OrganizationCustomThemeSelector />
				</div>
			) : null}
		</Main>
	);
}

function OrganizationCustomThemeSelector() {
	const data = useLoaderData<typeof loader>();
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
			initialTheme={data.customTheme}
			isSupporter={data.canSetCustomTheme}
			isPersonalTheme={false}
			hidePatreonInfo
			onSave={handleSave}
			onReset={handleReset}
			fetcherState={fetcher.state}
		/>
	);
}
