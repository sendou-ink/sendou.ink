import { useFetcher } from "@remix-run/react";
import { useTranslation } from "react-i18next";
import { Button } from "~/components/Button";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { SubmitButton } from "~/components/SubmitButton";
import { SENDOUQ_LOOKING_PAGE } from "~/utils/urls";

export function GroupLeaver({
	type,
}: {
	type: "LEAVE_GROUP" | "LEAVE_Q" | "GO_BACK";
}) {
	const { t } = useTranslation(["q"]);
	const fetcher = useFetcher();

	if (type === "LEAVE_GROUP") {
		return (
			<FormWithConfirm
				dialogHeading="Leave this group?"
				fields={[["_action", "LEAVE_GROUP"]]}
				deleteButtonText="Leave"
				action={SENDOUQ_LOOKING_PAGE}
			>
				<Button variant="minimal-destructive" size="tiny">
					{t("q:looking.groups.actions.leaveGroup")}
				</Button>
			</FormWithConfirm>
		);
	}

	// leave without confirm if alone
	return (
		<fetcher.Form method="POST" action={SENDOUQ_LOOKING_PAGE}>
			<SubmitButton
				_action="LEAVE_GROUP"
				variant="minimal-destructive"
				size="tiny"
				state={fetcher.state}
			>
				{type === "LEAVE_Q"
					? t("q:looking.groups.actions.leaveQ")
					: t("q:looking.groups.actions.goBack")}
			</SubmitButton>
		</fetcher.Form>
	);
}
