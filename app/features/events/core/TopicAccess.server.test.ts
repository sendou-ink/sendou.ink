import { describe, expect, test } from "vitest";
import * as TopicAccess from "./TopicAccess.server";

describe("TopicAccess.canSubscribe", () => {
	test.each([
		{ topic: "sq-looking", allowed: true },
		{ topic: "tournament__5", allowed: true },
		{ topic: "match__123", allowed: true },
		{ topic: "sq-group__7", allowed: true },
		{ topic: "user__5", allowed: false },
		{ topic: "chat-room__5", allowed: false },
		{ topic: "unknown-topic", allowed: false },
	])("$topic -> $allowed", ({ topic, allowed }) => {
		expect(TopicAccess.canSubscribe(1, topic)).toBe(allowed);
	});
});
