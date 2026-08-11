import { type ActionFunction, redirect } from "react-router";
import type { PeakXP } from "~/db/tables-json";
import { requireUser } from "~/features/auth/core/user.server";
import type { XRankPlacementRegion } from "~/features/top-search/top-search-types";
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

	const verifiedXp = data.unverifiedXpPoints
		? await UserCardRepository.findVerifiedXpByUserId(user.id, data.xpDivision)
		: null;

	if (
		data.unverifiedXpPoints &&
		!isValidUnverifiedXp({
			unverified: data.unverifiedXpPoints,
			verified: verifiedXp?.points ?? null,
		})
	) {
		return {
			fieldErrors: {
				unverifiedXpPoints: "forms:errors.unverifiedXpNotAboveVerified",
			},
		};
	}

	const isSupporter = Boolean(user.roles?.includes("SUPPORTER"));

	await UserCardRepository.updateOwnCard({
		shortBio: data.shortBio || null,
		...resolveBanner({ ...data, isSupporter }),
		xpDivision: data.xpDivision,
		unverifiedPeakXP:
			data.unverifiedXpPoints && verifiedXp
				? peakXP(data.unverifiedXpPoints, data.xpDivision ?? verifiedXp.region)
				: null,
		hiddenCardStats: resolveHiddenStats(data),
	});

	throw redirect(returnTo ?? userPage(user));
};

function peakXP(points: number, region: XRankPlacementRegion): PeakXP {
	return {
		overall: points,
		tentatek: region === "WEST" ? points : null,
		takoroka: region === "JPN" ? points : null,
	};
}

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
