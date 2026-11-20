import { describe, expect, test } from "vitest";
import { runDetectorPass } from "../../core/detectors/frame-pass";
import { DetectorScheduler } from "../../core/detectors/scheduler";
import type { Detector } from "../../core/detectors/types";
import type { DetectedEvent } from "../../core/events";
import * as GateRois from "../../core/gate-rois";
import { createImage, type Image } from "../../core/image";
import { done } from "../../core/match-steps";
import { TimelineBuilder } from "../../core/timeline/index";
import { stubEvent } from "../stub-event";

describe("GateRois.spansOf", () => {
	test("covers overlapping ROIs once, row by row", () => {
		const spans = GateRois.spansOf([
			{ x: 10, y: 5, w: 4, h: 2 },
			{ x: 12, y: 6, w: 4, h: 2 },
		]);

		expect([...spans]).toEqual([5, 10, 4, 6, 10, 6, 7, 12, 4]);
		expect(GateRois.pixelCount(spans)).toBe(14);
	});

	test("clips ROIs to the canonical frame", () => {
		const spans = GateRois.spansOf([{ x: 1918, y: 1079, w: 10, h: 10 }]);

		expect([...spans]).toEqual([1079, 1918, 2]);
	});
});

describe("GateRois.scatter", () => {
	test("puts gathered pixels back where they were, leaving the rest", () => {
		const spans = GateRois.spansOf([
			{ x: 3, y: 2, w: 5, h: 3 },
			{ x: 100, y: 500, w: 2, h: 1 },
		]);
		const frame = createImage(1080, 1920, 4);
		for (let i = 0; i < frame.data.length; i++) frame.data[i] = i % 251;
		const target = createImage(1080, 1920, 4);

		GateRois.scatter(spans, GateRois.gather(spans, frame), target);

		const at = (image: Image, x: number, y: number) =>
			image.data[(y * 1920 + x) * 4];
		expect(at(target, 4, 3)).toBe(at(frame, 4, 3));
		expect(at(target, 101, 500)).toBe(at(frame, 101, 500));
		expect(at(target, 8, 3)).toBe(0);
	});
});

describe("runDetectorPass", () => {
	const GATE_ONLY = { lit: true, whole: false } as unknown as Image;
	const DARK_GATE_ONLY = { lit: false, whole: false } as unknown as Image;
	const WHOLE = { lit: true, whole: true } as unknown as Image;

	function detector(id: string, seen: string[]): Detector<DetectedEvent> {
		const parse = (frame: Image, t: number) => {
			seen.push(`${id} parse ${describeFrame(frame)}`);
			return [
				stubEvent({
					type: "Kill",
					t,
					scores: { "names.0": 0.9 },
					data: { time: 100, names: [id] },
				}),
			];
		};
		return {
			id,
			gateRois: [],
			gate: (frame) => {
				seen.push(`${id} gate ${describeFrame(frame)}`);
				return { pass: (frame as unknown as { lit: boolean }).lit, score: 1 };
			},
			parse,
			parseSteps: (frame, t) => done(parse(frame, t)),
		};
	}

	async function pass(frame: Image) {
		const seen: string[] = [];
		const detectors = [detector("a", seen), detector("b", seen)];
		let fetched = 0;
		await runDetectorPass({
			frame,
			t: 0,
			detectors,
			due: ["a", "b"],
			scheduler: new DetectorScheduler(detectors),
			timeline: new TimelineBuilder(),
			telemetry: null,
			wholeFrame: async () => {
				fetched++;
				return WHOLE;
			},
		});
		return { seen, fetched };
	}

	test("swaps a gate-only frame for the whole one at the first gate passing on it", async () => {
		const { seen, fetched } = await pass(GATE_ONLY);

		expect(fetched).toBe(1);
		expect(seen).toEqual([
			"a gate gates",
			"a gate whole",
			"b gate whole",
			"a parse whole",
			"b parse whole",
		]);
	});

	test("leaves the whole frame unfetched when every gate fails", async () => {
		const { seen, fetched } = await pass(DARK_GATE_ONLY);

		expect(fetched).toBe(0);
		expect(seen).toEqual(["a gate gates", "b gate gates"]);
	});

	function describeFrame(frame: Image) {
		return (frame as unknown as { whole: boolean }).whole ? "whole" : "gates";
	}
});

describe("DetectorScheduler.expectsGatePass", () => {
	function checkedScheduler() {
		const checked = new DetectorScheduler([{ id: "d" }], {
			refineIntervalS: 0.1,
			searchIntervalS: 0.5,
		});
		checked.dueDetectors(0);
		return checked;
	}

	test("expects a pass when a detector due then passed its last gate", () => {
		const passing = checkedScheduler();
		passing.recordGate("d", 0, true);

		expect(passing.expectsGatePass(0.1)).toBe(true);
	});

	test("expects no pass before the passing detector is due again", () => {
		const passing = checkedScheduler();
		passing.recordGate("d", 0, true);

		expect(passing.expectsGatePass(0.05)).toBe(false);
	});

	test("expects no pass when the last gate failed", () => {
		const failing = checkedScheduler();
		failing.recordGate("d", 0, false);

		expect(failing.expectsGatePass(0.5)).toBe(false);
	});
});
