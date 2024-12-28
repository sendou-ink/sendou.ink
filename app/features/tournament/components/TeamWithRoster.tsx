import { Link } from "@remix-run/react";
import clsx from "clsx";
import { Avatar } from "~/components/Avatar";
import { ModeImage, StageImage } from "~/components/Image";
import type { MapPoolMap, User } from "~/db/types";
import { useUser } from "~/features/auth/core/user";
import type { TournamentDataTeam } from "~/features/tournament-bracket/core/Tournament.server";
import { databaseTimestampToDate } from "~/utils/dates";
import { userPage } from "~/utils/urls";
import { accountCreatedInTheLastSixMonths } from "~/utils/users";
import { useTournament, useTournamentFriendCodes } from "../routes/to.$id";

export function TeamWithRoster({
	team,
	mapPool,
	seed,
	teamPageUrl,
	activePlayers,
}: {
	team: TournamentDataTeam;
	mapPool?: Array<Pick<MapPoolMap, "stageId" | "mode">> | null;
	seed?: number;
	teamPageUrl?: string;
	activePlayers?: User["id"][];
}) {
	const user = useUser();
	const tournament = useTournament();
	const friendCodes = useTournamentFriendCodes();

	const teamLogoSrc = tournament.tournamentTeamLogoSrc(team);

	return (
		<div>
			<div className="tournament__team-with-roster">
				<div className="tournament__team-with-roster__name">
					<div className="stack horizontal sm justify-end items-end">
						{teamLogoSrc ? <Avatar size="xxs" url={teamLogoSrc} /> : null}
						{seed ? (
							<div className="tournament__team-with-roster__seed">#{seed}</div>
						) : null}
					</div>{" "}
					{teamPageUrl ? (
						<Link
							to={teamPageUrl}
							className="tournament__team-with-roster__team-name"
							data-testid="team-name"
						>
							{team.name}
						</Link>
					) : (
						<span className="tournament__team-with-roster__team-name">
							{team.name}
						</span>
					)}
				</div>
				<ul className="tournament__team-with-roster__members">
					{team.members.map((member) => {
						const friendCode = friendCodes?.[member.userId];
						const isSub =
							databaseTimestampToDate(member.createdAt) >
							tournament.ctx.startTime;

						const name = () => {
							if (!tournament.ctx.settings.requireInGameNames) {
								return member.username;
							}

							return member.inGameName ?? member.username;
						};

						return (
							<li key={member.userId} className="tournament__team-member-row">
								{member.isOwner ? (
									<span className="tournament__team-member-name__role text-theme">
										C
									</span>
								) : null}
								{isSub && !member.isOwner ? (
									<span className="tournament__team-member-name__role tournament__team-member-name__role__sub">
										S
									</span>
								) : null}
								<div
									className={clsx("tournament__team-with-roster__member", {
										"tournament__team-with-roster__member__inactive":
											activePlayers && !activePlayers.includes(member.userId),
									})}
								>
									<Avatar
										user={member}
										size="xxs"
										className={clsx({
											"tournament__team-with-roster__member__avatar-inactive":
												activePlayers && !activePlayers.includes(member.userId),
										})}
									/>
									<Link
										to={userPage(member)}
										className="tournament__team-member-name"
										data-testid="team-member-name"
									>
										{name()}
									</Link>
								</div>
								{friendCode ? (
									<div className="text-xs text-lighter">
										{tournament.isOrganizer(user) ? (
											<FreshAccountEmoji discordId={member.discordId} />
										) : null}
										SW-{friendCode}
									</div>
								) : null}
							</li>
						);
					})}
				</ul>
			</div>
			{mapPool && mapPool.length > 0 ? <TeamMapPool mapPool={mapPool} /> : null}
		</div>
	);
}

function FreshAccountEmoji({ discordId }: { discordId: string }) {
	if (!accountCreatedInTheLastSixMonths(discordId)) return null;

	return (
		<span
			className="text-md mr-2"
			title="Discord account created in the last 6 months"
		>
			👶
		</span>
	);
}

function TeamMapPool({
	mapPool,
}: {
	mapPool: Array<Pick<MapPoolMap, "stageId" | "mode">>;
}) {
	return (
		<div
			className={clsx("tournament__team-with-roster__map-pool", {
				"tournament__team-with-roster__map-pool__3-columns":
					mapPool.length % 3 === 0,
			})}
		>
			{mapPool.map(({ mode, stageId }, i) => {
				return (
					<div key={i}>
						<StageImage stageId={stageId} width={85} />
						<div className="tournament__team-with-roster__map-pool__mode-info">
							<ModeImage mode={mode} size={16} />
						</div>
					</div>
				);
			})}
		</div>
	);
}
