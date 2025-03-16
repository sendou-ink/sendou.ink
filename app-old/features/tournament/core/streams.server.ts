import type { TournamentData } from "~/features/tournament-bracket/core/Tournament.server";
import { getStreams } from "~/modules/twitch";

export async function streamsByTournamentId(tournament: TournamentData["ctx"]) {
	// prevent error logs in development
	if (process.env.NODE_ENV === "development" && !process.env.TWITCH_CLIENT_ID) {
		return [];
	}
	const twitchUsersOfTournament = tournament.teams
		.filter((team) => team.checkIns.length > 0)
		.flatMap((team) => team.members)
		.filter((member) => member.twitch);

	const streams = await getStreams();

	const tournamentStreams = streams.flatMap((stream) => {
		const member = twitchUsersOfTournament.find(
			(member) => member.twitch === stream.twitchUserName,
		);

		if (member) {
			return {
				...stream,
				userId: member.userId,
			};
		}

		if (tournament.castTwitchAccounts?.includes(stream.twitchUserName)) {
			return {
				...stream,
				userId: null,
			};
		}

		return [];
	});

	return tournamentStreams;
}
