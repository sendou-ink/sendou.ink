import { describe, expect, test } from "vitest";
import {
	mapPoolToSerializedString,
	serializedStringToMapPool,
} from "./serializer";
import type { MapPoolObject } from "./types";

const testSerializedPool =
	"tw:3330000;sz:3a14000;tc:2c98000;rm:2bc0000;cb:39c0000";

describe("Map pool serializer", () => {
	test("Unserializes and then serializes to same result", () => {
		const mapPool = serializedStringToMapPool(testSerializedPool);

		expect(mapPoolToSerializedString(mapPool)).toEqual(testSerializedPool);
	});

	test("Ignores invalid mode key", () => {
		const testSerializedPoolWithInvalidMode = `${testSerializedPool};ab:1ce0`;
		const mapPool = serializedStringToMapPool(
			testSerializedPoolWithInvalidMode,
		);

		expect(mapPoolToSerializedString(mapPool)).toEqual(testSerializedPool);
	});

	test("Matching serialization with IPLMapGen2", () => {
		const testMapPool: MapPoolObject = {
			// Gorge, Spillway, Mincemeat, Mahi-Mahi, Inkblot
			TW: [0, 3, 4, 7, 8],
			// Gorge, Eeltail, Spillway, Inkblot, MakoMart
			SZ: [0, 1, 3, 8, 10],
			// Eeltail, Hagglefish, Bridge, Inbklot, Sturgeon
			TC: [1, 2, 5, 8, 9],
			// Eeltail, Spillway, Mincemeat, Bridge, Museum
			RM: [1, 3, 4, 5, 6],
			// Gorge, Eeltail, Mincemeat, Bridge, Museum
			CB: [0, 1, 4, 5, 6],
		};

		expect(mapPoolToSerializedString(testMapPool)).toEqual(testSerializedPool);
	});

	test("Omits key if mode has no maps", () => {
		const testPoolWithoutTw: MapPoolObject = {
			CB: [1, 2],
			RM: [1, 8],
			TC: [8, 4],
			SZ: [10],
			TW: [],
		};

		const serialized = mapPoolToSerializedString(testPoolWithoutTw);

		expect(
			serialized.includes("sz") && !serialized.includes("tw"),
		).toBeTruthy();
	});

	test("Returns empty string if no maps", () => {
		const testPoolWithoutTw: MapPoolObject = {
			CB: [],
			RM: [],
			TC: [],
			SZ: [],
			TW: [],
		};

		const serialized = mapPoolToSerializedString(testPoolWithoutTw);

		expect(serialized).toEqual("");
	});

	test("Value of two modes is the same with same maps", () => {
		const testPoolWithDuplicateMaps: MapPoolObject = {
			CB: [1, 2],
			RM: [1, 2],
			TC: [],
			SZ: [],
			TW: [],
		};

		const serialized = mapPoolToSerializedString(testPoolWithDuplicateMaps);

		const [modeOne, modeTwo] = serialized.split(";");
		if (!modeOne || !modeTwo) {
			throw new Error("Map pool is missing modes");
		}

		expect(modeOne.split(":")[1]).toEqual(modeTwo.split(":")[1]);
	});
});
