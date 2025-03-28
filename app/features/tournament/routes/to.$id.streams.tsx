import { useLoaderData } from "@remix-run/react";
import { useTranslation } from "react-i18next";
import { Redirect } from "~/components/Redirect";
import { tournamentRegisterPage } from "~/utils/urls";
import { TournamentStream } from "../components/TournamentStream";
import { useTournament } from "./to.$id";

import { loader } from "../loaders/to.$id.streams.server";
export { loader };

export default function TournamentStreamsPage() {
	const { t } = useTranslation(["tournament"]);
	const tournament = useTournament();
	const data = useLoaderData<typeof loader>();

	if (!tournament.hasStarted || tournament.everyBracketOver) {
		return <Redirect to={tournamentRegisterPage(tournament.ctx.id)} />;
	}

	if (data.streams.length === 0) {
		return (
			<div className="text-center text-lg font-semi-bold text-lighter">
				{t("tournament:streams.none")}
			</div>
		);
	}

	// TODO: link to user page, later tournament team page?
	return (
		<div className="stack horizontal lg flex-wrap justify-center">
			{data.streams.map((stream) => (
				<TournamentStream key={stream.twitchUserName} stream={stream} />
			))}
		</div>
	);
}
