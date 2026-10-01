/**
 * Who becomes the admin after the current one leaves. `null` if no manager can take over,
 * in which case the admin can't leave. Of several managers the one with the lowest user id
 * (the oldest account) is picked, same as team ownership passing on.
 */
export function resolveNewAdmin<T extends { id: number; role: string }>(
	members: Array<T>,
) {
	const managers = members.filter((member) => member.role === "MANAGER");

	return managers.sort((a, b) => a.id - b.id).at(0) ?? null;
}
