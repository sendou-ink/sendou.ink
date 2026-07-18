import { useTranslation } from "react-i18next";
import { SendouDialog } from "~/components/elements/Dialog";
import { toastQueue } from "~/components/elements/Toast";
import { FormMessage } from "~/components/FormMessage";
import { SendouForm } from "~/form";
import { userReportPage } from "~/utils/urls";
import { reportUserSchema } from "../user-report-schemas";

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

	return (
		<SendouDialog
			heading={t("user:card.report.header", { name: username })}
			onClose={onClose}
		>
			<SendouForm
				schema={reportUserSchema}
				action={userReportPage(userId)}
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
						<FormMessage type="info">
							{t("user:card.report.falseReportsWarning")}
						</FormMessage>
					</>
				)}
			</SendouForm>
		</SendouDialog>
	);
}
