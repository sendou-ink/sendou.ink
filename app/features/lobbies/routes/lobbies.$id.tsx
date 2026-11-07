import { Lock } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
	isRouteErrorResponse,
	type MetaFunction,
	useRouteError,
} from "react-router";
import { Catcher } from "~/components/Catcher";
import { LinkButton } from "~/components/elements/Button";
import { Main } from "~/components/Main";
import { MatchPage } from "~/components/match-page/MatchPage";
import { useTopicRevalidation } from "~/features/chat/chat-hooks";
import { useVoiceFollow } from "~/features/voice/voice-hooks";
import { databaseTimestampToDate } from "~/utils/dates";
import { metaTags, ogPageImage } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { lobbiesPage, navIconUrl } from "~/utils/urls";
import { action } from "../actions/lobbies.$id.server";
import { LobbyApplications } from "../components/LobbyApplications";
import { LobbyDetails } from "../components/LobbyDetails";
import { LobbyMatchBanner } from "../components/LobbyMatchBanner";
import { LobbyMatchHeader } from "../components/LobbyMatchHeader";
import { LobbyMatchTabs } from "../components/LobbyMatchTabs";
import { LobbyParticipants } from "../components/LobbyParticipants";
import { LobbyStartBanner } from "../components/LobbyStartBanner";
import { LobbyViewerPanel } from "../components/LobbyViewerPanel";
import { type LobbyLoaderData, loader } from "../loaders/lobbies.$id.server";
import { LOBBY_LINK_ONLY_ERROR } from "../lobbies-constants";
import { useLobbyView, useRevalidateOnStatusChange } from "../lobbies-hooks";
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
	useVoiceFollow(data.teamChatRoomId);
	useRevalidateOnStatusChange();

	return (
		<Main>
			<MatchPage>
				<LobbyMatchHeader />
				<LobbyViewerPanel />
				<LobbyApplications />
				{hasStarted || isEnded ? <LobbyMatchBanner /> : <LobbyStartBanner />}
				<LobbyMatchTabs />
				<LobbyDetails />
				{!hasStarted ? <LobbyParticipants /> : null}
			</MatchPage>
		</Main>
	);
}

export function ErrorBoundary() {
	const error = useRouteError();

	if (isRouteErrorResponse(error) && error.data === LOBBY_LINK_ONLY_ERROR) {
		return <LinkOnlyLobby />;
	}

	return <Catcher />;
}

function LinkOnlyLobby() {
	const { t } = useTranslation(["lobbies"]);

	return (
		<Main className="stack md items-center text-center">
			<Lock size={32} className="text-lighter" />
			<h2>{t("lobbies:linkOnly.heading")}</h2>
			<p className="text-lighter">{t("lobbies:linkOnly.explanation")}</p>
			<LinkButton to={lobbiesPage()} variant="outlined" size="small">
				{t("lobbies:linkOnly.browse")}
			</LinkButton>
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
