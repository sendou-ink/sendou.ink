import type { LoaderFunctionArgs, SerializeFrom } from "@remix-run/node";
import { Outlet, useLoaderData, useMatches, useParams } from "@remix-run/react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { Badge } from "~/components/Badge";
import { LinkButton } from "~/components/Button";
import { Redirect } from "~/components/Redirect";
import { useUser } from "~/features/auth/core/user";
import { canEditBadgeOwners, isMod } from "~/permissions";
import { BADGES_PAGE } from "~/utils/urls";
import * as BadgeRepository from "../BadgeRepository.server";
import { badgeExplanationText } from "../badges-utils";
import type { BadgesLoaderData } from "./badges";

export interface BadgeDetailsContext {
	badgeName: string;
}

export type BadgeDetailsLoaderData = SerializeFrom<typeof loader>;
export const loader = async ({ params }: LoaderFunctionArgs) => {
	const badgeId = Number(params.id);
	if (Number.isNaN(badgeId)) {
		throw new Response(null, { status: 404 });
	}

	return {
		owners: await BadgeRepository.findOwnersByBadgeId(badgeId),
		managers: await BadgeRepository.findManagersByBadgeId(badgeId),
	};
};

export default function BadgeDetailsPage() {
	const user = useUser();
	const [, parentRoute] = useMatches();
	const { badges } = parentRoute.data as BadgesLoaderData;
	const params = useParams();
	const data = useLoaderData<typeof loader>();
	const { t } = useTranslation("badges");

	const badge = badges.find((b) => b.id === Number(params.id));
	if (!badge) return <Redirect to={BADGES_PAGE} />;

	const context: BadgeDetailsContext = { badgeName: badge.displayName };

	return (
		<div className="stack md items-center">
			<Outlet context={context} />
			<Badge badge={badge} isAnimated size={200} />
			<div>
				<div className="badges__explanation">
					{badgeExplanationText(t, badge)}
				</div>
				<div className="badges__managers">
					{t("managedBy", {
						users: data.managers.map((m) => m.username).join(", ") || "???",
					})}{" "}
					(
					{t("madeBy", {
						user: badge.author?.username ?? "borzoic",
					})}
					)
				</div>
			</div>
			{isMod(user) || canEditBadgeOwners({ user, managers: data.managers }) ? (
				<LinkButton to="edit" variant="outlined" size="tiny">
					Edit
				</LinkButton>
			) : null}
			<div className="badges__owners-container">
				<ul className="badges__owners">
					{data.owners.map((owner) => (
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
