import clsx from "clsx";
import { Trans, useTranslation } from "react-i18next";
import type { MetaFunction } from "react-router";
import { Link, Outlet, useLoaderData } from "react-router";
import { Badge } from "~/components/Badge";
import { LinkButton } from "~/components/elements/Button";
import { useHasPermission, useHasRole } from "~/modules/permissions/hooks";
import { metaTags, type SerializeFrom } from "~/utils/remix";
import { badgeUrl, userPage } from "~/utils/urls";
import styles from "../badges.module.css";
import { badgeExplanationText } from "../badges-utils";

import { loader } from "../loaders/badges.$id.server";

export { loader };

export const meta: MetaFunction = (args) => {
	const data = args.loaderData as SerializeFrom<typeof loader> | null;

	if (!data) return [];

	const ownerCount = data.badge.owners.reduce(
		(sum, owner) => sum + owner.count,
		0,
	);

	return metaTags({
		title: data.badge.displayName,
		ogTitle: `${data.badge.displayName} (Splatoon badge)`,
		description: `See who owns the ${data.badge.displayName} badge on sendou.ink. Awarded ${ownerCount} time${ownerCount === 1 ? "" : "s"} so far.`,
		image: {
			url: badgeUrl({ code: data.badge.code, extension: "gif" }),
			dimensions: { width: 200, height: 200 },
		},
		location: args.location,
	});
};

export interface BadgeDetailsContext {
	badge: SerializeFrom<typeof loader>["badge"];
}

export default function BadgeDetailsPage() {
	const isStaff = useHasRole("STAFF");
	const data = useLoaderData<typeof loader>();
	const { t } = useTranslation("badges");

	const canManageBadge = useHasPermission(data.badge, "MANAGE");

	const context: BadgeDetailsContext = { badge: data.badge };

	return (
		<div className="stack md items-center">
			<Outlet context={context} />
			<Badge badge={data.badge} isAnimated size={200} />
			<div>
				<div className={styles.explanation}>
					{badgeExplanationText(t, data.badge)}
				</div>
				<div className={styles.managers}>
					<Trans
						i18nKey="managedBy"
						ns="badges"
						components={[
							<span key="managers">
								{data.badge.managers.length > 0 ? (
									data.badge.managers.map((manager, idx) => (
										<span key={manager.userId}>
											<Link to={userPage(manager)}>{manager.username}</Link>
											{idx < data.badge.managers.length - 1 ? ", " : ""}
										</span>
									))
								) : (
									<span>???</span>
								)}
							</span>,
						]}
					/>{" "}
					(
					<Trans
						i18nKey="madeBy"
						ns="badges"
						components={[<BadgeMaker key="maker" badge={data.badge} />]}
					/>
					)
				</div>
			</div>
			{isStaff || canManageBadge ? (
				<LinkButton to="edit" variant="outlined" size="small">
					Edit
				</LinkButton>
			) : null}
			<div className={clsx(styles.ownersContainer, "scrollbar")}>
				<ul className={styles.owners}>
					{data.badge.owners.map((owner) => (
						<li key={owner.id}>
							<span
								className={clsx(styles.count, {
									invisible: owner.count <= 1,
								})}
							>
								×{owner.count}
							</span>
							<span>{owner.username}</span>
						</li>
					))}
				</ul>
			</div>
		</div>
	);
}

function BadgeMaker({
	badge,
}: {
	badge: SerializeFrom<typeof loader>["badge"];
}) {
	const badgeMakerName = () => {
		if (badge.author?.username) return badge.author.username;
		if (
			[
				"XP3500 (Splatoon 3)",
				"XP4000 (Splatoon 3)",
				"XP4500 (Splatoon 3)",
				"XP5000 (Splatoon 3)",
			].includes(badge.displayName)
		) {
			return "Dreamy";
		}

		return "borzoic";
	};

	if (badge.author) {
		return <Link to={userPage(badge.author)}>{badge.author.username}</Link>;
	}

	return <span>{badgeMakerName()}</span>;
}
