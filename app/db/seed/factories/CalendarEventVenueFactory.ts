import * as CalendarRepository from "~/features/calendar/CalendarRepository.server";
import { defineFactory } from "../core/defineFactory";
import { faker } from "../core/faker";

type Venue = NonNullable<
	Parameters<typeof CalendarRepository.upsertVenue>[0]["venue"]
>;

type InsertArgs = Venue & { eventId: number };

/** Real places so the name, address, coordinates and timezone of a venue agree with each other. */
const PLACES: Array<Venue> = [
	{
		name: "Austin Convention Center",
		address: "500 East Cesar Chavez Street, 78701 Austin, TX, United States",
		city: "Austin",
		countryCode: "US",
		latitude: 30.2636,
		longitude: -97.7397,
		timezone: "America/Chicago",
	},
	{
		name: "Messukeskus",
		address: "Messuaukio 1, 00520 Helsinki, Finland",
		city: "Helsinki",
		countryCode: "FI",
		latitude: 60.2033,
		longitude: 24.9364,
		timezone: "Europe/Helsinki",
	},
	{
		name: "Makuhari Messe",
		address: "2-1 Nakase, 261-0023 Chiba, Japan",
		city: "Chiba",
		countryCode: "JP",
		latitude: 35.6481,
		longitude: 140.0347,
		timezone: "Asia/Tokyo",
	},
	{
		name: "Jaarbeurs",
		address: "Jaarbeursplein 6, 3521 AL Utrecht, Netherlands",
		city: "Utrecht",
		countryCode: "NL",
		latitude: 52.0855,
		longitude: 5.1086,
		timezone: "Europe/Amsterdam",
	},
	{
		name: "Melbourne Convention and Exhibition Centre",
		address: "1 Convention Centre Place, 3006 Melbourne, Victoria, Australia",
		city: "Melbourne",
		countryCode: "AU",
		latitude: -37.8253,
		longitude: 144.9536,
		timezone: "Australia/Melbourne",
	},
];

/** Makes the event a LAN by giving it a venue, as picked in the event form. */
export const { create } = defineFactory({
	defaults: () => faker.helpers.arrayElement(PLACES),
	insert: async ({ eventId, ...venue }: InsertArgs) => {
		await CalendarRepository.upsertVenue({ eventId, venue });

		return { eventId };
	},
});
