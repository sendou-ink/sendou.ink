import * as React from "react";
import { useTranslation } from "react-i18next";
import { useLoaderData } from "react-router";
import { Divider } from "~/components/Divider";
import { SendouDialog } from "~/components/elements/Dialog";
import { type CustomFieldRenderProps, FormField } from "~/form/FormField";
import { FormFieldWrapper } from "~/form/fields/FormFieldWrapper";
import { SendouForm, useFormFieldContext } from "~/form/SendouForm";
import { useTimeFormat } from "~/hooks/useTimeFormat";
import { nullFilledArray } from "~/utils/arrays";
import { databaseTimestampToDate } from "~/utils/dates";
import type { loader as scrimsLoader } from "../loaders/scrims.server";
import { SCRIM } from "../scrims-constants";
import { scrimRequestFormSchema } from "../scrims-schemas";
import type { ScrimPost } from "../scrims-types";
import { generateTimeOptions } from "../scrims-utils";
import { WithFormField } from "./WithFormField";

export function ScrimRequestModal({
	post,
	close,
}: {
	post: ScrimPost;
	close: () => void;
}) {
	const { t, i18n } = useTranslation(["scrims"]);
	const data = useLoaderData<typeof scrimsLoader>();
	const { formatTime } = useTimeFormat();

	const timeOptions = post.rangeEnd
		? generateTimeOptions(
				databaseTimestampToDate(post.at),
				databaseTimestampToDate(post.rangeEnd),
			).map((timestamp) => ({
				value: timestamp,
				label: formatTime(new Date(timestamp)),
			}))
		: [];

	return (
		<SendouDialog heading={t("scrims:requestModal.title")} onClose={close}>
			<SendouForm
				schema={scrimRequestFormSchema}
				defaultValues={{
					scrimPostId: post.id,
					from:
						data.teams.length > 0
							? { mode: "TEAM", teamId: data.teams[0].id }
							: {
									mode: "PICKUP",
									users: nullFilledArray(
										SCRIM.MAX_PICKUP_SIZE_EXCLUDING_OWNER,
									) as unknown as number[],
								},
					message: "",
					at:
						post.rangeEnd && timeOptions[0]
							? new Date(timeOptions[0].value)
							: null,
				}}
			>
				{({ names }) => (
					<>
						<div className="font-semi-bold text-lighter italic">
							{new Intl.ListFormat(i18n.language).format(
								post.users.map((u) => u.username),
							)}
						</div>
						{post.text ? (
							<div className="text-sm text-lighter italic">{post.text}</div>
						) : null}
						<Divider />
						<FormField name={names.from}>
							{(props: CustomFieldRenderProps) => (
								<WithFormField usersTeams={data.teams} {...props} />
							)}
						</FormField>
						{post.rangeEnd ? (
							<StartTimeFormField timeOptions={timeOptions} />
						) : null}
						<FormField name={names.message} />
					</>
				)}
			</SendouForm>
		</SendouDialog>
	);
}

function StartTimeFormField({
	timeOptions,
}: {
	timeOptions: Array<{ value: number; label: string }>;
}) {
	const { t } = useTranslation(["scrims"]);
	const { values, setValue } = useFormFieldContext();
	const currentValue = values.at as number | null;
	const id = React.useId();

	return (
		<FormFieldWrapper
			id={id}
			name="at"
			label={t("scrims:requestModal.at.label")}
			bottomText={t("scrims:requestModal.at.explanation")}
		>
			<select
				id={id}
				value={currentValue ?? ""}
				onChange={(e) =>
					setValue("at", e.target.value ? Number(e.target.value) : null)
				}
			>
				{timeOptions.map((option) => (
					<option key={option.value} value={option.value}>
						{option.label}
					</option>
				))}
			</select>
		</FormFieldWrapper>
	);
}
