import clsx from "clsx";
import { Trans, useTranslation } from "react-i18next";
import { Link, type MetaFunction, useLoaderData } from "react-router";
import { Divider } from "~/components/Divider";
import { WeaponImage } from "~/components/Image";
import { tournamentOrganizationPage } from "~/features/tournament-organization/tournament-organization-urls";
import { metaTags, ogPageImage, type SerializeFrom } from "~/utils/remix";
import { userPage } from "~/utils/urls";
import { TrophyShowcase } from "../components/TrophyShowcase";
import { TrophyTournamentHistory } from "../components/TrophyTournamentHistory";
import * as XpTrophy from "../core/XpTrophy";
import { loader } from "../loaders/trophies.$id.server";
import styles from "./trophies.$id.module.css";

export { loader };

export const meta: MetaFunction = (args) => {
	const data = args.loaderData as SerializeFrom<typeof loader> | null;

	if (!data) return [];

	const ownerCount = data.trophy.owners.reduce(
		(sum, owner) => sum + owner.count,
		0,
	);

	return metaTags({
		title: data.trophy.name,
		ogTitle: `${data.trophy.name} (Splatoon trophy)`,
		description: `See who owns the ${data.trophy.name} trophy on sendou.ink. Awarded ${ownerCount} time${ownerCount === 1 ? "" : "s"} so far.`,
		image: ogPageImage("trophies"),
		location: args.location,
	});
};

export default function TrophyDetailsPage() {
	const { t } = useTranslation(["trophies", "common"]);
	const data = useLoaderData<typeof loader>();
	const { trophy, tournaments, xpWeapons } = data;

	const xpVariant = XpTrophy.parseCode(trophy.code);

	return (
		<TrophyShowcase
			model={trophy.model}
			code={trophy.code}
			className={styles.trophyDetailsContainer}
			detailsClassName={styles.trophyDetails}
		>
			<div className="stack xxs">
				<p className={styles.trophyName}>{trophy.name}</p>
				{trophy.organization ? (
					<p className={styles.trophyMeta}>
						<Trans
							t={t}
							i18nKey="trophies:details.organization"
							values={{ name: trophy.organization.name }}
						>
							Organization:
							<Link
								to={tournamentOrganizationPage({
									organizationSlug: trophy.organization.slug,
								})}
							>
								{trophy.organization.name}
							</Link>
						</Trans>
					</p>
				) : null}
				{trophy.creator ? (
					<p className={styles.trophyMeta}>
						<Trans
							t={t}
							i18nKey="trophies:details.createdBy"
							values={{ name: trophy.creator.username }}
						>
							Created by
							<Link to={userPage(trophy.creator)}>
								{trophy.creator.username}
							</Link>
						</Trans>
					</p>
				) : null}
				{trophy.manager ? (
					<p className={styles.trophyMeta}>
						<Trans
							t={t}
							i18nKey="trophies:details.managedBy"
							values={{ name: trophy.manager.username }}
						>
							Managed by
							<Link to={userPage(trophy.manager)}>
								{trophy.manager.username}
							</Link>
						</Trans>
					</p>
				) : null}
				{xpVariant ? (
					<p className={styles.trophyMeta}>
						{t("trophies:special.xp.categoryDescription", {
							value: xpVariant.milestone,
							category: t(
								`common:weapon.category.${XpTrophy.categoryKey(xpVariant.category)}`,
							),
						})}
					</p>
				) : null}
			</div>
			{xpWeapons ? (
				xpWeapons.length > 0 ? (
					<div className="stack xs">
						<Divider className={styles.divider} smallText>
							{t("trophies:details.weapons")}
						</Divider>
						<ul className={styles.weapons} data-testid="trophy-weapons">
							{xpWeapons.map((weapon) => (
								<li key={weapon.weaponSplId}>
									<WeaponImage
										weaponSplId={weapon.weaponSplId}
										variant="badge"
										width={32}
										height={32}
									/>
									<span className={styles.weaponCount}>
										×{weapon.ownerCount}
									</span>
								</li>
							))}
						</ul>
					</div>
				) : null
			) : (
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
					<ul className={styles.owners} data-testid="trophy-owners">
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
