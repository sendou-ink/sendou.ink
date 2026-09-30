import type { TablesInsertable } from "~/db/tables";
import * as SplatoonRotationRepository from "~/features/splatoon-rotations/SplatoonRotationRepository.server";
import { rankedModesShort } from "~/modules/in-game-lists/modes";
import { stageIds } from "~/modules/in-game-lists/stage-ids";
import { faker } from "../core/faker";

type Rotation = Omit<TablesInsertable["SplatoonRotation"], "id">;

const ROTATION_TYPES = ["SERIES", "OPEN", "X"] as const;
const ROTATIONS_PER_TYPE = 12;
const TWO_HOURS = 2 * 60 * 60;

/** Schedule starting from the current two-hour slot, same write as the rotation sync routine. */
export function replaceAll() {
	const nowUnix = Math.floor(Date.now() / 1000);
	const currentSlotStartsAt = nowUnix - (nowUnix % TWO_HOURS);

	const rotations: Rotation[] = ROTATION_TYPES.flatMap((type) =>
		Array.from({ length: ROTATIONS_PER_TYPE }, (_, slot) => {
			const [stageId1, stageId2] = faker.helpers.arrayElements(stageIds, 2);

			return {
				type,
				mode: faker.helpers.arrayElement(rankedModesShort),
				stageId1,
				stageId2,
				startsAt: currentSlotStartsAt + slot * TWO_HOURS,
				endsAt: currentSlotStartsAt + (slot + 1) * TWO_HOURS,
			};
		}),
	);

	return SplatoonRotationRepository.replaceAll(rotations);
}
