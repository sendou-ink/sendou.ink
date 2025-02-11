import type { ActionFunction, LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useMatches } from "@remix-run/react";
import { useTranslation } from "react-i18next";
import { deleteArtSchema } from "~/features/art/art-schemas.server";
import { ART_SOURCES, type ArtSource } from "~/features/art/art-types";
import { ArtGrid } from "~/features/art/components/ArtGrid";
import { artsByUserId } from "~/features/art/queries/artsByUserId.server";
import { deleteArt } from "~/features/art/queries/deleteArt.server";
import { findArtById } from "~/features/art/queries/findArtById.server";
import { useUser } from "~/features/auth/core/user";
import { getUserId, requireUserId } from "~/features/auth/core/user.server";
import { countUnvalidatedArt } from "~/features/img-upload";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { useSearchParamState } from "~/hooks/useSearchParamState";
import invariant from "~/utils/invariant";
import {
	type SendouRouteHandle,
	notFoundIfFalsy,
	parseRequestPayload,
	validate,
} from "~/utils/remix.server";
import { userParamsSchema } from "../user-page-schemas.server";
import type { UserPageLoaderData } from "./u.$identifier";

export const handle: SendouRouteHandle = {
	i18n: ["art"],
};

export const action: ActionFunction = async ({ request }) => {
	const user = await requireUserId(request);
	const data = await parseRequestPayload({
		request,
		schema: deleteArtSchema,
	});

	// this actually doesn't delete the image itself from the static hosting
	// but the idea is that storage is cheap anyway and if needed later
	// then we can have a routine that checks all the images still current and nukes the rest
	const artToDelete = findArtById(data.id);
	validate(artToDelete?.authorId === user.id, "Insufficient permissions", 401);

	deleteArt(data.id);

	return null;
};

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
	const loggedInUser = await getUserId(request);

	const { identifier } = userParamsSchema.parse(params);
	const user = notFoundIfFalsy(
		await UserRepository.identifierToUserId(identifier),
	);

	const arts = artsByUserId(user.id);

	const tagCounts = arts.reduce(
		(acc, art) => {
			if (!art.tags) return acc;

			for (const tag of art.tags) {
				acc[tag] = (acc[tag] ?? 0) + 1;
			}
			return acc;
		},
		{} as Record<string, number>,
	);

	const tagCountsSortedArr = Object.entries(tagCounts).sort(
		(a, b) => b[1] - a[1],
	);

	return {
		arts,
		tagCounts: tagCountsSortedArr.length > 0 ? tagCountsSortedArr : null,
		unvalidatedArtCount:
			user.id === loggedInUser?.id ? countUnvalidatedArt(user.id) : 0,
	};
};

const ALL_TAGS_KEY = "ALL";
export default function UserArtPage() {
	const { t } = useTranslation(["art"]);
	const user = useUser();
	const data = useLoaderData<typeof loader>();
	const [type, setType] = useSearchParamState<ArtSource>({
		defaultValue: "ALL",
		name: "source",
		revive: (value) => ART_SOURCES.find((s) => s === value),
	});
	const [filteredTag, setFilteredTag] = useSearchParamState<string | null>({
		defaultValue: null,
		name: "tag",
		revive: (value) => data.tagCounts?.find((t) => t[0] === value)?.[0],
	});
	const [, parentRoute] = useMatches();
	invariant(parentRoute);
	const layoutData = parentRoute.data as UserPageLoaderData;

	const hasBothArtMadeByAndMadeOf =
		data.arts.some((a) => a.author) && data.arts.some((a) => !a.author);

	let arts =
		type === "ALL" || !hasBothArtMadeByAndMadeOf
			? data.arts
			: type === "MADE-BY"
				? data.arts.filter((a) => !a.author)
				: data.arts.filter((a) => a.author);

	if (filteredTag) {
		arts = arts.filter((a) => a.tags?.includes(filteredTag));
	}

	return (
		<div className="stack md">
			<div className="stack horizontal justify-between items-start text-xs text-lighter">
				<div>
					{data.unvalidatedArtCount > 0
						? t("art:pendingApproval", { count: data.unvalidatedArtCount })
						: null}
				</div>
			</div>

			{hasBothArtMadeByAndMadeOf || data.tagCounts ? (
				<div className="stack md horizontal items-center flex-wrap">
					{data.tagCounts ? (
						<select
							value={filteredTag ?? ALL_TAGS_KEY}
							onChange={(e) =>
								setFilteredTag(
									e.target.value === ALL_TAGS_KEY ? null : e.target.value,
								)
							}
							className="w-max"
						>
							<option value={ALL_TAGS_KEY}>
								{t("art:radios.all")} ({data.arts.length})
							</option>
							{data.tagCounts.map(([tag, count]) => (
								<option key={tag} value={tag}>
									#{tag} ({count})
								</option>
							))}
						</select>
					) : null}
					{hasBothArtMadeByAndMadeOf ? (
						<div className="stack md horizontal">
							<div className="stack xs horizontal items-center">
								<input
									type="radio"
									id="all"
									checked={type === "ALL"}
									onChange={() => setType("ALL")}
								/>
								<label htmlFor="all" className="mb-0">
									{t("art:radios.all")}
								</label>
							</div>
							<div className="stack xs horizontal items-center">
								<input
									type="radio"
									id="made-by"
									checked={type === "MADE-BY"}
									onChange={() => setType("MADE-BY")}
								/>
								<label htmlFor="made-by" className="mb-0">
									{t("art:radios.madeBy")}
								</label>
							</div>
							<div className="stack xs horizontal items-center">
								<input
									type="radio"
									id="made-of"
									checked={type === "MADE-OF"}
									onChange={() => setType("MADE-OF")}
								/>
								<label htmlFor="made-of" className="mb-0">
									{t("art:radios.madeFor")}
								</label>
							</div>
						</div>
					) : null}
				</div>
			) : null}

			{layoutData.user.commissionsOpen || layoutData.user.commissionText ? (
				<div className="whitespace-pre-wrap">
					{layoutData.user.commissionsOpen ? (
						<span className="art__comms-header">
							{t("art:commissionsOpen")} {">>>"}
						</span>
					) : (
						<span className="art__comms-header text-lighter">
							{t("art:commissionsClosed")} {">>>"}
						</span>
					)}{" "}
					{layoutData.user.commissionText}
				</div>
			) : null}

			<ArtGrid
				arts={arts}
				enablePreview
				canEdit={layoutData.user.id === user?.id}
			/>
		</div>
	);
}
