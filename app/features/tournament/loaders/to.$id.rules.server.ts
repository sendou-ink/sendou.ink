import type { LoaderFunctionArgs } from "react-router";
import { tournamentFromParams } from "~/features/tournament-bracket/core/Tournament.server";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import * as MarkdownHtml from "~/utils/markdown-html.server";

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { tournamentId } = await tournamentFromParams(params, { for: "view" });

	const rules = await TournamentRepository.findRulesById(tournamentId);

	return {
		rulesHtml: rules ? MarkdownHtml.render(rules) : null,
	};
};
