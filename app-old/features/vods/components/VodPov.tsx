import { Link } from "@remix-run/react";
import { Avatar } from "~/components/Avatar";
import { userVodsPage } from "~/utils/urls";
import type { Vod } from "../vods-types";

export function PovUser({ pov }: { pov: Vod["pov"] }) {
	if (!pov) return null;

	if (typeof pov === "string") {
		return <div className="text-sm">{pov}</div>;
	}

	return (
		<Link to={userVodsPage(pov)} className="stack horizontal xs">
			<Avatar user={pov} size="xxs" />
			<span className="text-sm font-semi-bold">{pov.username}</span>
		</Link>
	);
}
