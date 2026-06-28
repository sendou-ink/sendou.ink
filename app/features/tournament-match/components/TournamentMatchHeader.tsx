import { ArrowLeft } from "lucide-react";
import { LinkButton } from "~/components/elements/Button";
import { MatchPageHeader } from "~/components/match-page/MatchPageHeader";
import { useTournament } from "~/features/tournament/routes/to.$id";
import type { BracketsPageState } from "~/features/tournament-bracket/routes/to.$id.brackets";
import { tournamentBracketsPage } from "~/utils/urls";
import type { TournamentMatchLoaderData } from "../loaders/to.$id.matches.$mid.server";

export function TournamentMatchHeader({
	data,
}: {
	data: TournamentMatchLoaderData;
}) {
	const tournament = useTournament();

	const { bracketName, roundName } = tournament.matchContextNamesById(
		data.match.id,
	);

	return (
		<MatchPageHeader
			subtitle={bracketName}
			topRight={
				<LinkButton
					to={tournamentBracketsPage({
						tournamentId: tournament.ctx.id,
						bracketIdx: tournament.matchIdToBracketIdx(data.match.id),
						groupId: data.match.groupId,
					})}
					state={{ scrollToMatchId: data.match.id } satisfies BracketsPageState}
					variant="outlined"
					size="small"
					className="w-max"
					icon={<ArrowLeft />}
					testId="back-to-bracket-button"
				>
					Back to bracket
				</LinkButton>
			}
		>
			{roundName}
		</MatchPageHeader>
	);
}
