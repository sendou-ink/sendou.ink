/**
 * A game's bundle for reporting a misread: the match as built, its source
 * events, and every stored analyzed frame as a fixture-ready folder
 * (`frames/<n>-<type>-<position>/` holding the frame and a prefilled
 * expected.json).
 */
import { strToU8, type Zippable, zipSync } from "fflate";
import type { BuiltMatch } from "../core/match-builder";
import { buildExpectedJson, type FixtureData } from "./fixture-export";
import type { GetFrame, ScanEvent } from "./session-data";

const FRAME_EXTENSIONS: Record<string, string> = {
	"image/webp": "webp",
	"image/png": "png",
	"image/jpeg": "jpg",
};

export async function matchZip(
	built: BuiltMatch<ScanEvent>,
	getFrame: (event: ScanEvent) => GetFrame | undefined,
): Promise<Uint8Array> {
	const originT = built.sources[0]?.t ?? 0;
	const files: Zippable = {};
	const events = await Promise.all(
		built.sources.map(async (event, index) => {
			const frame = await getFrame(event)?.();
			let folder: string | undefined;
			if (frame) {
				folder = `frames/${String(index + 1).padStart(3, "0")}-${event.type}-${position(event.t - originT)}`;
				const extension = FRAME_EXTENSIONS[frame.type] ?? "bin";
				files[`${folder}/frame.${extension}`] = [
					new Uint8Array(await frame.arrayBuffer()),
					{ level: 0 },
				];
				files[`${folder}/expected.json`] = strToU8(
					buildExpectedJson(event.data as FixtureData, event.type),
				);
			}
			return {
				type: event.type,
				t: event.t,
				detectedAt: event.detectedAt,
				confidence: event.confidence,
				data: event.data,
				frame: folder,
			};
		}),
	);
	files["match.json"] = strToU8(JSON.stringify(built.match, null, 2));
	files["events.json"] = strToU8(JSON.stringify(events, null, 2));

	return zipSync(files);
}

/** seconds into the game as `1m42s`, sortable at a glance in a file list */
function position(seconds: number): string {
	const total = Math.max(0, Math.floor(seconds));
	return `${Math.floor(total / 60)}m${String(total % 60).padStart(2, "0")}s`;
}
