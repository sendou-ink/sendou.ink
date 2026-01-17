import { type ActionFunction, redirect } from "react-router";
import type { z } from "zod";
import type { Tables } from "~/db/tables";
import { requireUser } from "~/features/auth/core/user.server";
import type { WeaponPoolItem } from "~/form/fields/WeaponPoolFormField";
import { parseFormData } from "~/form/parse.server";
import type { MainWeaponId, StageId } from "~/modules/in-game-lists/types";
import { requireRole } from "~/modules/permissions/guards.server";
import { vodVideoPage } from "~/utils/urls";
import * as VodRepository from "../VodRepository.server";
import { vodFormSchemaServer } from "../vods-schemas.server";
import type { VideoBeingAdded } from "../vods-types";

export const action: ActionFunction = async ({ request }) => {
	const user = requireUser();
	requireRole(user, "VIDEO_ADDER");

	const result = await parseFormData({
		request,
		schema: vodFormSchemaServer,
	});

	if (!result.success) {
		return { fieldErrors: result.fieldErrors };
	}

	const formData = result.data;
	const video = transformFormDataToVideo(formData);

	let savedVideo: Tables["Video"];
	if (formData.vodToEditId) {
		savedVideo = await VodRepository.update({
			...video,
			submitterUserId: user.id,
			isValidated: true,
			id: formData.vodToEditId,
		});
	} else {
		savedVideo = await VodRepository.insert({
			...video,
			submitterUserId: user.id,
			isValidated: true,
		});
	}

	throw redirect(vodVideoPage(savedVideo.id));
};

type VodFormData = z.output<typeof vodFormSchemaServer>;

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
					: match.weapon
						? [match.weapon as MainWeaponId]
						: [],
		})),
	};
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
