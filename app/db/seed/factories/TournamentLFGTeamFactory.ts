import * as TournamentLFGRepository from "~/features/tournament-lfg/TournamentLFGRepository.server";
import { defineFactory } from "../core/defineFactory";

export const { create } = defineFactory({
	insert: TournamentLFGRepository.insertPlaceholderTeam,
});
