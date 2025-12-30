import { Link } from "@remix-run/react";
import clsx from "clsx";
import { Avatar } from "~/components/Avatar";
import { ModeImage, StageImage } from "~/components/Image";
import type { Tables } from "~/db/tables";
import { useUser } from "~/features/auth/core/user";
import type { TournamentDataTeam } from "~/features/tournament-bracket/core/Tournament.server";
import { databaseTimestampToDate } from "~/utils/dates";
import { userPage } from "~/utils/urls";
import { accountCreatedInTheLastSixMonths } from "~/utils/users";
import { useTournament, useTournamentFriendCodes } from "../routes/to.$id";
import styles from "../tournament.module.css";

export function TeamWithRoster({
	team,
	mapPool,
	seed,
	teamPageUrl,
	activePlayers,
}: {
	team: TournamentDataTeam;
	mapPool?: Array<Pick<Tables["MapPoolMap"], "stageId" | "mode">> | null;
	seed?: number;
	teamPageUrl?: string;
	activePlayers?: Tables["User"]["id"][];
}) {
	const user = useUser();
	const tournament = useTournament();
	const friendCodes = useTournamentFriendCodes();

	const teamLogoSrc = tournament.tournamentTeamLogoSrc(team);

	return (
		<div>
			<div className={styles.teamWithRoster}>
				<div className={styles.teamWithRosterName}>
					<div className="stack horizontal sm justify-end items-end">
						{teamLogoSrc ? <Avatar size="xxs" url={teamLogoSrc} /> : null}
						{seed ? (
							<div className={styles.teamWithRosterSeed}>#{seed}</div>
						) : null}
					</div>{" "}
					{teamPageUrl ? (
						<Link
							to={teamPageUrl}
							className={styles.teamWithRosterTeamName}
							data-testid="team-name"
						>
							{team.name}
						</Link>
					) : (
						<span className={styles.teamWithRosterTeamName}>{team.name}</span>
					)}
				</div>
				<ul className={styles.teamWithRosterMembers}>
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
							<li key={member.userId} className={styles.teamMemberRow}>
								{member.isOwner ? (
									<span className={`${styles.teamMemberNameRole} text-theme`}>
										C
									</span>
								) : null}
								{isSub && !member.isOwner ? (
									<span
										className={`${styles.teamMemberNameRole} ${styles.teamMemberNameRoleSub}`}
									>
										S
									</span>
								) : null}
								<div
									className={clsx(styles.teamWithRosterMember, {
										[styles.teamWithRosterMemberInactive]:
											activePlayers && !activePlayers.includes(member.userId),
									})}
								>
									<Avatar
										user={member}
										size="xxs"
										className={clsx({
											[styles.teamWithRosterMemberAvatarInactive]:
												activePlayers && !activePlayers.includes(member.userId),
										})}
									/>
									<Link
										to={userPage(member)}
										className={styles.teamMemberName}
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
	mapPool: Array<Pick<Tables["MapPoolMap"], "stageId" | "mode">>;
}) {
	return (
		<div
			className={clsx(styles.teamWithRosterMapPool, {
				[styles.teamWithRosterMapPool3Columns]: mapPool.length % 3 === 0,
			})}
		>
			{mapPool.map(({ mode, stageId }, i) => {
				return (
					<div key={i}>
						<StageImage stageId={stageId} width={85} />
						<div className={styles.teamWithRosterMapPoolModeInfo}>
							<ModeImage mode={mode} size={16} />
						</div>
					</div>
				);
			})}
		</div>
	);
}
