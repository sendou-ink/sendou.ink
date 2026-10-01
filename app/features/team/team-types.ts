import type { QueryRow } from "~/db/entity-query";
import type * as TeamRepository from "./TeamRepository.server";

export type TeamWithMembers = QueryRow<
	ReturnType<typeof TeamRepository.teamByCustomUrl>
>;

export type TeamMemberWithProfile = TeamWithMembers["members"][number];
