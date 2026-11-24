import * as React from "react";
import type { MetaFunction } from "react-router";
import {
	Outlet,
	type ShouldRevalidateFunction,
	useLoaderData,
	useOutletContext,
} from "react-router";
import { containerClassName, Main } from "~/components/Main";
import { isMatchResultsScopedRevalidation } from "~/features/chat/revalidation-scope";
import { TournamentProvider } from "~/features/tournament/tournament-context";
import { Tournament } from "~/features/tournament-bracket/core/Tournament";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { tournamentPage } from "~/utils/urls";
import { isRevalidation, metaTags } from "../../../utils/remix";
import { TournamentNav } from "../components/TournamentNav";
import { loader, type TournamentLoaderData } from "../loaders/to.$id.server";

export { loader };

export const shouldRevalidate: ShouldRevalidateFunction = (args) => {
	if (isMatchResultsScopedRevalidation(args)) return false;
	if (isRevalidation(args)) return args.defaultShouldRevalidate;
	if (args.formMethod === "POST") return args.defaultShouldRevalidate;
	if (args.currentParams.id !== args.nextParams.id) {
		return args.defaultShouldRevalidate;
	}

	return false;
};

export const meta: MetaFunction = (args) => {
	const data = args.loaderData as TournamentLoaderData | undefined;

	if (!data) return [];

	return metaTags({
		title: data.tournament.ctx.name,
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
		const data = match.loaderData as TournamentLoaderData | undefined;

		if (!data) return [];

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

export default function TournamentLayout() {
	const data = useLoaderData<typeof loader>();
	const tournament = new Tournament(data.tournament);
	const [bracketExpanded, setBracketExpanded] = React.useState(true);

	// for debugging in the browser console
	React.useEffect(() => {
		if (process.env.NODE_ENV !== "development") return;
		// @ts-expect-error for dev purposes
		window.tourney = tournament;
	}, [tournament]);

	const content = (
		<>
			<TournamentNav tournament={tournament} streamsCount={data.streamsCount} />
			<TournamentProvider tournament={tournament}>
				<Outlet
					context={
						{
							tournament,
							bracketExpanded,
							setBracketExpanded,
							friendCodes: data.friendCodes,
							preparedMaps: data.preparedMaps,
							vods: data.vods ?? [],
						} satisfies TournamentContext
					}
				/>
			</TournamentProvider>
		</>
	);

	// always in the breakout container so the nav keeps its width across routes, avoiding a layout shift
	return (
		<Main breakoutContainer>
			<div className={containerClassName("wide")}>{content}</div>
		</Main>
	);
}

type TournamentContext = {
	tournament: Tournament;
	bracketExpanded: boolean;
	setBracketExpanded: (expanded: boolean) => void;
	friendCode?: string;
	friendCodes?: TournamentLoaderData["friendCodes"];
	preparedMaps: TournamentLoaderData["preparedMaps"];
	vods: NonNullable<TournamentLoaderData["vods"]>;
};

export function useBracketExpanded() {
	const { bracketExpanded, setBracketExpanded } =
		useOutletContext<TournamentContext>();

	return { bracketExpanded, setBracketExpanded };
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
