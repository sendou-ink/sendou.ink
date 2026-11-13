import clsx from "clsx";
import { Trans, useTranslation } from "react-i18next";
import type { MetaFunction } from "react-router";
import { Link, Outlet, useLoaderData } from "react-router";
import { Badge } from "~/components/Badge";
import { LinkButton } from "~/components/elements/Button";
import { useHasPermission, useHasRole } from "~/modules/permissions/hooks";
import { metaTags, type SerializeFrom } from "~/utils/remix";
import { badgeEditPage, badgeUrl, userPage } from "~/utils/urls";
import { BadgeExplanation } from "../components/BadgeExplanation";
import * as BadgeOrigin from "../core/BadgeOrigin";
import * as BadgeOwners from "../core/BadgeOwners";
import { loader } from "../loaders/badges.$id.server";
import styles from "./badges.$id.module.css";

export { loader };

export const meta: MetaFunction = (args) => {
	const data = args.loaderData as SerializeFrom<typeof loader> | null;

	if (!data) return [];

	const ownerCount = BadgeOwners.total(data.badge.owners);

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
				<div className={styles.explanation} data-testid="badge-explanation">
					<BadgeExplanation badge={data.badge} />
				</div>
				<div className={styles.managers} data-testid="badge-credits">
					<Trans
						t={t}
						i18nKey="managedBy"
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
						t={t}
						i18nKey="madeBy"
						components={[<BadgeMaker key="maker" badge={data.badge} />]}
					/>
					)
				</div>
			</div>
			{isStaff || canManageBadge ? (
				<LinkButton
					to={badgeEditPage(data.badge.id)}
					variant="outlined"
					size="small"
				>
					Edit
				</LinkButton>
			) : null}
			<div className={styles.ownersContainer}>
				<ul className={styles.owners} data-testid="badge-owners">
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
	if (badge.author) {
		return <Link to={userPage(badge.author)}>{badge.author.username}</Link>;
	}

	return <span>{BadgeOrigin.legacyMakerName(badge)}</span>;
}
