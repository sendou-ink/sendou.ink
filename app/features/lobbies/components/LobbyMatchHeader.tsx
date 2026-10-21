import { CircleStop } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ActionButton } from "~/components/ActionButton";
import { MatchPageHeader } from "~/components/match-page/MatchPageHeader";
import { useHasPermission } from "~/modules/permissions/hooks";
import { useLobbyView } from "../lobbies-hooks";
import { lobbyActionSchema } from "../lobbies-schemas";
import { LobbySettingsPopover } from "./LobbySettingsPopover";

export function LobbyMatchHeader() {
	const { t } = useTranslation(["lobbies"]);
	const { data } = useLobbyView();
	const isHost = useHasPermission(data.lobby, "MANAGE");

	return (
		<MatchPageHeader
			subtitle={[
				t(`lobbies:label.${data.lobby.label}`),
				t(`lobbies:status.${data.status}`),
			].join(" · ")}
			topRight={
				isHost && data.lobby.endedAt === null ? (
					<div className="stack horizontal sm items-center">
						<LobbySettingsPopover />
						<ActionButton
							schema={lobbyActionSchema}
							action="END_LOBBY"
							variant="outlined-destructive"
							size="small"
							icon={<CircleStop />}
							testId="lobby-end-button"
							confirm={{
								dialogHeading: t("lobbies:admin.end.heading"),
								submitButtonText: t("lobbies:admin.end"),
								submitButtonVariant: "destructive",
							}}
						>
							{t("lobbies:admin.end")}
						</ActionButton>
					</div>
				) : undefined
			}
		>
			{data.lobby.name}
		</MatchPageHeader>
	);
}
