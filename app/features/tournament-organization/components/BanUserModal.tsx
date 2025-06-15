import { useTranslation } from "react-i18next";
import type { z } from "zod/v4";
import { SendouButton } from "~/components/elements/Button";
import { SendouDialog } from "~/components/elements/Dialog";
import { SendouForm } from "~/components/form/SendouForm";
import { TextAreaFormField } from "~/components/form/TextAreaFormField";
import { UserSearchFormField } from "~/components/form/UserSearchFormField";
import { TOURNAMENT_ORGANIZATION } from "../tournament-organization-constants";
import { banUserActionSchema } from "../tournament-organization-schemas";

type FormFields = z.infer<typeof banUserActionSchema>;

export function BanUserModal() {
	const { t } = useTranslation(["org", "common"]);

	return (
		<SendouDialog
			heading={t("org:banned.banModal.title")}
			trigger={
				<SendouButton variant="outlined" size="small">
					{t("org:banned.ban")}
				</SendouButton>
			}
			showCloseButton
		>
			<SendouForm
				schema={banUserActionSchema}
				defaultValues={{
					_action: "BAN_USER",
					userId: undefined,
					privateReason: null,
				}}
			>
				<UserSearchFormField<FormFields>
					label={t("org:banned.banModal.player")}
					name="userId"
				/>

				<TextAreaFormField<FormFields>
					label={t("org:banned.banModal.note")}
					name="privateReason"
					maxLength={TOURNAMENT_ORGANIZATION.BAN_REASON_MAX_LENGTH}
					bottomText={t("org:banned.banModal.noteHelp")}
				/>
			</SendouForm>
		</SendouDialog>
	);
}
