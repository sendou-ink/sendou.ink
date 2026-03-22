/** biome-ignore-all lint/suspicious/noConsole: CLI script */
import "dotenv/config";
import * as SplatoonRotationRepository from "~/features/splatoon-rotations/SplatoonRotationRepository.server";
import { fetchRotations } from "~/features/splatoon-rotations/splatoon-rotations.server";

async function main() {
	console.log("Fetching splatoon rotations from splatoon3.ink...");

	const rotations = await fetchRotations();
	console.log(`Fetched ${rotations.length} rotations`);

	await SplatoonRotationRepository.replaceAll(rotations);
	console.log("Rotations synced to database");
}

main().catch((err) => {
	console.error("Failed to sync rotations:", err);
	process.exit(1);
});
