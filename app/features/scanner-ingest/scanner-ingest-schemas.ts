import { z } from "zod";
import { scannerMatchSchema } from "~/features/scanner/scanner-schemas";
import { id } from "~/utils/zod";

const MAX_MATCHES_PER_REQUEST = 50;

/**
 * The ScannerMatch shape comes from the producer
 * (~/features/scanner/scanner-schemas — the single source of truth for the
 * scanner domain); this module only adds the ingest-specific envelope.
 */
export const ingestBodySchema = z.object({
	/** the user whose point of view the matches were detected from */
	povUserId: id.optional(),
	matches: z.array(scannerMatchSchema).min(1).max(MAX_MATCHES_PER_REQUEST),
});
