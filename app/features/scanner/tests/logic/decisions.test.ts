import { afterEach, describe, expect, test } from "vitest";
import * as Decisions from "../../core/decisions";

afterEach(() => {
	Decisions.setRecorder(null);
});

describe("Decisions.atLeast / above / atMost / below", () => {
	test.each([
		{
			why: "atLeast at the threshold",
			fn: Decisions.atLeast,
			value: 5,
			want: true,
		},
		{ why: "atLeast under it", fn: Decisions.atLeast, value: 4, want: false },
		{
			why: "above at the threshold",
			fn: Decisions.above,
			value: 5,
			want: false,
		},
		{ why: "above over it", fn: Decisions.above, value: 6, want: true },
		{
			why: "atMost at the threshold",
			fn: Decisions.atMost,
			value: 5,
			want: true,
		},
		{ why: "atMost over it", fn: Decisions.atMost, value: 6, want: false },
		{
			why: "below at the threshold",
			fn: Decisions.below,
			value: 5,
			want: false,
		},
		{ why: "below under it", fn: Decisions.below, value: 4, want: true },
		{
			why: "NaN never passes",
			fn: Decisions.atMost,
			value: Number.NaN,
			want: false,
		},
	])("$why", ({ fn, value, want }) => {
		expect(fn("id", value, 5)).toBe(want);
	});
});

describe("Decisions.setRecorder", () => {
	test("records the value, threshold, operator and outcome of each decision", () => {
		const samples: Decisions.DecisionSample[] = [];
		Decisions.setRecorder((sample) => samples.push(sample));

		Decisions.atLeast("gate:MIN", 0.7, 0.6);
		Decisions.below("gate:MAX", 80, 60);

		expect(samples).toEqual([
			{ id: "gate:MIN", value: 0.7, threshold: 0.6, op: ">=", passed: true },
			{ id: "gate:MAX", value: 80, threshold: 60, op: "<", passed: false },
		]);
	});

	test("stops recording when set to null", () => {
		const samples: Decisions.DecisionSample[] = [];
		Decisions.setRecorder((sample) => samples.push(sample));
		Decisions.setRecorder(null);

		Decisions.atLeast("gate:MIN", 0.7, 0.6);

		expect(samples).toEqual([]);
	});
});

describe("Decisions.margins", () => {
	const sample = (
		id: string,
		value: number,
		threshold: number,
		source: string,
	) => ({
		id,
		value,
		threshold,
		op: ">=" as const,
		passed: value >= threshold,
		source,
	});

	test("finds the nearest sample on each side of the threshold", () => {
		const [margin] = Decisions.margins([
			sample("a", 0.9, 0.6, "far-pass"),
			sample("a", 0.65, 0.6, "near-pass"),
			sample("a", 0.2, 0.6, "far-fail"),
			sample("a", 0.5, 0.6, "near-fail"),
		]);

		expect(margin).toMatchObject({
			id: "a",
			threshold: 0.6,
			passed: { count: 2, nearest: { value: 0.65, source: "near-pass" } },
			failed: { count: 2, nearest: { value: 0.5, source: "near-fail" } },
		});
		expect(margin!.margin).toBeCloseTo(0.05);
		expect(margin!.relativeMargin).toBeCloseTo(0.05 / 0.7);
	});

	test("sorts the smallest margin relative to the observed span first", () => {
		const result = Decisions.margins([
			sample("brightness", 70, 60, "x"),
			sample("brightness", 200, 60, "x"),
			sample("score", 0.61, 0.6, "x"),
			sample("score", 0.2, 0.6, "x"),
			sample("roomy", 0.9, 0.5, "x"),
			sample("roomy", 0.1, 0.5, "x"),
		]);

		expect(result.map((m) => m.id)).toEqual(["score", "brightness", "roomy"]);
	});

	test("leaves a side without samples empty", () => {
		const [margin] = Decisions.margins([sample("a", 0.9, 0.6, "only")]);

		expect(margin!.failed).toEqual({ count: 0, nearest: null });
		expect(margin!.margin).toBeCloseTo(0.3);
	});

	test("reports a threshold that varies between reads as null", () => {
		const [margin] = Decisions.margins([
			sample("a", 3, 2, "x"),
			sample("a", 3, 2.5, "y"),
		]);

		expect(margin!.threshold).toBeNull();
		expect(margin!.passed.nearest).toMatchObject({ margin: 0.5, source: "y" });
	});

	test.each([
		{ why: "a NaN value", value: Number.NaN, threshold: 0.6 },
		{
			why: "an infinite value",
			value: Number.POSITIVE_INFINITY,
			threshold: 0.6,
		},
		{ why: "a NaN threshold", value: 0.7, threshold: Number.NaN },
		{
			why: "an infinite threshold",
			value: 0.7,
			threshold: Number.NEGATIVE_INFINITY,
		},
	])("leaves $why out of its id's margins", ({ value, threshold }) => {
		const finite = [
			sample("a", 0.9, 0.6, "pass"),
			sample("a", 0.5, 0.6, "fail"),
		];

		expect(
			Decisions.margins([...finite, sample("a", value, threshold, "odd")]),
		).toEqual(Decisions.margins(finite));
		expect(Decisions.margins([sample("b", value, threshold, "odd")])).toEqual(
			[],
		);
	});

	test("gives a lone sample on its threshold a zero relative margin", () => {
		const [margin] = Decisions.margins([sample("a", 5, 5, "x")]);

		expect(margin).toMatchObject({ margin: 0, relativeMargin: 0 });
	});

	test("breaks a relative margin tie by the absolute margin", () => {
		const result = Decisions.margins([
			sample("wide", 2, 0, "x"),
			sample("narrow", 1, 0, "x"),
		]);

		expect(result.map((m) => m.relativeMargin)).toEqual([1, 1]);
		expect(result.map((m) => m.id)).toEqual(["narrow", "wide"]);
	});
});
