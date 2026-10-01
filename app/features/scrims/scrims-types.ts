import type { QueryRow } from "~/db/entity-query";
import type * as ScrimPostRepository from "./ScrimPostRepository.server";
import type { LUTI_DIVS } from "./scrims-constants";

export type LutiDiv = (typeof LUTI_DIVS)[number];

export type ScrimSide = "ALPHA" | "BRAVO";

type Posts = ReturnType<typeof ScrimPostRepository.posts>;

/** A scrim post with its users and the requests the viewer may see, see `ScrimPostRepository.posts`. */
export type ScrimPostWithParticipants = QueryRow<
	ReturnType<Posts["withParticipants"]>
>;

/** A scrim post as pages show it: with its participants and what the viewer may do with it. */
export type ScrimPost = QueryRow<
	ReturnType<ReturnType<Posts["withParticipants"]>["withPermissions"]>
>;

export interface TimeRange {
	start: string;
	end: string;
}

export interface ScrimFilters {
	weekdayTimes: TimeRange | null;
	weekendTimes: TimeRange | null;
	divs: {
		min: LutiDiv | null;
		max: LutiDiv | null;
	} | null;
}
