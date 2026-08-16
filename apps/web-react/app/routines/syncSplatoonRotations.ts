import * as SplatoonRotationRepository from "~/features/splatoon-rotations/SplatoonRotationRepository.server";
import { fetchRotations } from "~/features/splatoon-rotations/splatoon-rotations.server";
import { Routine } from "./routine.server";

export const SyncSplatoonRotationsRoutine = new Routine({
	name: "SyncSplatoonRotations",
	func: syncSplatoonRotations,
});

async function syncSplatoonRotations() {
	const rotations = await fetchRotations();
	await SplatoonRotationRepository.replaceAll(rotations);
}
