let actorReads = 0;

/** Called on every read of the request's user, so code building a query can tell whether it depended on the viewer. */
export function noteActorRead() {
	actorReads++;
}

/** Grows with every read of the request's user; compare two calls to see whether code in between read it. */
export function actorReadCount() {
	return actorReads;
}
