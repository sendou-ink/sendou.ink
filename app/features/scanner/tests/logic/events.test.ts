import { describe, expect, test } from "vitest";
import {
	detectionOf,
	isEventOfType,
	isHistoryScoreboardEvent,
	isScoreboardEvent,
	isXBattleCardEvent,
	kindOf,
} from "../../core/events";
import { stubEvent } from "../stub-event";

const read = (type: Parameters<typeof stubEvent>[0]["type"]) =>
	stubEvent({ type, t: 1, confidence: 0.9, data: {} });

describe("kindOf", () => {
	test.each([
		{ type: "MapStart", match: "opens" },
		{ type: "Scoreboard", match: "closes" },
		{ type: "ScoreboardBattleLogReplay", match: "closes" },
		{ type: "ScoreboardBattleLog", match: "closes" },
		{ type: "QuickScoreboardBattleLog", match: "closes" },
		{ type: "ScoreboardOwn", match: undefined },
		{ type: "Objective", match: undefined },
	])("$type: match role $match", ({ type, match }) => {
		expect(kindOf(type)?.match).toBe(match);
	});

	test("returns undefined for an unknown type", () => {
		expect(kindOf("Nope")).toBeUndefined();
	});
});

describe("event type guards", () => {
	test.each([
		{ type: "Scoreboard", scoreboard: true, history: false, card: false },
		{
			type: "ScoreboardBattleLogReplay",
			scoreboard: true,
			history: true,
			card: false,
		},
		{
			type: "QuickScoreboardBattleLog",
			scoreboard: true,
			history: true,
			card: false,
		},
		{ type: "ScoreboardOwn", scoreboard: false, history: false, card: false },
		{ type: "XSetResult", scoreboard: false, history: false, card: true },
	] as const)("$type", ({ type, scoreboard, history, card }) => {
		const event = read(type);

		expect(isScoreboardEvent(event)).toBe(scoreboard);
		expect(isHistoryScoreboardEvent(event)).toBe(history);
		expect(isXBattleCardEvent(event)).toBe(card);
		expect(isEventOfType(event, type)).toBe(true);
		expect(isEventOfType(event, "Death")).toBe(false);
	});
});

describe("detectionOf", () => {
	test("keeps the detection and drops what the record carries beside it", () => {
		const record = stubEvent({
			id: 7,
			type: "Death",
			t: 12,
			confidence: 0.8,
			data: { name: "a" },
			debug: { raw: "a" },
		});

		expect(detectionOf(record)).toEqual({
			type: "Death",
			t: 12,
			confidence: 0.8,
			data: { name: "a" },
		});
	});
});
