import tzLookup from "@photostructure/tz-lookup";
import { minutesToMilliseconds } from "date-fns";
import * as R from "remeda";
import * as v from "valibot";
import { LRUCache } from "~/modules/cache";
import { logger } from "~/utils/logger";

const PHOTON_API_URL = "https://photon.komoot.io/api/";
const RESULT_LIMIT = 6;
/** Queries whose results are kept, for as long as the server runs as places rarely change. */
const MAX_CACHED_QUERIES = 5_000;
const RATE_LIMIT_WINDOW_MS = minutesToMilliseconds(1);
/** Requests one user may make per window, cached or not. */
const MAX_REQUESTS_PER_USER = 30;
/** Requests reaching Photon per window, across all users, to stay within its fair use. */
const MAX_PHOTON_REQUESTS = 60;
/** Countries where the house number is written before the street. */
const HOUSE_NUMBER_FIRST_COUNTRIES = new Set([
	"US",
	"CA",
	"GB",
	"IE",
	"AU",
	"NZ",
	"FR",
]);

export interface VenueSearchResult {
	/** Position in the results, only stable within one response. */
	id: number;
	/** Label of the result, the place name followed by its address. */
	name: string;
	/** Name of the place itself, e.g. "Austin Convention Center", if the result is one. */
	placeName: string | null;
	/** Display address without the place name, e.g. "500 East Cesar Chavez Street, 78701 Austin, TX, United States" */
	address: string;
	city: string | null;
	countryCode: string;
	latitude: number;
	longitude: number;
	/** IANA timezone at the coordinates. */
	timezone: string;
}

const optionalText = v.optional(v.string());

const photonFeatureSchema = v.object({
	geometry: v.object({
		coordinates: v.tuple([
			v.pipe(v.number(), v.minValue(-180), v.maxValue(180)),
			v.pipe(v.number(), v.minValue(-90), v.maxValue(90)),
		]),
	}),
	properties: v.object({
		name: optionalText,
		housenumber: optionalText,
		street: optionalText,
		postcode: optionalText,
		city: optionalText,
		town: optionalText,
		village: optionalText,
		state: optionalText,
		country: optionalText,
		countrycode: v.pipe(v.string(), v.toUpperCase(), v.regex(/^[A-Z]{2}$/)),
	}),
});

// features are validated one by one, so one odd place doesn't fail the whole search
const photonResponseSchema = v.object({ features: v.array(v.unknown()) });

const resultsByQuery = new LRUCache<string, VenueSearchResult[]>({
	max: MAX_CACHED_QUERIES,
});
const userRequests = new Map<number, { windowStart: number; count: number }>();
const photonRequests = { windowStart: 0, count: 0 };

/**
 * Searches addresses and places matching the query from Photon (OpenStreetMap), each with the
 * timezone at its coordinates. Results are cached for the server's uptime and requests rate limited
 * per user and overall, a rate limited or failed search returns no results.
 */
export async function search({
	query,
	userId,
}: {
	query: string;
	userId: number;
}): Promise<VenueSearchResult[]> {
	const normalizedQuery = query.trim().toLowerCase().replace(/\s+/g, " ");
	if (!normalizedQuery) return [];

	if (!consumeUserRequest(userId)) return [];

	const cached = resultsByQuery.get(normalizedQuery);
	if (cached) return cached;

	if (!consumePhotonRequest()) {
		logger.warn("Venue search failed: Photon request limit reached");
		return [];
	}

	try {
		const results = await fetchFromPhoton(normalizedQuery);
		resultsByQuery.set(normalizedQuery, results);

		return results;
	} catch (error) {
		logger.warn(`Venue search failed: ${(error as Error).message}`);
		return [];
	}
}

async function fetchFromPhoton(query: string) {
	const url = new URL(PHOTON_API_URL);
	url.searchParams.set("q", query);
	url.searchParams.set("limit", String(RESULT_LIMIT));

	const response = await fetch(url, {
		headers: { "User-Agent": "sendou.ink" },
	});
	if (!response.ok) {
		throw new Error(`Photon responded with status ${response.status}`);
	}

	const { features } = v.parse(photonResponseSchema, await response.json());

	const places = features.flatMap((feature) => {
		const parsed = v.safeParse(photonFeatureSchema, feature);
		return parsed.success ? [featureToPlace(parsed.output)] : [];
	});

	// one place is often in OpenStreetMap a few times over, e.g. as a building and as its venue
	return R.uniqueBy(places, (place) => place.name).map((place, id) => ({
		...place,
		id,
	}));
}

function featureToPlace(
	feature: v.InferOutput<typeof photonFeatureSchema>,
): Omit<VenueSearchResult, "id"> {
	const { properties } = feature;
	const [longitude, latitude] = feature.geometry.coordinates;
	const countryCode = properties.countrycode;

	const city = properties.city ?? properties.town ?? properties.village ?? null;
	const streetLine = properties.street
		? R.filter(
				HOUSE_NUMBER_FIRST_COUNTRIES.has(countryCode)
					? [properties.housenumber, properties.street]
					: [properties.street, properties.housenumber],
				R.isTruthy,
			).join(" ")
		: null;
	const cityLine = R.filter([properties.postcode, city], R.isTruthy).join(" ");

	const address = R.unique(
		R.filter(
			[streetLine, cityLine, properties.state, properties.country],
			R.isTruthy,
		),
	).join(", ");
	const placeName = properties.name ?? null;

	return {
		name: R.filter([placeName, address], R.isTruthy).join(", "),
		placeName,
		address: address || (placeName ?? ""),
		city,
		countryCode,
		latitude,
		longitude,
		timezone: tzLookup(latitude, longitude),
	};
}

function consumeUserRequest(userId: number) {
	const now = Date.now();
	const entry = userRequests.get(userId);

	if (!entry || now - entry.windowStart >= RATE_LIMIT_WINDOW_MS) {
		pruneUserRequests(now);
		userRequests.set(userId, { windowStart: now, count: 1 });
		return true;
	}

	if (entry.count >= MAX_REQUESTS_PER_USER) return false;

	entry.count++;
	return true;
}

function pruneUserRequests(now: number) {
	for (const [userId, entry] of userRequests) {
		if (now - entry.windowStart >= RATE_LIMIT_WINDOW_MS) {
			userRequests.delete(userId);
		}
	}
}

function consumePhotonRequest() {
	const now = Date.now();

	if (now - photonRequests.windowStart >= RATE_LIMIT_WINDOW_MS) {
		photonRequests.windowStart = now;
		photonRequests.count = 0;
	}

	if (photonRequests.count >= MAX_PHOTON_REQUESTS) return false;

	photonRequests.count++;
	return true;
}
