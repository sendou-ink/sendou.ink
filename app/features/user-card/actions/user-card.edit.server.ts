import { type ActionFunction, redirect } from "react-router";
import type { HideableUserCardStat } from "~/db/tables";
import { requireUser } from "~/features/auth/core/user.server";
import * as XRankPlacementRepository from "~/features/top-search/XRankPlacementRepository.server";
import { parseFormDataWithImages } from "~/form/parse.server";
import { userPage } from "~/utils/urls";
import * as UserCardRepository from "../UserCardRepository.server";
import { updateUserCardSchema } from "../user-card-schemas";
import { maxUnverifiedXp } from "../user-card-utils";

export const action: ActionFunction = async ({ request }) => {
	const user = requireUser();

	const returnTo = safeReturnTo(
		new URL(request.url).searchParams.get("returnTo"),
	);

	const result = await parseFormDataWithImages({
		request,
		schema: updateUserCardSchema,
	});

	if (!result.success) {
		return { fieldErrors: result.fieldErrors };
	}

	const data = result.data;

	if (data.unverifiedXpPoints) {
		const linkedPeakXp = await XRankPlacementRepository.verifiedPeakXpByUserId(
			user.id,
		);
		if (data.unverifiedXpPoints > maxUnverifiedXp(linkedPeakXp)) {
			return {
				fieldErrors: { unverifiedXpPoints: "forms:errors.unverifiedXpTooHigh" },
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

function safeReturnTo(value: string | null) {
	if (!value) return null;
	if (!value.startsWith("/") || value.startsWith("//")) return null;

	return value;
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
