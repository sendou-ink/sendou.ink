import { Eye, RefreshCw } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { ActionButton } from "~/components/ActionButton";
import { SendouButton } from "~/components/elements/Button";
import { SendouDialog } from "~/components/elements/Dialog";
import {
	BaseVisibilityFormField,
	NotFoundVisibilityFormField,
} from "~/features/associations/components/VisibilityFormFields";
import type { CustomFieldRenderProps } from "~/form";
import { SendouForm } from "~/form/SendouForm";
import { databaseTimestampToDate } from "~/utils/dates";
import { useLobbyView } from "../lobbies-hooks";
import { lobbyActionSchema, lobbyVisibilitySchema } from "../lobbies-schemas";

/** The host's pick of who sees the lobby and the reset of its invite link, which shows it to anyone. */
export function LobbyVisibilityDialog() {
	const { t } = useTranslation(["lobbies", "scrims", "common"]);
	const { data } = useLobbyView();
	const [isOpen, setIsOpen] = React.useState(false);

	const visibility = data.visibility;
	if (!visibility) return null;

	const close = () => setIsOpen(false);
	const { at, forAssociation } = visibility.current.notFoundVisibility;

	return (
		<>
			<SendouButton
				size="small"
				variant="outlined"
				icon={<Eye />}
				onClick={() => setIsOpen(true)}
				testId="lobby-visibility-button"
			>
				{t("scrims:forms.visibility.title")}
			</SendouButton>
			{isOpen ? (
				<SendouDialog heading={t("lobbies:visibility.heading")} onClose={close}>
					<div className="stack lg">
						<SendouForm
							schema={lobbyVisibilitySchema}
							submitButtonText={t("common:actions.save")}
							submitButtonTestId="lobby-visibility-save-button"
							onSuccess={close}
							defaultValues={{
								baseVisibility: visibility.current.baseVisibility,
								notFoundVisibility: {
									at: at === null ? null : databaseTimestampToDate(at),
									forAssociation,
								},
							}}
						>
							{({ FormField }) => (
								<>
									<FormField name="baseVisibility">
										{(props: CustomFieldRenderProps) => (
											<BaseVisibilityFormField
												associations={visibility.associations}
												isLinkOnlyAvailable
												{...props}
											/>
										)}
									</FormField>
									<NotFoundVisibilityFormField
										associations={visibility.associations}
									/>
								</>
							)}
						</SendouForm>
						<div className="stack sm items-start">
							<p className="text-lighter text-sm">
								{t("lobbies:shareLink.explanation")}
							</p>
							<ActionButton
								schema={lobbyActionSchema}
								action="RESET_SHARE_KEY"
								variant="outlined"
								size="small"
								icon={<RefreshCw />}
								testId="lobby-reset-share-link-button"
							>
								{t("lobbies:shareLink.reset")}
							</ActionButton>
						</div>
					</div>
				</SendouDialog>
			) : null}
		</>
	);
}
