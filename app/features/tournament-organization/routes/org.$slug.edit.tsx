import { Link, useLoaderData } from "@remix-run/react";
import { Controller, useFieldArray, useFormContext } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { FormMessage } from "~/components/FormMessage";
import { Label } from "~/components/Label";
import { Main } from "~/components/Main";
import { AddFieldButton } from "~/components/form/AddFieldButton";
import { FormFieldset } from "~/components/form/FormFieldset";
import { MyForm } from "~/components/form/MyForm";
import { SelectFormField } from "~/components/form/SelectFormField";
import { TextAreaFormField } from "~/components/form/TextAreaFormField";
import { TextArrayFormField } from "~/components/form/TextArrayFormField";
import { TextFormField } from "~/components/form/TextFormField";
import { ToggleFormField } from "~/components/form/ToggleFormField";
import { UserSearchFormField } from "~/components/form/UserSearchFormField";
import { TOURNAMENT_ORGANIZATION_ROLES } from "~/db/tables";
import { BadgeDisplay } from "~/features/badges/components/BadgeDisplay";
import { wrapToValueStringArrayWithDefault } from "~/utils/form";
import type { Unpacked } from "~/utils/types";
import { mySlugify, uploadImagePage } from "~/utils/urls";
import { falsyToNull, id } from "~/utils/zod";

import { action } from "../actions/org.$slug.edit.server";
import { loader } from "../loaders/org.$slug.edit.server";
import { handle, meta } from "../routes/org.$slug";
export { loader, action, handle, meta };

const DESCRIPTION_MAX_LENGTH = 1_000;
export const organizationEditSchema = z.object({
	name: z
		.string()
		.trim()
		.min(2)
		.max(32)
		.refine((val) => mySlugify(val).length >= 2, {
			message: "Not enough non-special characters",
		}),
	description: z.preprocess(
		falsyToNull,
		z.string().trim().max(DESCRIPTION_MAX_LENGTH).nullable(),
	),
	members: z
		.array(
			z.object({
				userId: z.number().int().positive(),
				role: z.enum(TOURNAMENT_ORGANIZATION_ROLES),
				roleDisplayName: z.preprocess(
					falsyToNull,
					z.string().trim().max(32).nullable(),
				),
			}),
		)
		.max(32)
		.refine(
			(arr) =>
				arr.map((x) => x.userId).length ===
				new Set(arr.map((x) => x.userId)).size,
			{
				message: "Same member listed twice",
			},
		),
	socials: z
		.array(
			z.object({
				value: z.string().trim().url().max(100).optional().or(z.literal("")),
			}),
		)
		.max(10)
		.refine(
			(arr) =>
				arr.map((x) => x.value).length ===
				new Set(arr.map((x) => x.value)).size,
			{
				message: "Duplicate social links",
			},
		),
	series: z
		.array(
			z.object({
				name: z.string().trim().min(1).max(32),
				description: z.preprocess(
					falsyToNull,
					z.string().trim().max(DESCRIPTION_MAX_LENGTH).nullable(),
				),
				showLeaderboard: z.boolean(),
			}),
		)
		.max(10)
		.refine(
			(arr) =>
				arr.map((x) => x.name).length === new Set(arr.map((x) => x.name)).size,
			{
				message: "Duplicate series",
			},
		),
	badges: z.array(id).max(50),
});

type FormFields = z.infer<typeof organizationEditSchema> & {
	members: Array<
		Omit<
			Unpacked<z.infer<typeof organizationEditSchema>["members"]>,
			"userId"
		> & {
			userId: number | null;
		}
	>;
};

export default function TournamentOrganizationEditPage() {
	const data = useLoaderData<typeof loader>();
	const { t } = useTranslation(["org", "common"]);

	return (
		<Main>
			<MyForm
				title={t("org:edit.form.title")}
				schema={organizationEditSchema}
				defaultValues={{
					name: data.organization.name,
					description: data.organization.description,
					socials: wrapToValueStringArrayWithDefault(data.organization.socials),
					members: data.organization.members.map((member) => ({
						userId: member.id,
						role: member.role,
						roleDisplayName: member.roleDisplayName,
					})),
					series: data.organization.series.map((series) => ({
						name: series.name,
						description: series.description,
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

				<TextFormField<FormFields> label={t("common:forms.name")} name="name" />

				<TextAreaFormField<typeof organizationEditSchema>
					label={t("common:forms.description")}
					name="description"
					maxLength={DESCRIPTION_MAX_LENGTH}
				/>

				<MembersFormField />

				<TextArrayFormField<typeof organizationEditSchema>
					label={t("org:edit.form.socialLinks.title")}
					name="socials"
					defaultFieldValue=""
				/>

				<SeriesFormField />

				<BadgesFormField />
			</MyForm>
		</Main>
	);
}

function MembersFormField() {
	const {
		formState: { errors },
	} = useFormContext<FormFields>();
	const { fields, append, remove } = useFieldArray<FormFields>({
		name: "members",
	});
	const { t } = useTranslation(["org"]);

	const rootError = errors.members?.root;

	return (
		<div>
			<Label>{t("org:edit.form.members.title")}</Label>
			<div className="stack md">
				{fields.map((field, i) => {
					return <MemberFieldset key={field.id} idx={i} remove={remove} />;
				})}
				<AddFieldButton
					onClick={() => {
						append({ role: "MEMBER", roleDisplayName: null, userId: null });
					}}
				/>
				{rootError && (
					<FormMessage type="error">{rootError.message as string}</FormMessage>
				)}
				<FormMessage type="info">{t("org:edit.form.members.info")}</FormMessage>
			</div>
		</div>
	);
}

function MemberFieldset({
	idx,
	remove,
}: { idx: number; remove: (idx: number) => void }) {
	const { t } = useTranslation(["org"]);
	const { clearErrors } = useFormContext<FormFields>();

	return (
		<FormFieldset
			title={`#${idx + 1}`}
			onRemove={() => {
				remove(idx);
				clearErrors("members");
			}}
		>
			<UserSearchFormField<FormFields>
				label={t("org:edit.form.members.user.title")}
				name={`members.${idx}.userId` as const}
			/>

			<SelectFormField<FormFields>
				label={t("org:edit.form.members.role.title")}
				name={`members.${idx}.role` as const}
				values={TOURNAMENT_ORGANIZATION_ROLES.map((role) => ({
					value: role,
					label: t(`org:roles.${role}`),
				}))}
			/>

			<TextFormField<FormFields>
				label={t("org:edit.form.members.roleDisplayName.title")}
				name={`members.${idx}.roleDisplayName` as const}
			/>
		</FormFieldset>
	);
}

function SeriesFormField() {
	const {
		formState: { errors },
	} = useFormContext<FormFields>();
	const { fields, append, remove } = useFieldArray<FormFields>({
		name: "series",
	});
	const { t } = useTranslation(["org"]);

	const rootError = errors.series?.root;

	return (
		<div>
			<Label>{t("org:edit.form.series.title")}</Label>
			<div className="stack md">
				{fields.map((field, i) => {
					return <SeriesFieldset key={field.id} idx={i} remove={remove} />;
				})}
				<AddFieldButton
					onClick={() => {
						append({ description: "", name: "", showLeaderboard: false });
					}}
				/>
				{rootError && (
					<FormMessage type="error">{rootError.message as string}</FormMessage>
				)}
			</div>
		</div>
	);
}

function SeriesFieldset({
	idx,
	remove,
}: { idx: number; remove: (idx: number) => void }) {
	const { t } = useTranslation(["org", "common"]);
	const { clearErrors } = useFormContext<FormFields>();

	return (
		<FormFieldset
			title={`#${idx + 1}`}
			onRemove={() => {
				remove(idx);
				clearErrors("series");
			}}
		>
			<TextFormField<FormFields>
				label={t("org:edit.form.series.seriesName.title")}
				name={`series.${idx}.name` as const}
			/>

			<TextAreaFormField<FormFields>
				label={t("common:forms.description")}
				name={`series.${idx}.description` as const}
				maxLength={DESCRIPTION_MAX_LENGTH}
			/>

			<ToggleFormField<FormFields>
				label={t("org:edit.form.series.showLeaderboard.title")}
				name={`series.${idx}.showLeaderboard` as const}
			/>
		</FormFieldset>
	);
}

function BadgesFormField() {
	const { t } = useTranslation(["org"]);
	const methods = useFormContext<FormFields>();

	return (
		<div>
			<Label>{t("org:edit.form.badges.title")}</Label>
			<Controller
				control={methods.control}
				name="badges"
				render={({ field: { onChange, onBlur, value } }) => (
					<BadgesSelector
						selectedBadges={value}
						onBlur={onBlur}
						onChange={onChange}
					/>
				)}
			/>
		</div>
	);
}

function BadgesSelector({
	selectedBadges,
	onChange,
	onBlur,
}: {
	selectedBadges: number[];
	onChange: (newBadges: number[]) => void;
	onBlur: () => void;
}) {
	const { t } = useTranslation(["org"]);
	const data = useLoaderData<typeof loader>();

	return (
		<div className="stack md">
			{selectedBadges.length > 0 ? (
				<BadgeDisplay
					badges={data.badgeOptions.filter((badge) =>
						selectedBadges.includes(badge.id),
					)}
					onBadgeRemove={(badgeId) =>
						onChange(selectedBadges.filter((id) => id !== badgeId))
					}
					key={selectedBadges.join(",")}
				/>
			) : (
				<div className="text-lighter text-md font-bold">
					{t("org:edit.form.badges.none")}
				</div>
			)}
			<select
				onBlur={onBlur}
				onChange={(e) => onChange([Number(e.target.value), ...selectedBadges])}
			>
				<option>{t("org:edit.form.badges.select")}</option>
				{data.badgeOptions
					.filter((badge) => !selectedBadges.includes(badge.id))
					.map((badge) => (
						<option key={badge.id} value={badge.id}>
							{badge.displayName}
						</option>
					))}
			</select>
		</div>
	);
}
