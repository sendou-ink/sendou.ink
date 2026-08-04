import { type ActionFunction, redirect } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as XRankPlacementRepository from "~/features/top-search/XRankPlacementRepository.server";
import { parseFormDataWithImages } from "~/form/parse.server";
import { userPage } from "~/utils/urls";
import * as UserCardRepository from "../UserCardRepository.server";
import { updateUserCardSchema } from "../user-card-schemas";
import { userCardEditSearchParams } from "../user-card-search-params";
import type { HideableUserCardStat } from "../user-card-types";
import { isValidUnverifiedXp } from "../user-card-utils";

export const action: ActionFunction = async ({ request }) => {
	const user = requireUser();

	const { returnTo } = userCardEditSearchParams.parse(request);

	const result = await parseFormDataWithImages({
		request,
		schema: updateUserCardSchema,
	});

	if (!result.success) {
		return { fieldErrors: result.fieldErrors };
	}

	const data = result.data;

	if (data.unverifiedXpPoints) {
		const verifiedPeakXp =
			await XRankPlacementRepository.findPeakVerifiedXpByUserId(user.id);
		if (
			!isValidUnverifiedXp({
				unverified: data.unverifiedXpPoints,
				verified: verifiedPeakXp,
			})
		) {
			return {
				fieldErrors: {
					unverifiedXpPoints: "forms:errors.unverifiedXpNotAboveVerified",
				},
			};
		}
	}

	const isSupporter = Boolean(user.roles?.includes("SUPPORTER"));

	await UserCardRepository.updateOwnCard({
		shortBio: data.shortBio || null,
		...resolveBanner({ ...data, isSupporter }),
		unverifiedPeakXP: data.unverifiedXpPoints
			? {
					overall: data.unverifiedXpPoints,
					tentatek:
						data.unverifiedXpDivision === "WEST"
							? data.unverifiedXpPoints
							: null,
					takoroka:
						data.unverifiedXpDivision === "JPN"
							? data.unverifiedXpPoints
							: null,
				}
			: null,
		hiddenCardStats: resolveHiddenStats(data),
	});

	throw redirect(returnTo ?? userPage(user));
};

function resolveBanner({
	bannerType,
	bannerColor,
	bannerStageId,
	bannerImage,
	isSupporter,
}: {
	bannerType: "COLOR" | "STAGE" | "URL";
	bannerColor: string;
	bannerStageId: number;
	bannerImage: number | null;
	isSupporter: boolean;
}): { bannerPresetImg: string | null; bannerImgId: number | null } {
	switch (bannerType) {
		case "STAGE":
			return { bannerPresetImg: String(bannerStageId), bannerImgId: null };
		case "URL":
			return {
				bannerPresetImg: null,
				bannerImgId: isSupporter ? bannerImage : null,
			};
		default:
			return { bannerPresetImg: bannerColor, bannerImgId: null };
	}
}

function resolveHiddenStats(data: {
	hideXp: boolean;
	hideDiv: boolean;
}): Array<HideableUserCardStat> {
	return [
		data.hideXp ? ("XP" as const) : null,
		data.hideDiv ? ("DIV" as const) : null,
	].filter((stat) => stat !== null);
}
