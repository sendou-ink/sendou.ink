import { useTranslation } from "react-i18next";
import { useMatches } from "react-router";
import { SendouDialog } from "~/components/elements/Dialog";
import { toastQueue } from "~/components/elements/Toast";
import { FormMessage } from "~/components/FormMessage";
import { SendouForm } from "~/form";
import { userReportPage } from "~/utils/urls";
import { reportUserSchema } from "../user-report-schemas";

const SENDOUQ_MATCH_ROUTE_ID = "features/sendouq-match/routes/q.match.$id";

/**
 * Modal for reporting a user to the staff, posting to the `/user-report/:id` resource
 * route. Re-reporting the same user overwrites the previous report. Rendered wherever
 * a `UserCard` lives.
 */
export function ReportUserDialog({
	userId,
	username,
	onClose,
}: {
	userId: number;
	username: string;
	onClose: () => void;
}) {
	const { t } = useTranslation(["user"]);
	const prefilledMatchId = useSendouQMatchIdFromRoute();

	return (
		<SendouDialog
			heading={t("user:card.report.header", { name: username })}
			onClose={onClose}
		>
			<SendouForm
				schema={reportUserSchema}
				action={userReportPage(userId)}
				defaultValues={{ matchId: prefilledMatchId }}
				onSuccess={() => {
					toastQueue.add(
						{ message: "Report sent to the staff", variant: "success" },
						{ timeout: 5000 },
					);
					onClose();
				}}
			>
				{({ FormField }) => (
					<>
						<FormField name="category" />
						<FormField name="description" />
						<FormField name="matchId" />
						<FormMessage type="info">
							{t("user:card.report.falseReportsWarning")}
						</FormMessage>
					</>
				)}
			</SendouForm>
		</SendouDialog>
	);
}

/**
 * Reads the SendouQ match id from the current route so a report opened from a match page
 * prefills its "Match ID" field. Returns `undefined` on any other page.
 */
function useSendouQMatchIdFromRoute() {
	const matches = useMatches();

	const matchRoute = matches.find(
		(match) => match.id === SENDOUQ_MATCH_ROUTE_ID,
	);

	return matchRoute?.params.id;
}
