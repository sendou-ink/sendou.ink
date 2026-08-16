import * as TournamentLFGRepository from "~/features/tournament-lfg/TournamentLFGRepository.server";
import { defineFactory } from "../core/defineFactory";

type Options = {
	/** Teams this team has liked in the LFG matchmaking view. */
	likedTeamIds?: number[];
};

export const { create } = defineFactory({
	insert: TournamentLFGRepository.insertPlaceholderTeam,
	applyOptions: async (team, { likedTeamIds }: Options) => {
		for (const targetTeamId of likedTeamIds ?? []) {
			await TournamentLFGRepository.insertLike({
				likerTeamId: team.id,
				targetTeamId,
			});
		}
	},
});
