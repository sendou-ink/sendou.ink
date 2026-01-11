import { requireUser } from "~/features/auth/core/user.server";
import type { WeaponPoolItem } from "~/form/fields/WeaponPoolFormField";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import * as VodRepository from "./VodRepository.server";
import { vodFormBaseSchema } from "./vods-schemas";
import { canEditVideo } from "./vods-utils";

function dateToDayMonthYear(date: Date) {
	return {
		day: date.getDate(),
		month: date.getMonth() + 1,
		year: date.getFullYear(),
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

export const vodFormSchemaServer = vodFormBaseSchema
	.transform((data) => {
		const teamSize = data.teamSize ? Number(data.teamSize) : 4;

		return {
			vodToEditId: data.vodToEditId,
			video: {
				type: data.type,
				youtubeUrl: data.youtubeUrl,
				title: data.title,
				date: dateToDayMonthYear(data.date),
				pov: transformPov(data.pov),
				teamSize: data.type === "CAST" ? teamSize : undefined,
				matches: data.matches.map((match) => ({
					startsAt: match.startsAt,
					mode: match.mode,
					stageId: match.stageId,
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
			},
		};
	})
	.refine(
		async (data) => {
			if (!data.vodToEditId) return true;

			const user = requireUser();
			const vod = await VodRepository.findVodById(data.vodToEditId);
			if (!vod) return false;

			return canEditVideo({
				userId: user.id,
				submitterUserId: vod.submitterUserId,
				povUserId: typeof vod.pov === "string" ? undefined : vod.pov?.id,
			});
		},
		{ message: "No permissions to edit this VOD", path: ["vodToEditId"] },
	);
