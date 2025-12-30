import { useTranslation } from "react-i18next";
import { useLoaderData } from "react-router";
import { Divider } from "~/components/Divider";
import { SendouDialog } from "~/components/elements/Dialog";
import { SelectFormField } from "~/components/form/SelectFormField";
import { SendouForm } from "~/components/form/SendouForm";
import { TextAreaFormField } from "~/components/form/TextAreaFormField";
import { useTimeFormat } from "~/hooks/useTimeFormat";
import { nullFilledArray } from "~/utils/arrays";
import { databaseTimestampToDate } from "~/utils/dates";
import type { loader as scrimsLoader } from "../loaders/scrims.server";
import type { NewRequestFormFields } from "../routes/scrims";
import { SCRIM } from "../scrims-constants";
import { newRequestSchema } from "../scrims-schemas";
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
				schema={newRequestSchema}
				defaultValues={{
					_action: "NEW_REQUEST",
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
					at: post.rangeEnd ? (timeOptions[0]?.value as unknown as Date) : null,
				}}
			>
				<div className="font-semi-bold text-lighter italic">
					{new Intl.ListFormat(i18n.language).format(
						post.users.map((u) => u.username),
					)}
				</div>
				{post.text ? (
					<div className="text-sm text-lighter italic">{post.text}</div>
				) : null}
				<Divider />
				<WithFormField usersTeams={data.teams} />
				{post.rangeEnd ? (
					<SelectFormField<NewRequestFormFields>
						name="at"
						label={t("scrims:requestModal.at.label")}
						bottomText={t("scrims:requestModal.at.explanation")}
						values={timeOptions}
					/>
				) : null}
				<TextAreaFormField<NewRequestFormFields>
					name="message"
					label={t("scrims:requestModal.message.label")}
					maxLength={SCRIM.REQUEST_MESSAGE_MAX_LENGTH}
				/>
			</SendouForm>
		</SendouDialog>
	);
}
