import type { MetaFunction } from "react-router";
import { Main } from "~/components/Main";
import { MatchPage } from "~/components/match-page/MatchPage";
import { useTopicRevalidation } from "~/features/chat/chat-hooks";
import { useVoiceFollow } from "~/features/voice/voice-hooks";
import { metaTags } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { lobbiesPage, navIconUrl } from "~/utils/urls";
import { action } from "../actions/lobbies.$id.server";
import { LobbyMatchBanner } from "../components/LobbyMatchBanner";
import { LobbyMatchHeader } from "../components/LobbyMatchHeader";
import { LobbyMatchTabs } from "../components/LobbyMatchTabs";
import { LobbyParticipants } from "../components/LobbyParticipants";
import { LobbyViewerPanel } from "../components/LobbyViewerPanel";
import { loader } from "../loaders/lobbies.$id.server";
import { useLobbyView } from "../lobbies-hooks";
import { lobbyChannel } from "../lobbies-utils";

export { action, loader };

export const meta: MetaFunction<typeof loader> = (args) => {
	return metaTags({
		title: args.loaderData?.lobby.name ?? "Lobby",
		location: args.location,
	});
};

export const handle: SendouRouteHandle = {
	i18n: ["lobbies", "q", "scrims", "user"],
	breadcrumb: () => ({
		imgPath: navIconUrl("lobbies"),
		href: lobbiesPage(),
		type: "IMAGE",
	}),
};

export default function LobbyPage() {
	const { data, hasStarted } = useLobbyView();

	useTopicRevalidation(
		lobbyChannel(data.lobby.id),
		data.lobby.endedAt === null,
	);
	useVoiceFollow({
		roomIds: [
			data.lobby.chatRoomId,
			data.lobby.alphaChatRoomId,
			data.lobby.bravoChatRoomId,
		].filter((id) => id !== null),
		targetRoomId: data.voiceRoomId,
	});

	return (
		<Main>
			<MatchPage>
				<LobbyMatchHeader />
				<LobbyViewerPanel />
				{hasStarted ? <LobbyMatchBanner /> : null}
				<LobbyMatchTabs />
				{!hasStarted ? <LobbyParticipants /> : null}
			</MatchPage>
		</Main>
	);
}
