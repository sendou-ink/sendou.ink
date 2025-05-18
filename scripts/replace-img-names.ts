import fs from "node:fs";
import path from "node:path";
import invariant from "~/utils/invariant";

import { fileURLToPath } from "node:url";
import { logger } from "~/utils/logger";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GEAR_IMAGES_DIR_PATH = path.join(
	__dirname,
	"..",
	"public",
	"static-assets",
	"img",
	"gear",
);
const GEAR_JSON_PATH = path.join(__dirname, "output", "gear.json");

async function main() {
	const gear = JSON.parse(fs.readFileSync(GEAR_JSON_PATH, "utf8"));
	for (const gearSlot of ["head", "clothes", "shoes"] as const) {
		const gearSlotDirPath = path.join(GEAR_IMAGES_DIR_PATH, gearSlot);
		const files = await fs.promises.readdir(gearSlotDirPath);

		const type =
			gearSlot === "head" ? "Hed" : gearSlot === "shoes" ? "Shs" : "Clt";

		for (const file of files) {
			// did we already replace the name
			if (
				!file.startsWith("Shs") &&
				!file.startsWith("Clt") &&
				!file.startsWith("Hed")
			) {
				continue;
			}

			if (file.endsWith(".webp")) {
				fs.unlinkSync(path.join(gearSlotDirPath, file));
				continue;
			}

			const internalName = file.replace(".png", "").split("_")[1];
			invariant(internalName);

			const gearId = gear.find(
				(g: any) => g.internalName === internalName && g.type === type,
			)?.id;

			if (typeof gearId !== "number") {
				fs.unlinkSync(path.join(gearSlotDirPath, file));
				continue;
			}

			fs.renameSync(
				path.join(gearSlotDirPath, file),
				path.join(gearSlotDirPath, `${gearId}.png`),
			);
		}
	}

	logger.info("done with all");
}

void main();
