import type {
	LoaderFunctionArgs,
	MetaFunction,
	SerializeFrom,
} from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import { useTranslation } from "react-i18next";
import { Main } from "~/components/Main";
import { i18next } from "~/modules/i18n/i18next.server";
import { removeDuplicates } from "~/utils/arrays";
import { type SendouRouteHandle, notFoundIfFalsy } from "~/utils/remix.server";
import { makeTitle } from "~/utils/strings";
import {
	navIconUrl,
	topSearchPage,
	topSearchPlayerPage,
	userPage,
} from "~/utils/urls";
import { PlacementsTable } from "../components/Placements";
import { findPlacementsByPlayerId } from "../queries/findPlacements.server";

import "../top-search.css";

export const handle: SendouRouteHandle = {
	breadcrumb: ({ match }) => {
		const data = match.data as SerializeFrom<typeof loader> | undefined;

		if (!data) return [];

		const firstName = data.placements[0].name;

		return [
			{
				imgPath: navIconUrl("xsearch"),
				href: topSearchPage(),
				type: "IMAGE",
			},
			{
				text: firstName,
				type: "TEXT",
				href: topSearchPlayerPage(data.placements[0].playerId),
			},
		];
	},
};

export const meta: MetaFunction = (args) => {
	const data = args.data as SerializeFrom<typeof loader> | null;

	if (!data) return [];

	return [
		{ title: data.title },
		{
			name: "description",
			content: `Splatoon 3 X Battle for the player ${data.placements[0].name}`,
		},
	];
};

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
	const placements = notFoundIfFalsy(
		findPlacementsByPlayerId(Number(params.id)),
	);

	const t = await i18next.getFixedT(request);

	return {
		placements,
		title: makeTitle([placements[0].name, t("pages.xsearch")]),
	};
};

export default function XSearchPlayerPage() {
	const { t } = useTranslation(["common"]);
	const data = useLoaderData<typeof loader>();

	const firstName = data.placements[0].name;
	const aliases = removeDuplicates(
		data.placements
			.map((placement) => placement.name)
			.filter((name) => name !== firstName),
	);

	const hasUserLinked = Boolean(data.placements[0].discordId);

	return (
		<Main halfWidth className="stack lg">
			<div>
				<h2 className="text-lg">
					{hasUserLinked ? (
						<Link to={userPage(data.placements[0])}>{firstName}</Link>
					) : (
						<>{firstName}</>
					)}{" "}
					{t("common:xsearch.placements")}
				</h2>
				{aliases.length > 0 ? (
					<div className="text-lighter text-sm">
						{t("common:xsearch.aliases")} {aliases.join(", ")}
					</div>
				) : null}
			</div>
			<PlacementsTable placements={data.placements} type="MODE_INFO" />
		</Main>
	);
}
