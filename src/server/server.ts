import express, { Request, Response } from "express";
import bcrypt from "bcrypt";
import mysql from "promise-mysql";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";

import Config from "./config";
import { logger } from "./logger";
import { HTTPStatus, iiaf_wrap, query_is_string } from "./lib";

// data stored in the JSON webtoken
interface JWT {
	uid: number;
}

// data stored in the session-cokie
interface SessionCookie {
	name: string;
	admin: boolean;
	uid: number;
	token: string;
}

type Body = Record<string, unknown>;

interface PostsEntry {
	pid: number;
	date: string;
	content: string;
}

// wrap in immediately invoked asynchronous function (IIAF) to enable
void (async () => {
	const app = express();

	app.use(express.json());
	app.use(cookieParser());

	// connect to the database
	const db = await mysql.createConnection(Config.database);
	logger.log("Connected to database");

	type Methods = "GET" | "POST" | "DELETE";
	type Message = { status: number } & Partial<
		{ message?: string; json: never } | { json?: object; message: never }
	>;

	type API = { [K in Methods]: Record<string, (req: Request, res: Response) => Promise<Message>> };
	const api: API = {
		/* eslint-disable @typescript-eslint/naming-convention */
		GET: {
			users: get_users,
			posts: get_posts,
			"posts/config": get_post_config,
			comments: get_comments
		},
		POST: {
			user: add_user,
			"user/modify": modify_user,
			comment: add_comment,
			"comment/answer": add_answer,
			post: save_post
		},
		DELETE: {
			comment: delete_comment,
			user: delete_user
		}
		/* eslint-enable @typescript-eslint/naming-convention */
	};

	// add the listeners
	Object.entries(api).forEach(([method, paths]) => {
		// map the individual method-functions into an object
		const function_map: {
			[K in Methods]: (path: string, callback: (req: Request, res: Response) => void) => void;
		} = {
			/* eslint-disable @typescript-eslint/naming-convention */
			GET: app.get.bind(app),
			POST: app.post.bind(app),
			DELETE: app.delete.bind(app)
			/* eslint-enable @typescript-eslint/naming-convention */
		};

		// iterate over the different specified methods
		Object.entries(paths).forEach(([path, func]) => {
			// register the individual end-points
			function_map[method as Methods]("/api/" + path, (req, res) => {
				logger.log(`HTTP ${method} request: ${req.url}`);

				//check wether the session-token is valid
				const check_perm_res = check_permission(req);

				iiaf_wrap(async () => {
					// if the session-token is valid, proceed with the handler-function
					if (check_perm_res) {
						const response_values = await func(req, res);

						send_response(res, response_values);
					} else {
						// invalid session-token
						send_response(res, { status: HTTPStatus.Forbidden });
					}
				});
			});
		});
	});

	// handle methods without session-token seperately
	app.get("/api/welcome", (req, res) => {
		logger.log("HTTP get request: /api/welcome");

		send_response(res, welcome(req));
	});
	app.post("/api/login", (req, res) => {
		iiaf_wrap(async () => {
			logger.log("HTTP post request: /api/login");

			send_response(res, await login(req, res));
		});
	});
	app.get("/api/logout", (req, res) => {
		iiaf_wrap(async () => {
			logger.log("HTTP post request: /api/logout");

			send_response(res, await logout(req, res));
		});
	});

	app.listen(Config.server.port);
	logger.log("added API-endpoints");

	/**
	 * populate and send the response
	 * @param res Reponse to be populated
	 * @param message Data to be send
	 */
	function send_response(res: Response, message: Message) {
		// attach the returned status
		res.status(message.status);

		// send (if available) the JSON object
		if (message.json !== undefined) {
			res.json(message.json);
		} else {
			// send with the message
			res.send(message.message);
		}
	}

	/**
	 * Extract the session-cookie from the request
	 * @param req Request with session-cookie
	 * @returns Session-cokie or undefined, if there is no session-cookie
	 */
	function extract_session_cookie(req: Request): SessionCookie | undefined {
		return req.cookies.session as SessionCookie | undefined;
	}

	/**
	 * Check wether the request has a valid session-token
	 * @param req Request with the session-token
	 * @returns wether the request has a valid session token
	 */
	function check_permission(req: Request): boolean {
		const session = extract_session_cookie(req);

		if (session !== undefined) {
			try {
				jwt.verify(session.token, Config.jwt_secret);

				return true;
			} catch {
				/* empty */
			}
		}

		return false;
	}

	/**
	 * Check wether the request came from an admin
	 * @param req Request with the session-cookie
	 * @returns wether the request came from an admin
	 */
	async function check_admin(req: Request): Promise<boolean> {
		try {
			const uid = extract_uid(req);
			const data: { admin: number }[] = await db.query("SELECT admin FROM users WHERE uid = ?", [
				uid
			]);

			return data?.[0].admin === 1;
		} catch {
			return false;
		}
	}

	/**
	 * Extract the uid from a token
	 * @param token
	 * @returns uid
	 */
	function extract_uid(req: Request): number | null {
		if (typeof req.cookies === "object" && typeof req.cookies.session === "object") {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
			const token: string = req.cookies.session.token ?? "";

			return (jwt.verify(token, Config.jwt_secret) as JWT).uid;
		} else {
			return null;
		}
	}

	/**
	 * Checks wether the uid is an admin or the same as in the session-token
	 * @param uid user to check
	 * @param req request with the session-token
	 * @returns wether the user is an admin or the same as in the session-token
	 */
	async function is_self_or_admin(uid: number, req: Request): Promise<boolean> {
		// if it is for the same user, overwrite 'admiN' to true
		if (uid === extract_uid(req)) {
			return true;
		} else {
			// if it is the admin user, overwrite 'admin' to true
			const user: { name: string }[] = await db.query("SELECT name FROM users WHERE uid = ?", [
				req.query.uid
			]);

			if (user[0].name === "admin") {
				return true;
			} else {
				return false;
			}
		}
	}

	async function get_users(): Promise<Message> {
		return send_users();
	}

	async function add_user(req: Request): Promise<Message> {
		const body = req.body as Body;

		if (typeof body.user === "string" && typeof body.password === "string") {
			try {
				// check, wether the user already exists
				const data: 1[] = await db.query("SELECT 1 FROM users WHERE name = ?", [body.user]);

				if (data.length === 0) {
					const salt = await bcrypt.genSalt();

					const password_hash = await bcrypt.hash(body.password, salt);

					await db.query("INSERT INTO users (name, password) VALUES (?, ?)", [
						body.user,
						password_hash
					]);

					return send_users();
				} else {
					return { status: HTTPStatus.Conflict, message: "user already exists" };
				}
			} catch {
				return { status: HTTPStatus.InternalServerError };
			}
		} else {
			return { status: HTTPStatus.BadRequest };
		}
	}

	async function modify_user(req: Request): Promise<Message> {
		if (await check_admin(req)) {
			const body = req.body as Body;
			if (
				query_is_string(req.query.uid) &&
				typeof body.admin === "boolean" &&
				typeof body.password === "string"
			) {
				if (await is_self_or_admin(parseInt(req.query.uid), req)) {
					body.admin = true;
				}

				// only save the password, if it isn't empty
				if (body.password.length > 0) {
					const salt = await bcrypt.genSalt();

					const password_hash = await bcrypt.hash(body.password, salt);

					await db.query("UPDATE users SET password = ?, admin = ? WHERE uid = ?", [
						password_hash,
						body.admin,
						req.query.uid
					]);
				} else {
					await db.query("UPDATE users SET admin = ? WHERE uid = ?", [body.admin, req.query.uid]);
				}

				return send_users();
			} else {
				return { status: HTTPStatus.BadRequest };
			}
		} else {
			return { status: HTTPStatus.Unauthorized };
		}
	}

	async function delete_user(req: Request): Promise<Message> {
		if (await check_admin(req)) {
			logger.trace("delete_user: admin-check successful");

			if (query_is_string(req.query.uid)) {
				logger.trace("delete_user: arguments are valid");

				// prevent deleting the admin-account or self
				if (await is_self_or_admin(parseInt(req.query.uid), req)) {
					return { status: HTTPStatus.Forbidden };
				} else {
					try {
						await db.query("DELETE FROM users WHERE uid=?", [req.query.uid]);
						logger.trace("delete_user: deleted user from database");

						await db.query("DELETE FROM comments WHERE uid = ?", [req.query.uid]);
						logger.trace("delete_user: deleted user-comments from database");

						const send_user_result = send_users();
						logger.trace("delete_user: send users to client");

						return send_user_result;
					} catch {
						return { status: HTTPStatus.InternalServerError };
					}
				}
			} else {
				return { status: HTTPStatus.BadRequest };
			}
		} else {
			return { status: HTTPStatus.Unauthorized };
		}
	}

	async function save_post(req: Request): Promise<Message> {
		if (await check_admin(req)) {
			const body = req.body as Body;

			if (typeof body.text === "string" && typeof req.query.pid === "string") {
				await db.query("UPDATE posts SET content = ? WHERE pid = ?", [body.text, req.query.pid]);

				return { status: HTTPStatus.OK };
			} else {
				return { status: HTTPStatus.BadRequest };
			}
		} else {
			return { status: HTTPStatus.Unauthorized };
		}
	}

	async function add_comment(req: Request): Promise<Message> {
		const uid = extract_uid(req);

		const body = req.body as Body;

		if (
			query_is_string(req.query.pid) &&
			typeof uid === "number" &&
			typeof body.text === "string"
		) {
			try {
				// check wether the user already posted
				const data: 1[] = await db.query(
					"SELECT 1 FROM comments WHERE pid = ? AND uid = ? LIMIT 1",
					[req.query.pid, uid]
				);

				if (data.length === 0) {
					await db.query("INSERT INTO comments (pid, uid, text) VALUES (?, ?, ?)", [
						req.query.pid,
						uid,
						body.text
					]);

					return send_comments(parseInt(req.query.pid));
				} else {
					return { status: HTTPStatus.Conflict, message: "user has already commented on post" };
				}
			} catch {
				return { status: HTTPStatus.InternalServerError };
			}
		} else {
			return { status: HTTPStatus.BadRequest };
		}
	}

	async function delete_comment(req: Request): Promise<Message> {
		if (await check_admin(req)) {
			const body = req.body as Body;
			if (typeof body.cid === "number" && typeof body.cid === "number") {
				try {
					await db.query("DELETE FROM comments WHERE cid = ?", [body.cid]);

					return { status: HTTPStatus.OK };
				} catch {
					return { status: HTTPStatus.InternalServerError };
				}
			} else {
				return { status: HTTPStatus.BadRequest };
			}
		} else {
			return { status: HTTPStatus.Unauthorized };
		}
	}

	async function add_answer(req: Request): Promise<Message> {
		if (await check_admin(req)) {
			logger.trace("add_answer: admin-check succesful");

			const body = req.body as Body;

			if (query_is_string(req.query.cid) && typeof body.answer === "string") {
				logger.trace("add_answer: arguments are valid");

				try {
					await db.query("UPDATE comments SET answer = ? WHERE cid = ?", [
						body.answer,
						req.query.cid
					]);
					logger.trace("add_answer: wrote answer to database");

					const data: Comment[] = await db.query("SELECT * FROM comments WHERE cid = ?", [
						req.query.cid
					]);
					logger.trace("add_answer: selected comment from database");

					return { status: HTTPStatus.OK, json: data[0] };
				} catch {
					return { status: HTTPStatus.InternalServerError };
				}
			} else {
				return { status: HTTPStatus.BadRequest };
			}
		} else {
			return { status: HTTPStatus.Unauthorized };
		}
	}

	async function get_posts(req: Request): Promise<Message> {
		if (query_is_string(req.query.pid)) {
			const pid = parseInt(req.query.pid);

			if (!isNaN(pid)) {
				return send_posts(pid);
			} else {
				return { status: HTTPStatus.BadRequest };
			}
		} else {
			return send_posts(req);
		}
	}

	function get_post_config(): Promise<Message> {
		return Promise.resolve({
			status: HTTPStatus.OK,
			json: Config.setup
		});
	}

	async function login(req: Request, res: Response): Promise<Message> {
		const body = req.body as Body;

		if (typeof body.user === "string" && typeof body.password === "string") {
			try {
				const users: { uid: number; name: string; password: Buffer; admin: boolean | null }[] =
					await db.query("SELECT * FROM users WHERE name = ? LIMIT 1", [body.user]);

				if (users.length === 0) {
					return { status: HTTPStatus.Unauthorized };
				} else {
					const user = users[0];

					if (await bcrypt.compare(body.password, user.password.toString("utf-8"))) {
						const data: JWT = {
							uid: user.uid
						};

						const token = jwt.sign(data, Config.jwt_secret);

						const response = {
							uid: user.uid,
							name: user.name,
							admin: !!user.admin
						};

						const cookie: SessionCookie = {
							...response,
							token
						};

						/* eslint-disable @typescript-eslint/naming-convention */
						res.cookie("session", cookie, {
							httpOnly: true,
							sameSite: "strict",
							maxAge: Config.session_expire
						});
						/* eslint-enable @typescript-eslint/naming-convention */

						return {
							status: HTTPStatus.OK,
							json: {
								...response,
								logged_in: true
							}
						};
					} else {
						return { status: HTTPStatus.Unauthorized };
					}
				}
			} catch {
				return { status: HTTPStatus.InternalServerError };
			}
		} else {
			return { status: HTTPStatus.BadRequest };
		}
	}

	function welcome(req: Request): Message {
		const session = extract_session_cookie(req);

		type WelcomeMessage =
			| { logged_in: boolean; uid: number; admin: boolean }
			| { logged_in: boolean };
		let return_object: WelcomeMessage = {
			logged_in: false
		};

		if (session !== undefined) {
			return_object = {
				admin: session.admin,
				logged_in: true,
				uid: session.uid
			};
		}

		return {
			status: HTTPStatus.OK,
			json: return_object
		};
	}

	function logout(req: Request, res: Response): Promise<Message> {
		res.clearCookie("session");

		return Promise.resolve({
			status: HTTPStatus.OK,
			json: {
				uid: 0,
				name: "",
				admin: false,
				logged_in: false
			}
		});
	}

	async function send_users(): Promise<Message> {
		const data_raw: { uid: number; name: string; admin: number }[] = await db.query(
			"SELECT uid, name, admin FROM users"
		);

		const data: { uid: number; name: string; admin: boolean }[] = data_raw.map((user) => {
			return {
				...user,
				admin: Boolean(user.admin)
			};
		});

		return { status: HTTPStatus.OK, json: data };
	}

	async function get_comments(req: Request): Promise<Message> {
		if (typeof req.query.pid === "string") {
			const pid = parseInt(req.query.pid);

			if (!isNaN(pid)) {
				return send_comments(pid);
			} else {
				return { status: HTTPStatus.BadRequest };
			}
		} else {
			return send_comments(req);
		}
	}

	async function send_posts(req: Request): Promise<Message>;
	async function send_posts(pid: number): Promise<Message>;
	async function send_posts(req_pid: Request | number): Promise<Message> {
		let data: PostsEntry[] | PostsEntry;

		// a specific post is requested
		if (typeof req_pid === "number") {
			const pid = req_pid;

			const db_result: PostsEntry[] = await db.query("SELECT * FROM posts WHERE pid = ?", [pid]);

			// only send post, if the date allows it
			if (new Date() >= new Date(db_result?.[0].date)) {
				data = db_result[0];
			} else {
				return { status: HTTPStatus.Forbidden };
			}
		} else {
			// no pid is give, try to send all posts
			const req = req_pid;

			if (await check_admin(req)) {
				data = await db.query("SELECT * FROM posts");
			} else {
				return { status: HTTPStatus.Unauthorized };
			}
		}

		if (data !== undefined) {
			return { status: HTTPStatus.OK, json: data };
		} else {
			return { status: HTTPStatus.InternalServerError };
		}
	}

	async function send_comments(req: Request): Promise<Message>;
	async function send_comments(pid: number): Promise<Message>;
	async function send_comments(req_pid: Request | number): Promise<Message> {
		let data: Record<string, unknown>[];

		if (typeof req_pid === "number") {
			const pid = req_pid;

			// get the date of the post
			const db_result: { date: string }[] = await db.query("SELECT date FROM posts WHERE pid = ?", [
				pid
			]);

			// only send post, if the date allows it
			if (new Date() >= new Date(db_result[0].date)) {
				data = await db.query("SELECT * FROM comments WHERE pid=? ORDER BY cid DESC", [pid]);
			} else {
				return { status: HTTPStatus.Forbidden };
			}
		} else {
			const req = req_pid;

			if (await check_admin(req)) {
				data = await db.query("SELECT * FROM comments ORDER BY cid DESC");
			} else {
				return { status: HTTPStatus.Unauthorized };
			}
		}

		if (data !== undefined) {
			return { status: HTTPStatus.OK, json: data };
		} else {
			return { status: HTTPStatus.InternalServerError };
		}
	}
})();
