import { Pencil } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SendouButton } from "~/components/elements/Button";
import { SendouPopover } from "~/components/elements/Popover";
import { SendouForm } from "~/form/SendouForm";
import { useLobbyView } from "../lobbies-hooks";
import { lobbySettingsSchema } from "../lobbies-schemas";
import styles from "./LobbySettingsPopover.module.css";

/** The host's best of and modes, saved as they're changed. */
export function LobbySettingsPopover() {
	const { t } = useTranslation(["lobbies", "common"]);
	const { data } = useLobbyView();

	return (
		<SendouPopover
			placement="bottom end"
			popoverClassName={styles.popover}
			trigger={
				<SendouButton
					size="small"
					variant="outlined"
					icon={<Pencil />}
					testId="lobby-settings-button"
				>
					{t("common:actions.edit")}
				</SendouButton>
			}
		>
			<div className="stack md">
				<p className="text-lighter text-xs">
					{t("lobbies:settings.appliesFromNextSet")}
				</p>
				<SendouForm
					schema={lobbySettingsSchema}
					mode="autoSubmit"
					defaultValues={{
						bestOf: `${data.lobby.bestOf}`,
						modes: data.lobby.modes,
					}}
				>
					{({ FormField }) => (
						<>
							<FormField name="bestOf" />
							<FormField name="modes" />
						</>
					)}
				</SendouForm>
			</div>
		</SendouPopover>
	);
}
