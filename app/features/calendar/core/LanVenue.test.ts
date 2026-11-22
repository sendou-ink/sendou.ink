import { describe, expect, test } from "vitest";
import * as LanVenue from "./LanVenue";

function makeLan(name: string, latitude: number, longitude: number) {
	return { name, venue: { latitude, longitude } };
}

describe("LanVenue.firstPerLocation", () => {
	test("keeps only the first LAN at each location", () => {
		const lans = LanVenue.firstPerLocation([
			makeLan("Chicago #47", 41.8781, -87.6298),
			makeLan("Helsinki", 60.2033, 24.9364),
			makeLan("Chicago #48", 41.8781, -87.6298),
			makeLan("Chicago #49", 41.87812, -87.62981),
		]);

		expect(lans.map((lan) => lan.name)).toEqual(["Chicago #47", "Helsinki"]);
	});

	test("keeps nearby but different venues apart", () => {
		const lans = LanVenue.firstPerLocation([
			makeLan("Paris Expo", 48.8325, 2.2875),
			makeLan("La Défense Arena", 48.8957, 2.2296),
		]);

		expect(lans).toHaveLength(2);
	});
});
