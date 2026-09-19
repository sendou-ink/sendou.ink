import { useHasRole } from "~/modules/permissions/hooks";
import { useSearchParam } from "~/modules/search-params/hooks";
import { scannerSearchParams } from "../scanner-search-params";

/** The debug tools (fixtures, telemetry, raw detections) show for devs, admins, or anyone with `?debug=true`. */
export function useDebug(): boolean {
	const isDev = useHasRole("DEV");
	const isAdmin = useHasRole("ADMIN");
	const [debug] = useSearchParam(scannerSearchParams, "debug");
	return isDev || isAdmin || debug;
}
