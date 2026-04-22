import clsx from "clsx";
import { Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useLoaderData } from "react-router";
import { Divider } from "~/components/Divider";
import { TierPill } from "~/components/TierPill";
import { useTimeFormat } from "~/hooks/useTimeFormat";
import { databaseTimestampToDate } from "~/utils/dates";
import { tournamentPage, userPage } from "~/utils/urls";
import { Trophy } from "../components/Trophy";
import {
	loader,
	type TrophyDetailsLoaderData,
} from "../loaders/trophies.$id.server";
import styles from "./trophies.module.css";

export { loader };

export default function TrophyDetailsPage() {
	const { t } = useTranslation(["trophies"]);
	const data = useLoaderData<typeof loader>();
	const { trophy, tournaments } = data;

	return (
		<div className={styles.trophyDetailsContainer}>
			<Trophy model={trophy.model} />
			<div className={clsx(styles.trophyDetails, "scrollbar")}>
				<div className="stack xxs">
					<p className={styles.trophyName}>{trophy.name}</p>
					{trophy.organization ? (
						<p className={styles.trophyMeta}>
							{t("trophies:details.organization", {
								name: trophy.organization.name,
							})}
						</p>
					) : null}
					{trophy.creator ? (
						<p className={styles.trophyMeta}>
							{t("trophies:details.createdBy", {
								name: trophy.creator.username,
							})}
						</p>
					) : null}
					{trophy.manager ? (
						<p className={styles.trophyMeta}>
							{t("trophies:details.managedBy", {
								name: trophy.manager.username,
							})}
						</p>
					) : null}
				</div>
				<div className="stack xs">
					<Divider className={styles.divider} smallText>
						{t("trophies:details.tournamentHistory")}
					</Divider>
					{tournaments.length > 0 ? (
						<ul className={styles.tournamentHistory}>
							{tournaments.map((tournament) => (
								<TournamentHistoryEntry
									key={tournament.tournamentId}
									tournament={tournament}
								/>
							))}
						</ul>
					) : (
						<p className="text-center text-lighter text-xxs">
							{t("trophies:details.noTournamentHistory")}
						</p>
					)}
				</div>
				<div className="stack xs">
					<Divider className={styles.divider} smallText>
						{t("trophies:details.owners")}
					</Divider>
					{trophy.owners.length > 0 ? (
						<ul className={styles.owners}>
							{trophy.owners.map((owner) => (
								<li key={owner.id}>
									<Link to={userPage(owner)}>{owner.username}</Link>
									<span
										className={clsx(styles.ownerCount, {
											hidden: owner.count <= 1,
										})}
									>
										×{owner.count}
									</span>
								</li>
							))}
						</ul>
					) : (
						<p className="text-center text-lighter text-xxs">
							{t("trophies:details.noOwners")}
						</p>
					)}
				</div>
			</div>
		</div>
	);
}

function TournamentHistoryEntry({
	tournament,
}: {
	tournament: TrophyDetailsLoaderData["tournaments"][number];
}) {
	const { formatDate } = useTimeFormat();

	return (
		<li>
			<Link
				to={tournamentPage(tournament.tournamentId)}
				className={styles.tournamentHistoryEntry}
			>
				<img
					src={tournament.logoUrl}
					alt=""
					width={32}
					height={32}
					className={styles.tournamentHistoryLogo}
				/>
				<div className="stack xxs">
					<span className={styles.tournamentHistoryName}>
						<p>{tournament.name}</p>
						{tournament.tier ? (
							<TierPill tier={tournament.tier} />
						) : tournament.tentativeTier ? (
							<TierPill tier={tournament.tentativeTier} isTentative />
						) : null}
					</span>
					<div className={styles.tournamentHistoryMeta}>
						<span className={styles.tournamentHistoryMetaItem}>
							<Users className={styles.tournamentHistoryIcon} />
							{tournament.teamsCount}
						</span>
						{tournament.startTime ? (
							<span className={styles.tournamentHistoryMetaItem}>
								{formatDate(databaseTimestampToDate(tournament.startTime), {
									day: "numeric",
									month: "short",
									year: "numeric",
								})}
							</span>
						) : null}
					</div>
				</div>
			</Link>
		</li>
	);
}
