import { useTranslation } from "react-i18next";
import { useLoaderData } from "react-router";
import { Main } from "~/components/Main";
import { existingImage } from "~/form/image-field";
import { SendouForm } from "~/form/SendouForm";
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
		</Main>
	);
}
