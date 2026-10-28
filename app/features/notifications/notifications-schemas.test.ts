import * as v from "valibot";
import { describe, expect, test } from "vitest";
import { subscribeSchema } from "./notifications-schemas";

const isValidEndpoint = (endpoint: string) =>
	v.safeParse(subscribeSchema, {
		endpoint,
		keys: { auth: "auth", p256dh: "p256dh" },
	}).success;

describe("subscribeSchema", () => {
	test.each([
		["Chrome", "https://fcm.googleapis.com/fcm/send/abc"],
		["legacy Chrome", "https://jmt17.google.com/fcm/send/abc"],
		["Firefox", "https://updates.push.services.mozilla.com/wpush/v2/abc"],
		["Safari", "https://web.push.apple.com/abc"],
		["Edge", "https://wns2-by3p.notify.windows.com/w/?token=abc"],
	])("accepts a %s push service endpoint", (_, endpoint) => {
		expect(isValidEndpoint(endpoint)).toBe(true);
	});

	test.each([
		["an arbitrary host", "https://attacker.example/push"],
		["plain http", "http://fcm.googleapis.com/fcm/send/abc"],
		["a non-default port", "https://fcm.googleapis.com:8443/fcm/send/abc"],
		["a lookalike suffix", "https://fcm.googleapis.com.attacker.example/abc"],
		["a lookalike prefix", "https://evilnotify.windows.com/abc"],
		["another google.com host", "https://script.google.com/macros/s/abc"],
		["a semicolon host smuggle", "https://evil.com;.notify.windows.com/x"],
		["a brace host smuggle", "https://evil.com{.notify.windows.com/x"],
		["a backtick host smuggle", "https://evil.com`.push.apple.com/x"],
	])("rejects %s", (_, endpoint) => {
		expect(isValidEndpoint(endpoint)).toBe(false);
	});
});
