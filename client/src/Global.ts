import { ref } from "vue";
import { api_call } from "./Lib";

export interface Post {
	pid: number;
	content: string;
	date: string;
}

export interface Comment {
	cid: number;
	pid: number;
	uid: number;
	text: string;
	answer?: string;
}

export interface User {
	uid: number;
	admin: boolean;
	logged_in: boolean;
}

export interface Login extends User {
	token: string;
}

class Globals {
	user = ref<User>();
}

// eslint-disable-next-line @typescript-eslint/naming-convention
const Global = new Globals();

// initialize the user
void (async () => {
	const res = await api_call<User>("GET", "welcome");

	if (res.ok) {
		Global.user.value = res.data;
	}
})();

export default Global;
