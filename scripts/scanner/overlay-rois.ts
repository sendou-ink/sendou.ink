/** biome-ignore-all lint/suspicious/noConsole: CLI script output */
/**
 * Draw all scoreboard ROIs on a (normalized) frame for visual calibration.
 * Usage: vite-node -c scripts/scanner/vite-node.config.ts scripts/scanner/overlay-rois.ts <image> [out.png] [scoreboard|scoreboard-battle-log-replay|scoreboard-battle-log]
 */
import { loadOpenCV, type Mat } from "../../app/features/scanner/core/cv";
import * as death from "../../app/features/scanner/core/detectors/death/rois";
import * as mapStart from "../../app/features/scanner/core/detectors/map-start/rois";
import * as minimap from "../../app/features/scanner/core/detectors/minimap/rois";
import * as sb from "../../app/features/scanner/core/detectors/scoreboard/rois";
import * as bl from "../../app/features/scanner/core/detectors/scoreboard-battle-log/rois";
import * as replay from "../../app/features/scanner/core/detectors/scoreboard-battle-log-replay/rois";
import {
	matToFrameData,
	normalizeFrame,
	type Roi,
	toMat,
} from "../../app/features/scanner/core/image";
import { readImage, writePng } from "../../app/features/scanner/node/image-io";

const [imagePath, outPath = "roi-overlay.png", detector = "scoreboard"] =
	process.argv.slice(2);
if (!imagePath) {
	console.error(
		"usage: vite-node -c scripts/scanner/vite-node.config.ts scripts/scanner/overlay-rois.ts <image> [out.png] [scoreboard|scoreboard-battle-log-replay|scoreboard-battle-log|death|map-start|minimap]",
	);
	process.exit(1);
}

const cv = await loadOpenCV();
const src = toMat(await readImage(imagePath));
const frame = normalizeFrame(src);
src.delete();

function rect(m: Mat, roi: Roi, color: [number, number, number]) {
	cv.rectangle(
		m,
		new cv.Point(roi.x, roi.y),
		new cv.Point(roi.x + roi.w, roi.y + roi.h),
		new cv.Scalar(...color, 255),
		1,
	);
}

if (detector === "scoreboard") {
	for (const cy of sb.ROW_CENTERS) {
		rect(frame, sb.weaponRoi(cy), [255, 0, 0]);
		rect(frame, sb.nameRoi(cy), [0, 255, 0]);
		rect(frame, sb.paintRoi(cy), [0, 128, 255]);
		for (const i of [0, 1, 2] as const)
			rect(frame, sb.statRoi(cy, i), [255, 0, 255]);
		rect(frame, sb.gateDarkProbe(cy), [255, 255, 0]);
	}
	for (const roi of sb.TEAM_SCORE_ROIS) rect(frame, roi, [0, 128, 255]);
	for (const roi of sb.GATE_PANEL_PROBES) rect(frame, roi, [255, 255, 0]);
} else if (detector === "scoreboard-battle-log-replay") {
	for (const dx of replay.PANEL_XS) {
		for (const cy of replay.ROW_CENTERS) {
			rect(frame, replay.weaponRoi(cy, dx), [255, 0, 0]);
			rect(frame, replay.nameRoi(cy, dx), [0, 255, 0]);
			rect(frame, replay.paintRoi(cy, dx), [0, 128, 255]);
			rect(frame, replay.paintSuffixRoi(cy, dx), [0, 255, 255]);
			for (const i of [0, 1, 2] as const)
				rect(frame, replay.statRoi(cy, dx, i), [255, 0, 255]);
			rect(frame, replay.gateFlatProbe(cy, dx), [255, 255, 0]);
		}
		rect(frame, replay.teamScoreRoi(dx), [0, 128, 255]);
		rect(frame, replay.resultTagRoi(dx), [255, 128, 0]);
	}
	for (const roi of replay.MATCH_SCORE_ROIS) rect(frame, roi, [0, 128, 255]);
	for (const roi of replay.GATE_GAP_PROBES) rect(frame, roi, [255, 255, 0]);
	rect(frame, replay.HEADER_TOP_BAND, [0, 255, 0]);
	rect(frame, replay.HEADER_BOTTOM_BAND, [0, 255, 0]);
	rect(frame, replay.REPLAY_CODE_ROI, [0, 255, 0]);
} else if (detector === "scoreboard-battle-log") {
	for (const dy of bl.PANEL_DYS) {
		for (const base of bl.ROW_CENTERS) {
			const cy = base + dy;
			rect(frame, bl.weaponRoi(cy), [255, 0, 0]);
			rect(frame, bl.nameRoi(cy), [0, 255, 0]);
			rect(frame, bl.paintRoi(cy), [0, 128, 255]);
			rect(frame, bl.paintSuffixRoi(cy), [0, 255, 255]);
			for (const i of [0, 1, 2] as const)
				rect(frame, bl.statRoi(cy, i), [255, 0, 255]);
			rect(frame, bl.gateDarkProbe(cy), [255, 255, 0]);
			rect(frame, bl.povArrowRoi(cy), [255, 128, 0]);
			rect(frame, bl.specialIconRoi(cy), [255, 0, 0]);
		}
		rect(frame, bl.teamScoreRoi(dy), [0, 128, 255]);
		rect(frame, bl.resultTagRoi(dy), [255, 128, 0]);
	}
	for (const roi of bl.MATCH_SCORE_ROIS) rect(frame, roi, [0, 128, 255]);
	for (const roi of bl.GATE_COLOR_PROBES) rect(frame, roi, [255, 255, 0]);
	rect(frame, bl.HEADER_TOP_BAND, [0, 255, 0]);
	rect(frame, bl.HEADER_BOTTOM_BAND, [0, 255, 0]);
} else if (detector === "death") {
	rect(frame, death.SPLAT_LINE1_ROI, [0, 255, 0]);
	rect(frame, death.WEAPON_LINE_ROI, [255, 0, 0]);
	for (let row = 0; row < death.ABILITY_ROWS; row++) {
		rect(frame, death.abilityMainRoi(row), [0, 128, 255]);
		for (const slot of [0, 1, 2])
			rect(frame, death.abilitySubRoi(row, slot), [255, 0, 255]);
	}
	rect(frame, death.TAG_NAME_OUTER, [0, 255, 0]);
	for (const roi of [...death.GATE_BURST_PROBES, ...death.GATE_PANEL_PROBES]) {
		rect(frame, roi, [255, 255, 0]);
	}
} else if (detector === "map-start") {
	rect(frame, mapStart.MODE_LABEL_ROI, [0, 255, 0]);
	rect(frame, mapStart.MODE_BLOCK_ROI, [255, 0, 0]);
	rect(frame, mapStart.STAGE_ROI, [0, 128, 255]);
	rect(frame, mapStart.GATE_INK_BAND, [0, 255, 255]);
	for (const roi of mapStart.GATE_DARK_PROBES) rect(frame, roi, [255, 255, 0]);
} else if (detector === "minimap") {
	for (const card of minimap.CARD_LAYOUTS) {
		rect(frame, card.name, [0, 255, 0]);
		rect(frame, card.weapon, [255, 0, 0]);
		rect(frame, card.subTile, [0, 255, 255]);
		for (const [cx, cy] of card.badges)
			rect(frame, minimap.badgeRoi(cx, cy), [0, 128, 255]);
		rect(frame, card.cross, [255, 0, 255]);
	}
	for (const cy of minimap.ENEMY_ROW_CYS) {
		rect(frame, minimap.enemyWeaponRoi(cy), [255, 0, 0]);
		rect(frame, minimap.enemySubTileRoi(cy), [0, 255, 255]);
		for (const cx of minimap.ENEMY_BADGE_XS)
			rect(frame, minimap.badgeRoi(cx, cy), [0, 128, 255]);
		rect(frame, minimap.enemyCrossRoi(cy), [255, 0, 255]);
	}
	for (const roi of [
		...minimap.GATE_CLOSE_X_BRIGHT,
		...minimap.GATE_CLOSE_X_DARK,
		minimap.GATE_SPAWN_BRIGHT,
		...minimap.GATE_CLOSE_DARK_PROBES,
		...minimap.GATE_SPAWN_DARK_PROBES,
	]) {
		rect(frame, roi, [255, 255, 0]);
	}
} else {
	console.error(`unknown detector "${detector}"`);
	process.exit(1);
}

writePng(outPath, matToFrameData(frame));
frame.delete();
console.info(`wrote ${outPath}`);
