import { describe, expect, test } from "vitest";
import * as VdoNinjaMessage from "./VdoNinjaMessage";

// shapes as a view link's iframe posted them
describe("VdoNinjaMessage.parse", () => {
	test.each([
		{
			why: "loudness update",
			data: {
				loudness: { abc123: 44 },
				action: "loudness",
				mode: "update",
				value: 44,
			},
			expected: { type: "loudness", loudness: 44 },
		},
		{
			why: "silent loudness update",
			data: { loudness: { abc123: 0 }, action: "loudness", mode: "update" },
			expected: { type: "loudness", loudness: 0 },
		},
		{
			why: "loudness of no stream",
			data: { loudness: {}, action: "loudness" },
			expected: null,
		},
		{
			why: "stream connected",
			data: { action: "view-connection", value: true, streamID: "abc123" },
			expected: { type: "connection", isConnected: true },
		},
		{
			why: "stream disconnected",
			data: { action: "view-connection", value: false, streamID: "abc123" },
			expected: { type: "connection", isConnected: false },
		},
		{
			why: "stream ids listing the stream",
			data: { streamIDs: { abc123: false }, cib: null },
			expected: { type: "connection", isConnected: true },
		},
		{
			why: "stream ids listing none",
			data: { streamIDs: {}, cib: null },
			expected: { type: "connection", isConnected: false },
		},
		{
			why: "other action",
			data: { action: "hss-connection", value: "connected" },
			expected: null,
		},
		{ why: "not an object", data: "hello", expected: null },
	])("$why", ({ data, expected }) => {
		expect(VdoNinjaMessage.parse(data)).toEqual(expected);
	});
});
