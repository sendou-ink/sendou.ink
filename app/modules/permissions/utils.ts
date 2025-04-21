import { ADMIN_ID, STAFF_IDS } from "~/constants";

export function isAdmin(user?: { id: number }) {
	return user?.id === ADMIN_ID;
}

export function isStaff(user?: { id: number }) {
	if (!user) return false;

	return STAFF_IDS.includes(user.id);
}

export function isSupporter(user?: { patronTier: number | null }) {
	return typeof user?.patronTier === "number" && user.patronTier >= 2;
}
