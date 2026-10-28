import { redirect } from "react-router";
import type * as v from "valibot";
import { requireUser } from "~/features/auth/core/user.server";
import { defineAction } from "~/form/define-action.server";
import type { WeaponPoolItem } from "~/form/fields/WeaponPoolFormField";
import type { MainWeaponId, StageId } from "~/modules/in-game-lists/types";
import { requireRole } from "~/modules/permissions/guards.server";
import { vodVideoPage } from "~/utils/urls";
import * as VodRepository from "../VodRepository.server";
import { vodFormSchemaServer } from "../vods-schemas.server";
import type { VideoBeingAdded } from "../vods-types";

export const action = defineAction(
	{ body: vodFormSchemaServer },
	async ({ body }) => {
		const user = requireUser();
		requireRole("VIDEO_ADDER");

		// players are saved per weapon, a match without weapons would lose its POV
		const missingWeaponErrors = missingWeaponFieldErrors(body);
		if (missingWeaponErrors) return { fieldErrors: missingWeaponErrors };

		const video = transformFormDataToVideo(body);

		const savedVideo = body.vodToEditId
			? await VodRepository.update({
					...video,
					isValidated: true,
					id: body.vodToEditId,
				})
			: await VodRepository.insert({
					...video,
					submitterUserId: user.id,
					isValidated: true,
				});

		throw redirect(vodVideoPage(savedVideo.id));
	},
);

type VodFormData = v.InferOutput<typeof vodFormSchemaServer>;

function transformFormDataToVideo(data: VodFormData): VideoBeingAdded {
	const teamSize = data.teamSize ? Number(data.teamSize) : 4;

	return {
		type: data.type,
		youtubeUrl: data.youtubeUrl,
		title: data.title,
		date: data.date,
		pov: transformPov(data.pov),
		teamSize: data.type === "CAST" ? teamSize : undefined,
		matches: data.matches.map((match) => ({
			startsAt: match.startsAt,
			mode: match.mode,
			stageId: match.stageId as StageId,
			weapons:
				data.type === "CAST"
					? [
							...weaponPoolToIds(match.weaponsTeamOne ?? []),
							...weaponPoolToIds(match.weaponsTeamTwo ?? []),
						]
					: typeof match.weapon === "number"
						? [match.weapon as MainWeaponId]
						: [],
		})),
	};
}

function missingWeaponFieldErrors(data: VodFormData) {
	const teamSize = data.teamSize ? Number(data.teamSize) : 4;
	const fieldErrors: Record<string, string> = {};

	for (const [matchIdx, match] of data.matches.entries()) {
		if (data.type !== "CAST") {
			if (typeof match.weapon !== "number") {
				fieldErrors[`matches[${matchIdx}].weapon`] = "forms:errors.required";
			}
			continue;
		}

		for (const team of ["weaponsTeamOne", "weaponsTeamTwo"] as const) {
			if ((match[team]?.length ?? 0) < teamSize) {
				fieldErrors[`matches[${matchIdx}].${team}`] = "forms:errors.required";
			}
		}
	}

	return Object.keys(fieldErrors).length > 0 ? fieldErrors : null;
}

function weaponPoolToIds(pool: WeaponPoolItem[]): MainWeaponId[] {
	return pool.map((item) => item.id as MainWeaponId);
}

function transformPov(
	pov:
		| { type: "USER"; userId?: number }
		| { type: "NAME"; name: string }
		| undefined,
):
	| { type: "USER"; userId: number }
	| { type: "NAME"; name: string }
	| undefined {
	if (!pov) return undefined;
	if (pov.type === "NAME") return pov;
	if (pov.type === "USER" && pov.userId) {
		return { type: "USER", userId: pov.userId };
	}
	return undefined;
}
