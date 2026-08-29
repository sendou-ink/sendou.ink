import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Avatar } from "~/components/Avatar";
import { ModeImage, StageImage } from "~/components/Image";
import type { Tables } from "~/db/tables";
import { useUser } from "~/features/auth/core/user";
import { useTournament } from "~/features/tournament/tournament-context";
import type { TournamentTeamFull } from "~/features/tournament-bracket/core/Tournament.server";
import { userPage } from "~/utils/urls";
import { accountCreatedInTheLastSixMonths } from "~/utils/users";
import { useTournamentFriendCodes } from "../routes/to.$id";
import styles from "./TeamWithRoster.module.css";

export function TeamWithRoster({
	team,
	mapPool,
	seed,
	bracketLabel,
	teamPageUrl,
	activePlayers,
}: {
	team: TournamentTeamFull;
	mapPool?: Array<Pick<Tables["MapPoolMap"], "stageId" | "mode">> | null;
	seed?: number;
	bracketLabel?: string;
	teamPageUrl?: string;
	activePlayers?: Tables["User"]["id"][];
}) {
	const { t } = useTranslation(["tournament"]);
	const user = useUser();
	const tournament = useTournament();
	const friendCodes = useTournamentFriendCodes();

	return (
		<div>
			<div className={styles.teamWithRoster}>
				<div className={styles.teamWithRosterName}>
					<div className="stack horizontal sm justify-end items-end">
						<Avatar size="xxs" url={team.logoUrl} identiconInput={team.name} />
						{seed ? (
							<div className={styles.teamWithRosterSeed}>
								{bracketLabel ? `${bracketLabel} ` : null}#{seed}
							</div>
						) : null}
					</div>{" "}
					{teamPageUrl ? (
						<Link
							to={teamPageUrl}
							className={styles.teamWithRosterTeamName}
							data-testid="team-name"
							title={team.name}
						>
							{team.name}
						</Link>
					) : (
						<span className={styles.teamWithRosterTeamName} title={team.name}>
							{team.name}
						</span>
					)}
				</div>
				<ul className={styles.teamWithRosterMembers}>
					{team.members.map((member) => {
						const friendCode = friendCodes?.[member.userId];

						const name = () => {
							if (!tournament.ctx.settings.requireInGameNames) {
								return member.username;
							}

							return member.inGameName ?? member.username;
						};

						return (
							<li key={member.userId} className={styles.teamMemberRow}>
								{member.role === "OWNER" ? (
									<span className={`${styles.teamMemberNameRole}`}>
										{t("tournament:roster.role.captain.short")}
									</span>
								) : null}
								{member.isSub && member.role !== "OWNER" ? (
									<span
										className={`${styles.teamMemberNameRole} ${styles.teamMemberNameRoleSub}`}
									>
										{t("tournament:roster.role.sub.short")}
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
	const { t } = useTranslation(["tournament"]);

	if (!accountCreatedInTheLastSixMonths(discordId)) return null;

	return (
		<span className="text-md mr-2" title={t("tournament:roster.freshAccount")}>
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
						<StageImage
							stageId={stageId}
							width={85}
							testId={`team-map-pool-${mode}-${stageId}`}
						/>
						<div className={styles.teamWithRosterMapPoolModeInfo}>
							<ModeImage mode={mode} size={16} />
						</div>
					</div>
				);
			})}
		</div>
	);
}
