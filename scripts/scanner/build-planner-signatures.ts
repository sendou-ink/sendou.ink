/** biome-ignore-all lint/suspicious/noConsole: CLI script output */
/**
 * Build the planner signature atlas from the assets repo's planner renders.
 *
 * The sendou-ink/assets checkout's assets/planner-maps/ holds the full
 * planner PNGs (~340MB), named "<stageId>-<MODE>-<TYPE>.png" (MODE in
 * CB/RM/SZ/TC/TW; TYPE in OVER/MINI/ITEMS). This tool reduces each
 * PLANNER_TYPE render to the ink-invariant structural signature
 * (app/features/scanner/core/detectors/minimap/stage.ts) and packs all of them,
 * quantized to uint8, into a single grayscale atlas PNG plus a manifest
 * (keys "<stageId>-<MODE>") — a few hundred KB the minimap detector loads
 * to identify the stage. Output goes to the assets checkout
 * (SCANNER_ASSETS_DIR/planner); shipping a regen means pushing the assets repo.
 *
 *   pnpm scanner:build-planner-signatures
 */
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadOpenCV } from "../../app/features/scanner/core/cv";
import {
	PLANNER_SIG_H,
	PLANNER_SIG_W,
	type PlannerManifest,
	plannerSignature,
} from "../../app/features/scanner/core/detectors/minimap/stage";
import {
	type FrameData,
	normalizeFrame,
	toMat,
} from "../../app/features/scanner/core/image";
import { SCANNER_ASSETS_DIR } from "../../app/features/scanner/node/assets-dir";
import { readImage, writePng } from "../../app/features/scanner/node/image-io";

/** which render variant the signatures are built from */
const PLANNER_TYPE = process.env.SCANNER_PLANNER_TYPE ?? "MINI";
const SRC_DIR =
	process.env.SCANNER_PLANNER_MAPS_DIR ??
	new URL("../../../assets/assets/planner-maps", import.meta.url).pathname;
const OUT_DIR =
	process.env.SCANNER_PLANNER_OUT_DIR ?? join(SCANNER_ASSETS_DIR, "planner");
const COLS = 5;

await loadOpenCV();

const files = readdirSync(SRC_DIR)
	.filter((f) => f.endsWith(`-${PLANNER_TYPE}.png`))
	.sort((a, b) => {
		const [sa, ma] = a.split("-");
		const [sb, mb] = b.split("-");
		return Number(sa) - Number(sb) || ma!.localeCompare(mb!);
	});
if (files.length === 0) {
	throw new Error(`no ${PLANNER_TYPE} planner PNGs in ${SRC_DIR}`);
}

const rows = Math.ceil(files.length / COLS);
const atlasW = COLS * PLANNER_SIG_W;
const atlasH = rows * PLANNER_SIG_H;
const atlas: FrameData = {
	width: atlasW,
	height: atlasH,
	data: new Uint8ClampedArray(atlasW * atlasH * 4),
};
const keys: string[] = [];

for (let i = 0; i < files.length; i++) {
	const file = files[i]!;
	const key = file.replace(`-${PLANNER_TYPE}.png`, "");
	keys.push(key);

	const img = toMat(await readImage(join(SRC_DIR, file)));
	const norm = normalizeFrame(img);
	const sig = plannerSignature(norm);
	img.delete();
	norm.delete();

	// quantize to uint8 (load re-normalizes to unit L2, so the scale is free)
	let max = 0;
	for (const v of sig) if (v > max) max = v;
	const scale = max > 0 ? 255 / max : 0;

	const tx = (i % COLS) * PLANNER_SIG_W;
	const ty = Math.floor(i / COLS) * PLANNER_SIG_H;
	for (let y = 0; y < PLANNER_SIG_H; y++) {
		for (let x = 0; x < PLANNER_SIG_W; x++) {
			const v = Math.round(sig[y * PLANNER_SIG_W + x]! * scale);
			const o = ((ty + y) * atlasW + (tx + x)) * 4;
			atlas.data[o] = v;
			atlas.data[o + 1] = v;
			atlas.data[o + 2] = v;
			atlas.data[o + 3] = 255;
		}
	}
}

mkdirSync(OUT_DIR, { recursive: true });
writePng(join(OUT_DIR, "signatures.png"), atlas);
const manifest: PlannerManifest = {
	width: PLANNER_SIG_W,
	height: PLANNER_SIG_H,
	cols: COLS,
	keys,
};
writeFileSync(
	join(OUT_DIR, "manifest.json"),
	`${JSON.stringify(manifest, null, 2)}\n`,
);

console.info(
	`packed ${files.length} signatures into ${atlasW}x${atlasH} atlas -> ${OUT_DIR}`,
);
