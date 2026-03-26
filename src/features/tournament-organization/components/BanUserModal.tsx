import { useTranslation } from "react-i18next";
import { SendouButton } from "~/components/elements/Button";
import { SendouDialog } from "~/components/elements/Dialog";
import { SendouForm } from "~/form/SendouForm";
import { banUserActionSchema } from "../tournament-organization-schemas";

export function BanUserModal() {
	const { t } = useTranslation(["org"]);

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
			<SendouForm schema={banUserActionSchema}>
				{({ FormField }) => (
					<>
						<FormField name="userId" />
						<FormField name="privateNote" />
						<FormField name="expiresAt" />
					</>
				)}
			</SendouForm>
		</SendouDialog>
	);
}
