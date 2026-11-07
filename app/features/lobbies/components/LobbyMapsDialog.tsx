import { Map as MapIcon } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { SendouButton } from "~/components/elements/Button";
import { SendouDialog } from "~/components/elements/Dialog";
import { SendouForm } from "~/form/SendouForm";
import { useLobbyView } from "../lobbies-hooks";
import { lobbyMapsSchema } from "../lobbies-schemas";
import { mapsFormValues } from "../lobbies-utils";
import { LobbyMapsFormFields } from "./LobbyMapsFormFields";

/** The host's pick of where the sets' maps come from: the players' preferences in some modes or a map pool. */
export function LobbyMapsDialog() {
	const { t } = useTranslation(["lobbies", "common"]);
	const { data } = useLobbyView();
	const [isOpen, setIsOpen] = React.useState(false);

	const close = () => setIsOpen(false);

	return (
		<>
			<SendouButton
				size="small"
				variant="outlined"
				icon={<MapIcon />}
				onClick={() => setIsOpen(true)}
				testId="lobby-maps-button"
			>
				{t("lobbies:settings.maps")}
			</SendouButton>
			{isOpen ? (
				<SendouDialog heading={t("lobbies:settings.maps")} onClose={close}>
					<div className="stack md">
						<p className="text-lighter text-xs">
							{t("lobbies:settings.appliesFromNextSet")}
						</p>
						<SendouForm
							schema={lobbyMapsSchema}
							submitButtonText={t("common:actions.save")}
							submitButtonTestId="lobby-maps-save-button"
							onSuccess={close}
							defaultValues={mapsFormValues(data.lobby)}
						>
							{() => <LobbyMapsFormFields />}
						</SendouForm>
					</div>
				</SendouDialog>
			) : null}
		</>
	);
}
