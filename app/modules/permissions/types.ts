export type Permissions = Record<string, number[]>;

export type EntityWithPermissions = {
	permissions: Permissions;
};
