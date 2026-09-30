import { useTranslation } from "react-i18next";
import { useMatches } from "react-router";
import { SendouDialog } from "~/components/elements/Dialog";
import { toastQueue } from "~/components/elements/Toast";
import { FormMessage } from "~/components/FormMessage";
import { SendouForm } from "~/form";
import type { FormRenderProps } from "~/form/SendouForm";
import { useFormValue } from "~/form/SendouForm";
import { userReportPage } from "~/utils/urls";
import { INAPPROPRIATE_NICKNAME_CATEGORY } from "../user-report-constants";
import { reportUserSchema } from "../user-report-schemas";
import styles from "./ReportUserDialog.module.css";

const SENDOUQ_MATCH_ROUTE_ID = "features/sendouq-match/routes/q.match.$id";

type ReportFormFieldComponent = FormRenderProps<
	typeof reportUserSchema.entries
>["FormField"];

/** Posts to the `/user-report/:id` resource route; re-reporting the same user overwrites the previous report. */
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
				hideSubmitButtonWhen={(values) =>
					values.category === INAPPROPRIATE_NICKNAME_CATEGORY
				}
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
						<ReportFields FormField={FormField} />
					</>
				)}
			</SendouForm>
		</SendouDialog>
	);
}

/** Replaced by instructions when the selected category is one the staff can't act on. */
function ReportFields({ FormField }: { FormField: ReportFormFieldComponent }) {
	const { t } = useTranslation(["user"]);
	const category = useFormValue("category");

	if (category === INAPPROPRIATE_NICKNAME_CATEGORY) {
		return <InappropriateNicknameInstructions />;
	}

	return (
		<>
			<FormField name="description" />
			<FormField name="matchId" />
			<FormMessage type="info">
				{t("user:card.report.falseReportsWarning")}
			</FormMessage>
		</>
	);
}

function InappropriateNicknameInstructions() {
	const { t } = useTranslation(["user"]);

	return (
		<FormMessage type="info">
			{t("user:card.report.nickname.explanation")}
			<ul
				className={styles.instructions}
				data-testid="nickname-report-instructions"
			>
				<li>{t("user:card.report.nickname.inGame")}</li>
				<li>{t("user:card.report.nickname.discord")}</li>
			</ul>
		</FormMessage>
	);
}

/** SendouQ match id from the current route to prefill "Match ID"; `undefined` elsewhere. */
function useSendouQMatchIdFromRoute() {
	const matches = useMatches();

	const matchRoute = matches.find(
		(match) => match.id === SENDOUQ_MATCH_ROUTE_ID,
	);

	return matchRoute?.params.id;
}
