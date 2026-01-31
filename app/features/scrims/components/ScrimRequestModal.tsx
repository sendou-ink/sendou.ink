import { useTranslation } from "react-i18next";
import { useLoaderData } from "react-router";
import { Divider } from "~/components/Divider";
import { SendouDialog } from "~/components/elements/Dialog";
import type { CustomFieldRenderProps } from "~/form";
import { SendouForm } from "~/form/SendouForm";
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
				value: String(timestamp),
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
					at: post.rangeEnd && timeOptions[0] ? timeOptions[0].value : null,
				}}
			>
				{({ FormField }) => (
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
						<FormField name="from">
							{(props: CustomFieldRenderProps) => (
								<WithFormField usersTeams={data.teams} {...props} />
							)}
						</FormField>
						{post.rangeEnd ? (
							<FormField name="at" options={timeOptions} />
						) : null}
						<FormField name="message" />
					</>
				)}
			</SendouForm>
		</SendouDialog>
	);
}
