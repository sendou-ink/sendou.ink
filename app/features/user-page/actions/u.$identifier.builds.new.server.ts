import { type ActionFunction, redirect } from "@remix-run/node";
import { z } from "zod";
import { BUILD } from "~/constants";
import { requireUser } from "~/features/auth/core/user.server";
import * as BuildRepository from "~/features/builds/BuildRepository.server";
import { refreshBuildsCacheByWeaponSplIds } from "~/features/builds/core/cached-builds.server";
import type { BuildWeaponWithTop500Info } from "~/features/builds/queries/buildsBy.server";
import {
	clothesGearIds,
	headGearIds,
	modesShort,
	shoesGearIds,
} from "~/modules/in-game-lists";
import type {
	BuildAbilitiesTuple,
	MainWeaponId,
} from "~/modules/in-game-lists/types";
import { removeDuplicates } from "~/utils/arrays";
import { unJsonify } from "~/utils/kysely.server";
import { logger } from "~/utils/logger";
import { parseRequestPayload, validate } from "~/utils/remix.server";
import type { Nullish } from "~/utils/types";
import { userBuildsPage } from "~/utils/urls";
import {
	actualNumber,
	checkboxValueToBoolean,
	checkboxValueToDbBoolean,
	clothesMainSlotAbility,
	dbBoolean,
	falsyToNull,
	headMainSlotAbility,
	id,
	processMany,
	removeDuplicates as removeDuplicatesZod,
	safeJSONParse,
	shoesMainSlotAbility,
	stackableAbility,
	toArray,
	weaponSplId,
} from "~/utils/zod";

export const action: ActionFunction = async ({ request }) => {
	const user = await requireUser(request);
	const data = await parseRequestPayload({
		request,
		schema: newBuildActionSchema,
	});

	const usersBuilds = await BuildRepository.allByUserId({
		userId: user.id,
		showPrivate: true,
	});

	if (usersBuilds.length >= BUILD.MAX_COUNT) {
		throw new Response("Max amount of builds reached", { status: 400 });
	}
	validate(
		!data.buildToEditId ||
			usersBuilds.some((build) => build.id === data.buildToEditId),
	);

	const someGearIsMissing =
		!data["HEAD[value]"] || !data["CLOTHES[value]"] || !data["SHOES[value]"];

	const commonArgs = {
		title: data.title,
		description: data.description,
		abilities: data.abilities as BuildAbilitiesTuple,
		headGearSplId: (someGearIsMissing ? -1 : data["HEAD[value]"])!,
		clothesGearSplId: (someGearIsMissing ? -1 : data["CLOTHES[value]"])!,
		shoesGearSplId: (someGearIsMissing ? -1 : data["SHOES[value]"])!,
		modes: modesShort.filter((mode) => data[mode]),
		weaponSplIds: data["weapon[value]"],
		ownerId: user.id,
		private: data.private,
	};
	if (data.buildToEditId) {
		await BuildRepository.update({ id: data.buildToEditId, ...commonArgs });
	} else {
		await BuildRepository.create(commonArgs);
	}

	try {
		refreshCache({
			newWeaponSplIds: commonArgs.weaponSplIds,
			oldBuilds: usersBuilds,
			buildToEditId: data.buildToEditId,
		});
	} catch (error) {
		logger.warn("Error refreshing builds cache", error);
	}

	return redirect(userBuildsPage(user));
};

const newBuildActionSchema = z.object({
	buildToEditId: z.preprocess(actualNumber, id.nullish()),
	title: z
		.string()
		.min(BUILD.TITLE_MIN_LENGTH)
		.max(BUILD.TITLE_MAX_LENGTH)
		.transform(unJsonify),
	description: z.preprocess(
		falsyToNull,
		z
			.string()
			.max(BUILD.DESCRIPTION_MAX_LENGTH)
			.nullable()
			.transform(unJsonify),
	),
	TW: z.preprocess(checkboxValueToBoolean, z.boolean()),
	SZ: z.preprocess(checkboxValueToBoolean, z.boolean()),
	TC: z.preprocess(checkboxValueToBoolean, z.boolean()),
	RM: z.preprocess(checkboxValueToBoolean, z.boolean()),
	CB: z.preprocess(checkboxValueToBoolean, z.boolean()),
	private: z.preprocess(checkboxValueToDbBoolean, dbBoolean),
	"weapon[value]": z.preprocess(
		processMany(toArray, removeDuplicatesZod),
		z.array(weaponSplId).min(1).max(BUILD.MAX_WEAPONS_COUNT),
	),
	"HEAD[value]": z.preprocess(
		actualNumber,
		z
			.number()
			.optional()
			.refine(
				(val) =>
					val === undefined ||
					headGearIds.includes(val as (typeof headGearIds)[number]),
			),
	),
	"CLOTHES[value]": z.preprocess(
		actualNumber,
		z
			.number()
			.optional()
			.refine(
				(val) =>
					val === undefined ||
					clothesGearIds.includes(val as (typeof clothesGearIds)[number]),
			),
	),
	"SHOES[value]": z.preprocess(
		actualNumber,
		z
			.number()
			.optional()
			.refine(
				(val) =>
					val === undefined ||
					shoesGearIds.includes(val as (typeof shoesGearIds)[number]),
			),
	),
	abilities: z.preprocess(
		safeJSONParse,
		z.tuple([
			z.tuple([
				headMainSlotAbility,
				stackableAbility,
				stackableAbility,
				stackableAbility,
			]),
			z.tuple([
				clothesMainSlotAbility,
				stackableAbility,
				stackableAbility,
				stackableAbility,
			]),
			z.tuple([
				shoesMainSlotAbility,
				stackableAbility,
				stackableAbility,
				stackableAbility,
			]),
		]),
	),
});

function refreshCache({
	newWeaponSplIds,
	oldBuilds,
	buildToEditId,
}: {
	newWeaponSplIds: Array<MainWeaponId>;
	buildToEditId: Nullish<number>;
	oldBuilds: Array<{ id: number; weapons: BuildWeaponWithTop500Info[] }>;
}) {
	const oldBuildWeapons =
		oldBuilds.find((build) => build.id === buildToEditId)?.weapons ?? [];

	const allWeaponSplIds = [
		...newWeaponSplIds,
		...oldBuildWeapons.map(({ weaponSplId }) => weaponSplId),
	];

	const dedupedWeaponSplIds = removeDuplicates(allWeaponSplIds);

	refreshBuildsCacheByWeaponSplIds(dedupedWeaponSplIds);
}
