import type {
	Breadcrumb,
	SidebarData,
} from "#lib/components/layout/layout-types.ts";
import type { ClientUser } from "#lib/features/auth/user-state.ts";
import type { AuthenticatedUser } from "#lib/features/auth/user-types.ts";

declare global {
	namespace App {
		interface Locals {
			user: AuthenticatedUser | undefined;
		}
		interface PageData {
			user?: ClientUser;
			sidebar?: SidebarData;
			sidenavCollapsed?: boolean;
			breadcrumbs?: Breadcrumb[];
		}
		// interface Error {}
		// interface PageState {}
		// interface Platform {}
	}
}
