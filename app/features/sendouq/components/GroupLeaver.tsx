import { useTranslation } from "react-i18next";
import { ActionButton } from "~/components/ActionButton";
import { SENDOUQ_LOOKING_PAGE } from "~/utils/urls";
import { lookingSchema } from "../q-action-schemas";

export function GroupLeaver({
	type,
}: {
	type: "LEAVE_GROUP" | "LEAVE_Q" | "GO_BACK";
}) {
	const { t } = useTranslation(["q", "common"]);

	return (
		<ActionButton
			schema={lookingSchema}
			action="LEAVE_GROUP"
			formAction={SENDOUQ_LOOKING_PAGE}
			variant="minimal-destructive"
			size="small"
			confirm={
				// leave without confirm if alone
				type === "LEAVE_GROUP"
					? {
							dialogHeading: t("q:looking.groups.actions.leaveGroup.confirm"),
							submitButtonText: t("common:actions.leave"),
						}
					: undefined
			}
		>
			{type === "LEAVE_GROUP"
				? t("q:looking.groups.actions.leaveGroup")
				: type === "LEAVE_Q"
					? t("q:looking.groups.actions.leaveQ")
					: t("q:looking.groups.actions.goBack")}
		</ActionButton>
	);
}
