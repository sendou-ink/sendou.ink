import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { Link, useLoaderData } from "react-router";
import { Divider } from "~/components/Divider";
import { userPage } from "~/utils/urls";
import { TrophyShowcase } from "../components/TrophyShowcase";
import { TrophyTournamentHistory } from "../components/TrophyTournamentHistory";
import { loader } from "../loaders/trophies.$id.server";
import { parseSpecialTrophyCode } from "../trophies-utils";
import styles from "./trophies.module.css";

export { loader };

export default function TrophyDetailsPage() {
	const { t } = useTranslation(["trophies"]);
	const data = useLoaderData<typeof loader>();
	const { trophy, tournaments } = data;

	const special = parseSpecialTrophyCode(trophy.code);

	return (
		<TrophyShowcase
			model={trophy.model}
			className={styles.trophyDetailsContainer}
			detailsClassName={styles.trophyDetails}
		>
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
				{special ? (
					<p className={styles.trophyMeta}>
						{special.type === "supporter"
							? t("trophies:special.supporter.description")
							: t("trophies:special.xp.description", {
									value: special.value,
								})}
					</p>
				) : null}
			</div>
			{special ? null : (
				<div className="stack xs">
					<Divider className={styles.divider} smallText>
						{t("trophies:details.tournamentHistory")}
					</Divider>
					{tournaments.length > 0 ? (
						<TrophyTournamentHistory tournaments={tournaments} />
					) : (
						<p className="text-center text-lighter text-xxs">
							{t("trophies:details.noTournamentHistory")}
						</p>
					)}
				</div>
			)}
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
		</TrophyShowcase>
	);
}
