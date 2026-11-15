/**
 * createDecodeOrder over synthetic packet sequences: H.264/HEVC packets in
 * decode order (I0 P3 B1 B2 ...), samples handed on in presentation order,
 * skipped ones held until the decoder has emitted a later sample, and the
 * check plan judged in presentation order.
 */
import { describe, expect, test } from "vitest";
import {
	createDecodeOrder,
	type DecodeOrderEntry,
} from "../../core/decode-order";
import type { CheckPlan } from "../../core/detectors/check-plan";

/** Checks one detector every 3 s, last checked at 0. */
const EVERY_3S: CheckPlan = {
	t: 0,
	detectors: [{ lastCheckT: 0, next: [3], later: [3] }],
};

describe("createDecodeOrder", () => {
	test("hands on a skipped sample only once the decoder has emitted a later one", () => {
		const order = reordering();
		feed(order, [
			[0, "decode"],
			[3, "decode"],
			[1, "skip"],
			[2, "skip"],
		]);

		settle(order, 0);
		expect(drain(order)).toEqual([0]);

		settle(order, 3);
		expect(drain(order)).toEqual([1, 2, 3]);
	});

	test("hands on every sample in presentation order", () => {
		const order = reordering();
		const decodeOrder = [0, 3, 1, 2, 6, 4, 5, 9, 7, 8, 12, 10, 11];
		const references = new Set([0, 3, 6, 9, 12]);
		const delivered: number[] = [];
		// a decoder holding one frame back for reordering
		const held: number[] = [];
		for (const t of decodeOrder) {
			const skipped = !references.has(t);
			order.admit(t);
			order.add(entry(t, { skipped }));
			if (!skipped) {
				held.push(t);
				held.sort((a, b) => a - b);
				if (held.length > 1) settle(order, held.shift()!);
			}
			delivered.push(...drain(order));
		}
		for (const t of held) settle(order, t);
		delivered.push(...drain(order, true));

		expect(delivered).toEqual([...decodeOrder].sort((a, b) => a - b));
	});

	test("without reordering a skipped sample goes at once", () => {
		const order = createDecodeOrder<DecodeOrderEntry>({
			perPacket: true,
			reorders: false,
			firstT: 0,
		});
		feed(order, [
			[0, "decode"],
			[1, "skip"],
		]);
		settle(order, 0);

		expect(drain(order)).toEqual([0, 1]);
	});

	test("hands on held samples when draining after a flush", () => {
		const order = reordering();
		feed(order, [
			[0, "decode"],
			[1, "skip"],
		]);
		settle(order, 0);

		expect(drain(order)).toEqual([0]);
		expect(drain(order, true)).toEqual([1]);
	});

	test("judges the plan in presentation order", () => {
		const order = reordering();
		feed(order, [[0, "decode"]]);
		settle(order, 0);
		drain(order);
		order.admit(3);
		order.add(entry(3));
		order.admit(1);

		expect(order.wanted(1, EVERY_3S)).toBe(false);
		order.admit(2);
		expect(order.wanted(2, EVERY_3S)).toBe(false);
		expect(order.wanted(3, EVERY_3S)).toBe(true);
	});

	test("a packet presented before a judged sample turns the plan off", () => {
		const order = judgedThrough2();
		order.admit(1.5);

		expect(order.wanted(2.5, EVERY_3S)).toBe(true);
	});

	test("fails when the plan already let a later sample go undecoded", () => {
		const order = judgedThrough2();
		order.add(entry(2, { skipped: true, byPlan: true }));

		expect(() => order.admit(1.5)).toThrow(/plan let a later sample/);
	});

	test("forgets a sample the decoder never emits and stops consulting the plan", () => {
		const order = reordering();
		feed(order, [
			[0, "decode"],
			[1, "decode"],
			[2, "decode"],
		]);
		settle(order, 0);
		settle(order, 2);

		expect(drain(order)).toEqual([0, 2]);
		expect(order.wanted(2.5, EVERY_3S)).toBe(true);
	});

	test("a sample forgotten before the first one keeps the plan", () => {
		const order = createDecodeOrder<DecodeOrderEntry>({
			perPacket: true,
			reorders: true,
			firstT: 1,
		});
		feed(order, [
			[0, "decode"],
			[1, "decode"],
		]);
		settle(order, 1);
		drain(order);
		order.admit(2);

		expect(order.wanted(2, { ...EVERY_3S, t: 1 })).toBe(false);
	});

	test("an emitted sample that is not the next one decoding has no entry", () => {
		const order = reordering();
		feed(order, [[3, "decode"]]);

		expect(order.emitted(1)).toBeNull();
	});
});

function reordering() {
	return createDecodeOrder<DecodeOrderEntry>({
		perPacket: true,
		reorders: true,
		firstT: 0,
	});
}

/** A stream whose plan has judged every sample through 2 (0 handed on, 1 and 2 fed). */
function judgedThrough2() {
	const order = reordering();
	feed(order, [[0, "decode"]]);
	settle(order, 0);
	drain(order);
	order.admit(1);
	order.admit(2);
	order.wanted(2, EVERY_3S);
	return order;
}

function entry(
	t: number,
	{ skipped = false, byPlan = false } = {},
): DecodeOrderEntry {
	return { t, state: skipped ? "ready" : "decoding", skipped, byPlan };
}

function feed(
	order: ReturnType<typeof reordering>,
	packets: [number, "decode" | "skip"][],
) {
	for (const [t, kind] of packets) {
		order.admit(t);
		order.add(entry(t, { skipped: kind === "skip" }));
	}
}

/** The decoder emits the sample at `t`. */
function settle(order: ReturnType<typeof reordering>, t: number) {
	const emitted = order.emitted(t);
	if (!emitted) throw new Error(`no entry for ${t}`);
	emitted.state = "ready";
}

function drain(order: ReturnType<typeof reordering>, draining = false) {
	const out: number[] = [];
	for (let e = order.next(draining); e; e = order.next(draining)) {
		out.push(e.t);
	}
	return out;
}
