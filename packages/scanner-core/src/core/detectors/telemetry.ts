/**
 * Scan telemetry: counters the analyzer accumulates so scan performance is
 * measurable instead of guessed at — how many frames were decoded vs.
 * actually analyzed, where detector time goes (gate vs. parse), how much
 * work scheduling saved, and how much of a VoD was covered in skim mode.
 * Plain JSON so it travels over the worker boundary as-is.
 */

export interface DetectorTelemetry {
	/** frames on which the detector's gate ran */
	checks: number;
	gatePasses: number;
	gateMs: number;
	parses: number;
	parseMs: number;
	/** gate passed but parse() was skipped (suppression / cooldown) */
	suppressedParses: number;
}

export interface ScanTelemetry {
	decodedFrames: number;
	/** frames that went through canvas readback + normalize + detectors */
	analyzedFrames: number;
	/** video seconds covered by dense sequential decode (chunk scan) */
	activeVideoS: number;
	/** video seconds covered by keyframe-hop skimming (chunk scan) */
	skimVideoS: number;
	wallMs: number;
	detectors: Record<string, DetectorTelemetry>;
}

/** Fresh all-zero telemetry for one scan/session. */
export function createScanTelemetry(): ScanTelemetry {
	return {
		decodedFrames: 0,
		analyzedFrames: 0,
		activeVideoS: 0,
		skimVideoS: 0,
		wallMs: 0,
		detectors: {},
	};
}

/** Get-or-create the per-detector counters bucket. */
export function detectorTelemetry(
	telemetry: ScanTelemetry,
	id: string,
): DetectorTelemetry {
	const existing = telemetry.detectors[id];
	if (existing) return existing;
	const created: DetectorTelemetry = {
		checks: 0,
		gatePasses: 0,
		gateMs: 0,
		parses: 0,
		parseMs: 0,
		suppressedParses: 0,
	};
	telemetry.detectors[id] = created;
	return created;
}

/** Sum telemetry across parallel chunk scans into one report. */
export function mergeScanTelemetry(
	parts: readonly ScanTelemetry[],
): ScanTelemetry {
	const out = createScanTelemetry();
	for (const part of parts) {
		out.decodedFrames += part.decodedFrames;
		out.analyzedFrames += part.analyzedFrames;
		out.activeVideoS += part.activeVideoS;
		out.skimVideoS += part.skimVideoS;
		out.wallMs = Math.max(out.wallMs, part.wallMs);
		for (const [id, d] of Object.entries(part.detectors)) {
			const bucket = detectorTelemetry(out, id);
			bucket.checks += d.checks;
			bucket.gatePasses += d.gatePasses;
			bucket.gateMs += d.gateMs;
			bucket.parses += d.parses;
			bucket.parseMs += d.parseMs;
			bucket.suppressedParses += d.suppressedParses;
		}
	}
	return out;
}
