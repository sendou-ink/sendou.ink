import { redirect } from "react-router";

export const loader = () => {
	return redirect("/?search=open&type=users");
};
