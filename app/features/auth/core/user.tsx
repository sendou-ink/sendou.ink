import * as React from "react";
import { isDeepEqual } from "remeda";
import type { RootLoaderData } from "~/root";

type User = RootLoaderData["user"];

const UserContext = React.createContext<User>(undefined);

/**
 * Provides the logged in user to {@link useUser}. The value keeps its identity
 * while a root revalidation returns an equal user, so its consumers don't re-render.
 */
export function UserProvider({
	user,
	children,
}: {
	user: User;
	children: React.ReactNode;
}) {
	const [stableUser, setStableUser] = React.useState(user);

	if (user !== stableUser && !isDeepEqual(user, stableUser)) {
		setStableUser(user);
	}

	return <UserContext value={stableUser}>{children}</UserContext>;
}

export function useUser() {
	return React.useContext(UserContext);
}
