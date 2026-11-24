import { Link } from "react-router";
import { Avatar } from "~/components/Avatar";
import { userVodsPage } from "~/utils/urls";
import type { Vod } from "../vods-types";

export function PovUser({ pov }: { pov: Vod["pov"] }) {
	if (!pov) return null;

	if (typeof pov === "string") {
		return <div className="text-sm truncate">{pov}</div>;
	}

	return (
		<Link to={userVodsPage(pov)} className="stack horizontal xs min-w-0">
			<Avatar user={pov} size="xxs" />
			<span className="text-sm font-semi-bold truncate">{pov.username}</span>
		</Link>
	);
}
