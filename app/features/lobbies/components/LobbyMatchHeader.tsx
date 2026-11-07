import { CircleStop, Pencil } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ActionButton } from "~/components/ActionButton";
import { LinkButton } from "~/components/elements/Button";
import { MatchPageHeader } from "~/components/match-page/MatchPageHeader";
import { useHasPermission } from "~/modules/permissions/hooks";
import { useLobbyView } from "../lobbies-hooks";
import { lobbyActionSchema } from "../lobbies-schemas";
import { editLobbyPage, lobbyShareLink } from "../lobbies-utils";
import { LobbyInviteLink } from "./LobbyInviteLink";

export function LobbyMatchHeader() {
	const { t } = useTranslation(["lobbies"]);
	const { data } = useLobbyView();
	const isHost = useHasPermission(data.lobby, "MANAGE");
	const isOngoing = data.lobby.endedAt === null;
	const shareKey = isOngoing ? data.lobby.shareKey : null;

	return (
		<MatchPageHeader
			subtitle={[
				t(`lobbies:label.${data.lobby.label}`),
				t(`lobbies:status.${data.status}`),
			].join(" · ")}
			topRight={
				shareKey || (isHost && isOngoing) ? (
					<div className="stack horizontal sm items-center">
						{shareKey ? (
							<LobbyInviteLink
								link={lobbyShareLink({ lobbyId: data.lobby.id, shareKey })}
								isHost={isHost}
							/>
						) : null}
						{isHost && isOngoing ? (
							<HostControls lobbyId={data.lobby.id} />
						) : null}
					</div>
				) : undefined
			}
		>
			{data.lobby.name}
		</MatchPageHeader>
	);
}

function HostControls({ lobbyId }: { lobbyId: number }) {
	const { t } = useTranslation(["lobbies", "common"]);

	return (
		<>
			<LinkButton
				to={editLobbyPage(lobbyId)}
				size="small"
				variant="outlined"
				icon={<Pencil />}
				testId="lobby-edit-button"
			>
				{t("common:actions.edit")}
			</LinkButton>
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
		</>
	);
}
