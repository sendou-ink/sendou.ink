declare const __GIT_COMMIT__: string;

/**
 * Commit the running bundle was built from. Inlined at build time, meaning the
 * client and the server report their own build's commit. Empty string outside
 * of deployed builds (e.g. local development).
 */
export const GIT_COMMIT = __GIT_COMMIT__;
