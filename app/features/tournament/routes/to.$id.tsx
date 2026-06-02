import * as React from "react";
import type { MetaFunction } from "react-router";
import {
	Outlet,
	type ShouldRevalidateFunction,
	useLoaderData,
	useOutletContext,
} from "react-router";
import { Main } from "~/components/Main";
import { Placeholder } from "~/components/Placeholder";
import { useChatContext } from "~/features/chat/useChatContext";
import { Tournament } from "~/features/tournament-bracket/core/Tournament";
import { useHydrated } from "~/hooks/useHydrated";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { removeMarkdown } from "~/utils/strings";
import { tournamentPage } from "~/utils/urls";
import { isRevalidation, metaTags } from "../../../utils/remix";
import { TournamentNav } from "../components/TournamentNav";

import { loader, type TournamentLoaderData } from "../loaders/to.$id.server";

export { loader };

export const shouldRevalidate: ShouldRevalidateFunction = (args) => {
	if (isRevalidation(args)) return args.defaultShouldRevalidate;
	if (args.formMethod === "POST") return args.defaultShouldRevalidate;
	if (args.currentParams.id !== args.nextParams.id) {
		return args.defaultShouldRevalidate;
	}

	return false;
};

export const meta: MetaFunction = (args) => {
	const rawData = args.data as string | undefined;

	if (!rawData) return [];

	const data = JSON.parse(rawData) as TournamentLoaderData;

	return metaTags({
		title: data.tournament.ctx.name,
		description: data.tournament.ctx.description
			? removeMarkdown(data.tournament.ctx.description)
			: undefined,
		image: {
			url: data.tournament.ctx.logoUrl,
			dimensions: { width: 124, height: 124 },
		},
		location: args.location,
		url: tournamentPage(data.tournament.ctx.id),
	});
};

export const handle: SendouRouteHandle = {
	i18n: ["tournament", "calendar"],
	breadcrumb: ({ match }) => {
		const rawData = match.data as string | undefined;

		if (!rawData) return [];

		const data = JSON.parse(rawData) as TournamentLoaderData;

		return [
			{
				imgPath: data.tournament.ctx.logoUrl,
				href: tournamentPage(data.tournament.ctx.id),
				type: "IMAGE" as const,
				text: data.tournament.ctx.name,
			},
		];
	},
};

const TournamentContext = React.createContext<Tournament>(null!);

export default function TournamentLayoutShell() {
	const isHydrated = useHydrated();

	// tournaments are something that people like to refresh a lot
	// which can cause spikes that are hard for the server to handle
	// this is just making sure the SSR for this page is as fast as possible in prod
	if (!isHydrated)
		return (
			<Main bigger>
				<Placeholder />
			</Main>
		);

	return <TournamentLayout />;
}

export function TournamentLayout() {
	const rawData = useLoaderData<typeof loader>();
	const data = React.useMemo(
		() => JSON.parse(rawData) as TournamentLoaderData,
		[rawData],
	);
	const tournament = React.useMemo(
		() => new Tournament(data.tournament),
		[data],
	);
	const [bracketExpanded, setBracketExpanded] = React.useState(true);

	useTournamentChatLabels(tournament);

	// this is nice to debug with tournament in browser console
	if (process.env.NODE_ENV === "development") {
		// biome-ignore lint/correctness/useHookAtTopLevel: process.env.NODE_ENV is a constant
		React.useEffect(() => {
			// @ts-expect-error for dev purposes
			window.tourney = tournament;
		}, [tournament]);
	}
	return (
		<Main bigger>
			<TournamentNav
				tournament={tournament}
				hasChildTournaments={data.hasChildTournaments}
			/>
			<TournamentContext.Provider value={tournament}>
				<Outlet
					context={
						{
							tournament,
							bracketExpanded,
							setBracketExpanded,
							hasChildTournaments: data.hasChildTournaments,
							friendCodes: data.friendCodes,
							preparedMaps: data.preparedMaps,
							vods: data.vods ?? [],
						} satisfies TournamentContext
					}
				/>
			</TournamentContext.Provider>
		</Main>
	);
}

type TournamentContext = {
	tournament: Tournament;
	bracketExpanded: boolean;
	setBracketExpanded: (expanded: boolean) => void;
	hasChildTournaments: boolean;
	friendCode?: string;
	friendCodes?: TournamentLoaderData["friendCodes"];
	preparedMaps: TournamentLoaderData["preparedMaps"];
	vods: NonNullable<TournamentLoaderData["vods"]>;
};

export function useTournament() {
	return useOutletContext<TournamentContext>().tournament;
}

export function useBracketExpanded() {
	const { bracketExpanded, setBracketExpanded } =
		useOutletContext<TournamentContext>();

	return { bracketExpanded, setBracketExpanded };
}

export function useHasChildTournaments() {
	return useOutletContext<TournamentContext>().hasChildTournaments;
}

export function useTournamentFriendCodes() {
	return useOutletContext<TournamentContext>().friendCodes;
}

export function useTournamentPreparedMaps() {
	return useOutletContext<TournamentContext>().preparedMaps;
}

export function useTournamentVods() {
	return useOutletContext<TournamentContext>().vods;
}

function useTournamentChatLabels(tournament: Tournament) {
	const chatContext = useChatContext();
	const setChatLabels = chatContext?.setChatLabels;
	const clearChatLabels = chatContext?.clearChatLabels;

	React.useEffect(() => {
		if (!setChatLabels || !clearChatLabels) return;

		const labels: Record<number, string> = {};

		labels[tournament.ctx.author.id] = "TO";

		for (const staff of tournament.ctx.staff) {
			if (staff.role === "ORGANIZER") {
				labels[staff.id] = "TO";
			} else if (staff.role === "STREAMER") {
				labels[staff.id] = "Stream";
			}
		}

		if (tournament.ctx.organization) {
			for (const member of tournament.ctx.organization.members) {
				if (["ADMIN", "ORGANIZER"].includes(member.role)) {
					labels[member.userId] = "TO";
				} else if (member.role === "STREAMER") {
					labels[member.userId] = "Stream";
				}
			}
		}

		setChatLabels(labels);

		return () => {
			clearChatLabels();
		};
	}, [setChatLabels, clearChatLabels, tournament]);
}
