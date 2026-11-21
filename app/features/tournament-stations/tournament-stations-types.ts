/** A message of the display screen's stream, see `to.$id.stations.display.stream.ts`. */
export type StationsDisplayStreamMessage =
	| { kind: "heartbeat" }
	/** The stations board may have changed, the screen refetches it. */
	| { kind: "changed" };
