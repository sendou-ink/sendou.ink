declare const __GIT_COMMIT__: string;

/** Commit the bundle was built from, inlined at build time; empty outside deployed builds. */
export const GIT_COMMIT = __GIT_COMMIT__;
