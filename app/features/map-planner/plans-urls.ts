import type { PlanDocument } from "./core/PlanDocument";
import * as PlanEncoding from "./core/PlanEncoding";
import { PLAN_URL_PARAM_MAX_LENGTH } from "./plans-constants";
import { plansSearchParams } from "./plans-search-params";

// XXX: PLANNER_URL once the new planner replaces the tldraw one
const NEW_PLANNER_URL = "/plans/next";

/** Path of a link opening the plan in the planner, `null` when the plan is too big for a link. */
export function planLinkPath(document: PlanDocument) {
	const plan = PlanEncoding.toUrlParam(document);
	if (plan.length > PLAN_URL_PARAM_MAX_LENGTH) return null;

	return plansSearchParams.href(NEW_PLANNER_URL, { plan });
}
