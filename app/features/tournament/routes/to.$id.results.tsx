import { Link } from "@remix-run/react";
import clsx from "clsx";
import { Avatar } from "~/components/Avatar";
import { Flag } from "~/components/Flag";
import { InfoPopover } from "~/components/InfoPopover";
import { Placement } from "~/components/Placement";
import { Table } from "~/components/Table";
import {
	SPR_INFO_URL,
	tournamentMatchPage,
	tournamentTeamPage,
} from "~/utils/urls";
import * as Standings from "../core/Standings";
import { useTournament } from "./to.$id";

export default function TournamentResultsPage() {
	const tournament = useTournament();

	const standings = tournament.standings;

	if (standings.length === 0) {
		return (
			<div className="text-center text-lg font-semi-bold text-lighter">
				No team finished yet, check back later
			</div>
		);
	}

	let lastRenderedPlacement = 0;
	let rowDarkerBg = false;
	return (
		<div>
			<Table>
				<thead>
					<tr>
						<th>Standing</th>
						<th>Team</th>
						<th>Roster</th>
						<th>Seed</th>
						{tournament.ctx.isFinalized ? (
							<th
								className="stack horizontal sm items-center"
								data-testid="spr-header"
							>
								SPR{" "}
								<InfoPopover tiny>
									<a
										href={SPR_INFO_URL}
										target="_blank"
										rel="noopener noreferrer"
									>
										Seed Performance Rating
									</a>
								</InfoPopover>
							</th>
						) : null}
						<th>Matches</th>
					</tr>
				</thead>
				<tbody>
					{standings.map((standing, i) => {
						const placement =
							lastRenderedPlacement === standing.placement
								? null
								: standing.placement;
						lastRenderedPlacement = standing.placement;

						if (standing.placement !== standings[i - 1]?.placement) {
							rowDarkerBg = !rowDarkerBg;
						}

						const teamLogoSrc = tournament.tournamentTeamLogoSrc(standing.team);

						const spr = Standings.calculateSPR({
							standings,
							teamId: standing.team.id,
						});

						return (
							<tr
								key={standing.team.id}
								className={rowDarkerBg ? "bg-darker-transparent" : undefined}
							>
								<td className="text-md">
									{typeof placement === "number" ? (
										<Placement placement={placement} size={36} />
									) : null}{" "}
								</td>
								<td>
									<Link
										to={tournamentTeamPage({
											tournamentId: tournament.ctx.id,
											tournamentTeamId: standing.team.id,
										})}
										className="tournament__standings__team-name"
										data-testid="result-team-name"
									>
										{teamLogoSrc ? (
											<Avatar size="xs" url={teamLogoSrc} />
										) : null}{" "}
										{standing.team.name}
									</Link>
								</td>
								<td>
									{standing.team.members.map((player) => (
										<div
											key={player.userId}
											className="stack xxs horizontal items-center"
										>
											{player.country ? (
												<Flag countryCode={player.country} tiny />
											) : null}
											{player.username}
										</div>
									))}
								</td>
								<td className="text-sm">{standing.team.seed}</td>
								{tournament.ctx.isFinalized ? (
									<td className="text-sm">
										{spr > 0 ? "+" : ""}
										{spr}
									</td>
								) : null}
								<td>
									<MatchHistoryRow teamId={standing.team.id} />
								</td>
							</tr>
						);
					})}
				</tbody>
			</Table>
		</div>
	);
}

function MatchHistoryRow({ teamId }: { teamId: number }) {
	const tournament = useTournament();

	const teamMatches = Standings.matchesPlayed({
		tournament,
		teamId,
	});

	return (
		<div className="stack horizontal xs">
			{teamMatches.map((match) => {
				return (
					<MatchResultSquare
						key={match.id}
						result={match.result}
						matchId={match.id}
					>
						{match.vsSeed}
					</MatchResultSquare>
				);
			})}
		</div>
	);
}

function MatchResultSquare({
	result,
	matchId,
	children,
}: { result: "win" | "loss"; matchId: number; children: React.ReactNode }) {
	const tournament = useTournament();

	return (
		<Link
			to={tournamentMatchPage({
				matchId,
				tournamentId: tournament.ctx.id,
			})}
			className={clsx("tournament__standings__match-result-square", {
				"tournament__standings__match-result-square--win": result === "win",
				"tournament__standings__match-result-square--loss": result === "loss",
			})}
		>
			{children}
		</Link>
	);
}
