import type * as v from "valibot";
import type { QueryRow } from "~/db/entity-query";
import type * as VodRepository from "./VodRepository.server";
import type { videoSchema } from "./vods-schemas";

export type VideoBeingAdded = v.InferOutput<typeof videoSchema>;

/** A vod as its own page shows it. */
export type Vod = QueryRow<ReturnType<typeof VodRepository.vodWithMatches>>;

/** A vod as listings show it. */
export type ListVod = QueryRow<ReturnType<typeof VodRepository.userVods>>;
