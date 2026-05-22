import { useTranslation } from "react-i18next";
import { useLoaderData } from "react-router";
import { SendouButton } from "~/components/elements/Button";
import { SendouDialog } from "~/components/elements/Dialog";
import { MatchPageHeader } from "~/components/match-page/MatchPageHeader";
import TimePopover from "~/components/TimePopover";
import { SendouForm } from "~/form/SendouForm";
import { useHasPermission } from "~/modules/permissions/hooks";
import { databaseTimestampToDate } from "~/utils/dates";
import type { loader } from "../loaders/scrims.$id.server";
import { cancelScrimFormSchema } from "../scrims-schemas";

export function ScrimMatchHeader() {
	const { t } = useTranslation(["common", "scrims"]);
	const data = useLoaderData<typeof loader>();

	const allowedToCancel = useHasPermission(data.post, "CANCEL");
	const isCanceled = Boolean(data.post.canceled);
	const acceptedRequest = data.post.requests.find((r) => r.isAccepted);
	const scrimTime = acceptedRequest?.at ?? data.post.at;
	const canCancel =
		allowedToCancel &&
		!isCanceled &&
		databaseTimestampToDate(data.post.at) > new Date();

	return (
		<MatchPageHeader
			subtitle={t("scrims:page.scheduledScrim")}
			topRight={
				canCancel ? (
					<SendouDialog
						trigger={
							<SendouButton size="small" variant="minimal-destructive">
								{t("common:actions.cancel")}
							</SendouButton>
						}
						heading={t("scrims:cancelModal.scrim.title")}
						showCloseButton
					>
						<CancelScrimForm />
					</SendouDialog>
				) : undefined
			}
		>
			<TimePopover
				time={databaseTimestampToDate(scrimTime)}
				options={{
					weekday: "short",
					year: "numeric",
					month: "numeric",
					day: "numeric",
					hour: "numeric",
					minute: "numeric",
				}}
				className="text-left"
			/>
		</MatchPageHeader>
	);
}

function CancelScrimForm() {
	return (
		<SendouForm
			schema={cancelScrimFormSchema}
			submitButtonTestId="cancel-scrim-submit"
		>
			{({ FormField }) => <FormField name="reason" />}
		</SendouForm>
	);
}
