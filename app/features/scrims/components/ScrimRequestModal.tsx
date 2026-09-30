import { useTranslation } from "react-i18next";
import { useLoaderData } from "react-router";
import { Divider } from "~/components/Divider";
import { SendouDialog } from "~/components/elements/Dialog";
import { FormMessage } from "~/components/FormMessage";
import { AvailabilityWindowText } from "~/features/availability/components/RegistrationAvailabilityPanel";
import type { CustomFieldRenderProps } from "~/form";
import { SendouForm, useFormValue } from "~/form/SendouForm";
import { useDateTimeFormat } from "~/hooks/intl/useDateTimeFormat";
import { nullFilledArray } from "~/utils/arrays";
import {
	databaseTimestampToDate,
	dateToDatabaseTimestamp,
} from "~/utils/dates";
import type { loader as scrimsLoader } from "../loaders/scrims.server";
import { SCRIM } from "../scrims-constants";
import { scrimRequestFormSchema } from "../scrims-schemas";
import type { ScrimPost } from "../scrims-types";
import { generateTimeOptions } from "../scrims-utils";
import { ScrimAvailabilityRows, useRosterFit } from "./ScrimAvailability";
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
	const { formatter: timeFormatter } = useDateTimeFormat({
		hour: "numeric",
		minute: "numeric",
	});

	// only the starts still on offer: the server clips the roster schedules to
	// them, and defaulting to a time already past would show the whole roster
	// as unavailable. Once every start has passed the full list stays on offer.
	const allTimeOptions = post.rangeEndsAt
		? generateTimeOptions(
				databaseTimestampToDate(post.startsAt),
				databaseTimestampToDate(post.rangeEndsAt),
			)
		: [];
	const upcomingTimeOptions = allTimeOptions.filter(
		(timestamp) =>
			dateToDatabaseTimestamp(new Date(timestamp)) >= data.availability.now,
	);
	const timeOptions = (
		upcomingTimeOptions.length > 0 ? upcomingTimeOptions : allTimeOptions
	).map((timestamp) => ({
		value: String(timestamp),
		label: timeFormatter.format(new Date(timestamp)) ?? "",
	}));

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
					at: post.rangeEndsAt && timeOptions[0] ? timeOptions[0].value : null,
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
						{post.rangeEndsAt ? (
							<FormField name="at" options={timeOptions} />
						) : null}
						<ScrimRequestAvailability post={post} />
						<FormField name="message" />
						<FormMessage type="info">{t("scrims:autoCancelInfo")}</FormMessage>
					</>
				)}
			</SendouForm>
		</SendouDialog>
	);
}

/** How the roster the request is made with fits the exact slot being asked for. */
function ScrimRequestAvailability({ post }: { post: ScrimPost }) {
	const { t } = useTranslation(["schedule"]);
	const from = useFormValue("from") as
		| { mode: "TEAM"; teamId: number }
		| { mode: "PICKUP" }
		| null;
	const at = useFormValue("at") as string | null;

	const teamId = from?.mode === "TEAM" ? from.teamId : undefined;
	const fit = useRosterFit({
		post,
		teamId,
		at: at ? dateToDatabaseTimestamp(new Date(Number(at))) : null,
	});

	if (teamId === undefined || !fit) return null;

	return (
		<div className="stack sm">
			<div className="text-sm font-semi-bold">
				{t("schedule:registration.title")}
			</div>
			<AvailabilityWindowText window={fit.fit.window} />
			<ScrimAvailabilityRows fit={fit} />
		</div>
	);
}
