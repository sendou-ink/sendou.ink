import { EventEmitter } from "node:events";

const globalForEmitter = global as unknown as {
	emitter: EventEmitter | undefined;
};

export const emitter = globalForEmitter.emitter ?? new EventEmitter();
// the default of 10 is not relevant for us because we use it for server-sent events
emitter.setMaxListeners(0);

globalForEmitter.emitter = emitter;
