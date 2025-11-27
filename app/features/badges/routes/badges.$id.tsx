import { Link, Outlet, useLoaderData } from "@remix-run/react";
import clsx from "clsx";
import { Trans, useTranslation } from "react-i18next";
import { Badge } from "~/components/Badge";
import { LinkButton } from "~/components/elements/Button";
import { useHasPermission, useHasRole } from "~/modules/permissions/hooks";
import type { SerializeFrom } from "~/utils/remix";
import { userPage } from "~/utils/urls";
import { badgeExplanationText } from "../badges-utils";

import { loader } from "../loaders/badges.$id.server";
export { loader };

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
				<div className="badges__explanation">
					{badgeExplanationText(t, data.badge)}
				</div>
				<div className="badges__managers">
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
			<div className="badges__owners-container">
				<ul className="badges__owners">
					{data.badge.owners.map((owner) => (
						<li key={owner.id}>
							<span
								className={clsx("badges__count", {
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
