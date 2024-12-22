import { Link, useLoaderData } from "@remix-run/react";
import clsx from "clsx";
import { Avatar } from "~/components/Avatar";
import { useTournament } from "~/features/tournament/routes/to.$id";
import { tournamentTeamPage, userPage } from "~/utils/urls";
import type { TournamentMatchLoaderData } from "../routes/to.$id.matches.$mid";

const INACTIVE_PLAYER_CSS =
	"tournament__team-with-roster__member__inactive text-lighter-important";
export function MatchRosters({
	teams,
}: {
	teams: [id: number | null | undefined, id: number | null | undefined];
}) {
	const data = useLoaderData<TournamentMatchLoaderData>();
	const tournament = useTournament();

	const teamOne = teams[0] ? tournament.teamById(teams[0]) : undefined;
	const teamTwo = teams[1] ? tournament.teamById(teams[1]) : undefined;
	const teamOnePlayers = data.match.players.filter(
		(p) => p.tournamentTeamId === teamOne?.id,
	);
	const teamTwoPlayers = data.match.players.filter(
		(p) => p.tournamentTeamId === teamTwo?.id,
	);

	const teamOneParticipatedPlayers = teamOnePlayers.filter((p) =>
		tournament.ctx.participatedUsers.includes(p.id),
	);
	const teamTwoParticipatedPlayers = teamTwoPlayers.filter((p) =>
		tournament.ctx.participatedUsers.includes(p.id),
	);

	const teamOneLogoSrc = teamOne
		? tournament.tournamentTeamLogoSrc(teamOne)
		: null;
	const teamTwoLogoSrc = teamTwo
		? tournament.tournamentTeamLogoSrc(teamTwo)
		: null;

	return (
		<div className="tournament-bracket__rosters">
			<div className="stack xxs">
				<div className="stack xs horizontal items-center text-lighter">
					<div className="tournament-bracket__team-one-dot" />
					Team 1
				</div>
				<h2
					className={clsx("text-sm", {
						"text-lighter": !teamOne,
						"tournament-bracket__rosters__spaced-header":
							teamOneLogoSrc || teamTwoLogoSrc,
					})}
				>
					{teamOne ? (
						<Link
							to={tournamentTeamPage({
								tournamentId: tournament.ctx.id,
								tournamentTeamId: teamOne.id,
							})}
							className="text-main-forced font-bold stack horizontal xs items-center"
						>
							{teamOneLogoSrc ? (
								<Avatar url={teamOneLogoSrc} size="sm" />
							) : null}
							{teamOne.name}
						</Link>
					) : (
						"Waiting on team"
					)}
				</h2>
				{teamOnePlayers.length > 0 ? (
					<ul className="stack xs mt-2">
						{teamOnePlayers.map((p) => {
							return (
								<li key={p.id}>
									<Link
										to={userPage(p)}
										className={clsx("stack horizontal sm", {
											[INACTIVE_PLAYER_CSS]:
												teamOneParticipatedPlayers.length > 0 &&
												teamOneParticipatedPlayers.every(
													(participatedPlayer) =>
														p.id !== participatedPlayer.id,
												),
										})}
									>
										<Avatar user={p} size="xxs" />
										{p.username}
									</Link>
								</li>
							);
						})}
					</ul>
				) : null}
			</div>
			<div className="stack xxs">
				<div className="stack xs horizontal items-center text-lighter">
					<div className="tournament-bracket__team-two-dot" />
					Team 2
				</div>
				<h2
					className={clsx("text-sm", {
						"text-lighter": !teamTwo,
						"tournament-bracket__rosters__spaced-header":
							teamOneLogoSrc || teamTwoLogoSrc,
					})}
				>
					{teamTwo ? (
						<Link
							to={tournamentTeamPage({
								tournamentId: tournament.ctx.id,
								tournamentTeamId: teamTwo.id,
							})}
							className="text-main-forced font-bold stack horizontal xs items-center"
						>
							{teamTwoLogoSrc ? (
								<Avatar url={teamTwoLogoSrc} size="sm" />
							) : null}
							{teamTwo.name}
						</Link>
					) : (
						"Waiting on team"
					)}
				</h2>
				{teamTwoPlayers.length > 0 ? (
					<ul className="stack xs mt-2">
						{teamTwoPlayers.map((p) => {
							return (
								<li key={p.id}>
									<Link
										to={userPage(p)}
										className={clsx("stack horizontal sm", {
											[INACTIVE_PLAYER_CSS]:
												teamTwoParticipatedPlayers.length > 0 &&
												teamTwoParticipatedPlayers.every(
													(participatedPlayer) =>
														p.id !== participatedPlayer.id,
												),
										})}
									>
										<Avatar user={p} size="xxs" />
										{p.username}
									</Link>
								</li>
							);
						})}
					</ul>
				) : null}
			</div>
		</div>
	);
}
