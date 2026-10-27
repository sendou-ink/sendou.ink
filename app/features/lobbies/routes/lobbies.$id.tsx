import type { MetaFunction } from "react-router";
import { Main } from "~/components/Main";
import { MatchPage } from "~/components/match-page/MatchPage";
import { useTopicRevalidation } from "~/features/chat/chat-hooks";
import { useVoiceFollow } from "~/features/voice/voice-hooks";
import { databaseTimestampToDate } from "~/utils/dates";
import { metaTags, ogPageImage } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { lobbiesPage, navIconUrl } from "~/utils/urls";
import { action } from "../actions/lobbies.$id.server";
import { LobbyDetails } from "../components/LobbyDetails";
import { LobbyMatchBanner } from "../components/LobbyMatchBanner";
import { LobbyMatchHeader } from "../components/LobbyMatchHeader";
import { LobbyMatchTabs } from "../components/LobbyMatchTabs";
import { LobbyParticipants } from "../components/LobbyParticipants";
import { LobbyStartBanner } from "../components/LobbyStartBanner";
import { LobbyViewerPanel } from "../components/LobbyViewerPanel";
import { type LobbyLoaderData, loader } from "../loaders/lobbies.$id.server";
import { useLobbyView } from "../lobbies-hooks";
import { lobbyChannel } from "../lobbies-utils";

export { action, loader };

export const meta: MetaFunction<typeof loader> = (args) => {
	const lobby = args.loaderData?.lobby;

	return metaTags({
		title: lobby?.name ?? "Lobby",
		description: lobby ? metaDescription(lobby) : undefined,
		image: ogPageImage("lobbies"),
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
	const isEnded = data.lobby.endedAt !== null;

	useTopicRevalidation(lobbyChannel(data.lobby.id), !isEnded);
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
				{hasStarted || isEnded ? <LobbyMatchBanner /> : <LobbyStartBanner />}
				<LobbyMatchTabs />
				<LobbyDetails />
				{!hasStarted ? <LobbyParticipants /> : null}
			</MatchPage>
		</Main>
	);
}

function metaDescription(lobby: LobbyLoaderData["lobby"]) {
	// link previews (e.g. Discord) are rendered without the reader's time zone
	const startsAt = new Intl.DateTimeFormat("en-US", {
		timeZone: "UTC",
		weekday: "short",
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "numeric",
		timeZoneName: "short",
	}).format(databaseTimestampToDate(lobby.startsAt));
	const summary = [
		`Hosted by ${lobby.hostUsername}`,
		`Bo${lobby.bestOf} ${lobby.modes.join("/")}`,
		lobby.endedAt === null ? `Starts ${startsAt}` : "Ended",
	].join(" · ");

	return lobby.description ? `${summary}. ${lobby.description}` : summary;
}
