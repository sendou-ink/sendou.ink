import { Check, CircleStop, Link } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ActionButton } from "~/components/ActionButton";
import { SendouButton } from "~/components/elements/Button";
import { MatchPageHeader } from "~/components/match-page/MatchPageHeader";
import { useCopyToClipboard } from "~/hooks/useCopyToClipboard";
import { useHasPermission } from "~/modules/permissions/hooks";
import { useLobbyView } from "../lobbies-hooks";
import { lobbyActionSchema } from "../lobbies-schemas";
import { lobbyShareLink } from "../lobbies-utils";
import { LobbySettingsPopover } from "./LobbySettingsPopover";

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
							<CopyShareLinkButton
								link={lobbyShareLink({ lobbyId: data.lobby.id, shareKey })}
							/>
						) : null}
						{isHost && isOngoing ? <HostControls /> : null}
					</div>
				) : undefined
			}
		>
			{data.lobby.name}
		</MatchPageHeader>
	);
}

function CopyShareLinkButton({ link }: { link: string }) {
	const { t } = useTranslation(["lobbies"]);
	const { copyToClipboard, copySuccess } = useCopyToClipboard();

	return (
		<SendouButton
			variant={copySuccess ? "outlined-success" : "outlined"}
			size="small"
			icon={copySuccess ? <Check /> : <Link />}
			onClick={() => copyToClipboard(link)}
			testId="lobby-copy-share-link-button"
		>
			{t("lobbies:shareLink.copy")}
		</SendouButton>
	);
}

function HostControls() {
	const { t } = useTranslation(["lobbies"]);

	return (
		<>
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
		</>
	);
}
