import { useTranslation } from "react-i18next";
import { Link, useLoaderData } from "react-router";
import { Label } from "~/components/Label";
import { Main } from "~/components/Main";
import { BadgesSelector } from "~/features/badges/components/BadgesSelector";
import { FormField } from "~/form/FormField";
import { SendouForm } from "~/form/SendouForm";
import { uploadImagePage } from "~/utils/urls";
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
				<Link
					to={uploadImagePage({
						type: "org-pfp",
						slug: data.organization.slug,
					})}
					className="text-sm font-bold"
				>
					{t("org:edit.form.uploadLogo")}
				</Link>

				<FormField name="name" />
				<FormField name="description" />
				<FormField name="members" />
				<FormField name="socials" />
				<FormField name="series" />
				{/** xxx: this should not be needed (FormField to accept badgeOptions as arg) */}
				<FormField name="badges">
					{({ value, onChange }) => (
						<div>
							<Label>{t("org:edit.form.badges.title")}</Label>
							<BadgesSelector
								options={data.badgeOptions}
								selectedBadges={value as number[]}
								onChange={onChange as (v: number[]) => void}
							/>
						</div>
					)}
				</FormField>
			</SendouForm>
		</Main>
	);
}
