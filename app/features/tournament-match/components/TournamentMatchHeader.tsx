import { ArrowLeft } from "lucide-react";
import { LinkButton } from "~/components/elements/Button";
import { MatchPageHeader } from "~/components/match-page/MatchPageHeader";
import { useTournament } from "~/features/tournament/tournament-context";
import type { BracketsPageState } from "~/features/tournament-bracket/routes/to.$id.brackets";
import { tournamentBracketsPage } from "~/features/tournament-bracket/tournament-bracket-urls";
import type { TournamentMatchLoaderData } from "../loaders/to.$id.matches.$mid.server";

export function TournamentMatchHeader({
	data,
}: {
	data: TournamentMatchLoaderData;
}) {
	const tournament = useTournament();

	const { bracketName, roundName } = data.bracketContext.names;

	return (
		<MatchPageHeader
			subtitle={bracketName}
			topRight={
				<LinkButton
					to={tournamentBracketsPage({
						tournamentId: tournament.ctx.id,
						bracketIdx: data.bracketContext.bracketIdx,
						groupId:
							data.bracketContext.bracketType === "swiss"
								? data.match.groupId
								: undefined,
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
