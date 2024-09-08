import express, { Request, Response } from "express";
import bcrypt from "bcryptjs";
import mysql from "promise-mysql";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";

import Config from "./config";
import { logger } from "./logger";
import { format_date, HTTPStatus, iiaf_wrap, is_number_string } from "./lib";

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

interface UserEntry {
	uid: number;
	name: string;
	password: string;
	admin: 0 | 1;
}

interface PostEntry {
	pid: number;
	date: string;
	content: string;
}

interface CommentEntry {
	cid: number;
	pid: number;
	uid: number;
	text: string;
	answer: string | null;
}

// wrap in immediately invoked asynchronous function (IIAF) to enable
void (async () => {
	const app = express();

	app.use(express.json());
	app.use(cookieParser());

	// connect to the database
	const db = await mysql.createConnection(Config.database);

	/**
	 * wraps a db.query inside a try-catch and logs errors
	 * @param query sql-query
	 * @param values values for the query
	 * @returns db.query<T>(querry, values)
	 */
	async function db_query<T = unknown>(query: string, values?: unknown[]): Promise<T[] | false> {
		try {
			return db.query<T[]>(query, values);
		} catch (error) {
			let parameter_string: string = `query='${query}'`;

			if (values !== undefined) {
				parameter_string += `, values='${values.toString()}'`;
			}

			logger.error(
				`database access failed with error '${error instanceof Error ? error.message : "unknown error"}' (${parameter_string})`
			);

			return false;
		}
	}

	logger.log("Connected to database");

	type Methods = "GET" | "POST" | "DELETE";
	type Message = { status: HTTPStatus } & Partial<
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
				iiaf_wrap(async () => {
					logger.log(`HTTP ${method} request: ${req.url}`);

					//check wether the session-token is valid
					const check_perm_res = check_permission(req);

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
				logger.log(`invalid session-token (session: '${JSON.stringify(session)}'))`);
			}
		} else {
			logger.warn("'session.token' is undefined");
		}

		return false;
	}

	/**
	 * Check wether the request came from an admin
	 * @param req Request with the session-cookie
	 * @returns wether the request came from an admin
	 */
	async function check_admin(req: Request): Promise<boolean> {
		const uid = extract_uid(req);

		if (typeof uid === "number") {
			const data = await db_query<Pick<UserEntry, "admin">>(
				"SELECT admin FROM users WHERE uid = ?",
				[uid]
			);

			if (data) {
				return data[0].admin === 1;
			} else {
				return false;
			}
		} else {
			return false;
		}
	}

	/**
	 * Extract the uid from a token
	 * @param req Request
	 * @returns uid; null if there is no session-token in req
	 */
	function extract_uid(req: Request): number | null {
		if (typeof req.cookies === "object" && typeof req.cookies.session === "object") {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
			const token: string = req.cookies.session.token ?? "";

			return (jwt.verify(token, Config.jwt_secret) as JWT).uid;
		} else {
			logger.debug(`uid is null`);

			return null;
		}
	}

	/**
	 * Checks wether the uid is an admin or the same as in the session-token
	 * @param uid user to check
	 * @param req request with the session-token
	 * @returns wether the user is an admin or the same as in the session-token
	 */
	async function is_self_or_admin_user(uid: string, req: Request): Promise<boolean> {
		// if it is for the same user, overwrite 'admin' to true
		if (parseInt(uid) === extract_uid(req)) {
			return true;
		} else {
			// if it is the admin user, overwrite 'admin' to true
			const user = await db_query<Pick<UserEntry, "name">>("SELECT name FROM users WHERE uid = ?", [
				req.query.uid
			]);

			if (!!user && user[0].name === "admin") {
				return true;
			} else {
				return false;
			}
		}
	}

	/**
	 * check wether the specified user is an admin
	 * @param uid uid of the user
	 * @returns wether the user is an admin
	 */
	async function is_admin_user(uid: string): Promise<boolean>;
	/**
	 * check wether the specified user is an admin
	 * @param req Request
	 * @returns wether the user is an admin
	 */
	async function is_admin_user(req: Request): Promise<boolean>;
	/**
	 * check wether the specified user is an admin
	 * @param uid_req uid of the user or Request
	 * @returns wether the user is an admin
	 */
	async function is_admin_user(uid_req: string | Request): Promise<boolean> {
		let result;

		if (typeof uid_req === "string") {
			result = await db_query<1>("SELECT 1 FROM users WHERE uid = ? AND name = admin", [uid_req]);
		} else {
			result = await db_query<1>("SELECT 1 FROM users WHERE uid = ? AND name = admin", [
				extract_uid(uid_req)
			]);
		}

		return !!result && result.length === 1;
	}

	/**
	 * create a hash from a password and catch and answer potential errors
	 * @param password Password to be hashed
	 * @returns hashed password. On error Message to answer the request
	 */
	function hash_password(password: string): Promise<string | Message> {
		let password_hash: string;
		let salt: string | undefined;

		try {
			salt = bcrypt.genSaltSync();

			password_hash = bcrypt.hashSync(password, salt);

			return Promise.resolve(password_hash);
		} catch (error) {
			if (salt === undefined) {
				logger.error(
					`salt-generation failed with error '${error instanceof Error ? error.message : "unkown error"}'`
				);
			} else {
				logger.error(
					`password-hashing failed with error '${error instanceof Error ? error.message : "unkown error"}' (password='${password}', salt='${salt}')`
				);
			}

			return Promise.resolve({ status: HTTPStatus.InternalServerError });
		}
	}

	/**
	 * add a user to the database
	 * @param req Request
	 * @returns client-response-message
	 */
	async function add_user(req: Request): Promise<Message> {
		if (await check_admin(req)) {
			const body = req.body as Body;

			if (typeof body.user === "string" && typeof body.password === "string") {
				// check, wether the user already exists
				const data = await db_query<1>("SELECT 1 FROM users WHERE name = ?", [body.user]);

				if (data && data.length === 0) {
					const password_hash = await hash_password(body.password);

					if (typeof password_hash === "string") {
						await db_query("INSERT INTO users (name, password) VALUES (?, ?)", [
							body.user,
							password_hash
						]);

						return get_users();
					} else {
						return password_hash;
					}
				} else {
					logger.log(`Can't add user: user with name '${body.user}' already exists`);

					return { status: HTTPStatus.Conflict, message: "user already exists" };
				}
			} else {
				if (typeof body.user !== "string") {
					logger.warn("body is missing 'user'");
				} else {
					logger.warn("body is missing 'password'");
				}

				return { status: HTTPStatus.BadRequest };
			}
		} else {
			logger.warn(`user with uid=${extract_uid(req)} is no admin`);

			return { status: HTTPStatus.Forbidden };
		}
	}

	/**
	 * change the password or admin-status of a user
	 * @param req Request
	 * @returns client-response-message
	 */
	async function modify_user(req: Request): Promise<Message> {
		if (await check_admin(req)) {
			const body = req.body as Body;
			if (
				is_number_string(req.query.uid) &&
				typeof body.admin === "boolean" &&
				typeof body.password === "string"
			) {
				const uid = req.query.uid;

				if (await is_self_or_admin_user(uid, req)) {
					body.admin = true;
				}

				// only save the password, if it isn't empty
				if (
					body.password.length > 0 &&
					((await is_admin_user(req)) || !(await is_admin_user(uid)))
				) {
					const password_hash = await hash_password(body.password);

					if (typeof password_hash === "string") {
						await db_query("UPDATE users SET password = ?, admin = ? WHERE uid = ?", [
							password_hash,
							body.admin,
							req.query.uid
						]);
					} else {
						return password_hash;
					}
				} else {
					await db_query("UPDATE users SET admin = ? WHERE uid = ?", [body.admin, req.query.uid]);
				}

				return get_users();
			} else {
				if (!is_number_string(req.query.uid)) {
					logger.warn("query is missing 'uid");
				} else if (typeof body.admin !== "boolean") {
					logger.warn("body is missing 'admin'");
				} else if (typeof body.password !== "string") {
					logger.warn("body is missing 'password'");
				}

				return { status: HTTPStatus.BadRequest };
			}
		} else {
			logger.warn(`user with uid=${extract_uid(req)} is no admin`);

			return { status: HTTPStatus.Forbidden };
		}
	}

	/**
	 * delete a user from the database
	 * @param req Request
	 * @returns client-response-message
	 */
	async function delete_user(req: Request): Promise<Message> {
		if (await check_admin(req)) {
			if (is_number_string(req.query.uid)) {
				// prevent deleting the admin-account or self
				if (await is_self_or_admin_user(req.query.uid, req)) {
					logger.warn(`Deleting self or admin isn't allowed (uid=${req.query.uid}')`);

					return { status: HTTPStatus.Forbidden };
				} else {
					if (
						!(await db_query("DELETE FROM users WHERE uid=?", [req.query.uid])) ||
						!(await db_query("DELETE FROM comments WHERE uid = ?", [req.query.uid]))
					) {
						return { status: HTTPStatus.InternalServerError };
					}

					const send_user_result = get_users();

					return send_user_result;
				}
			} else {
				logger.warn("query is missing 'uid'");

				return { status: HTTPStatus.BadRequest };
			}
		} else {
			logger.warn(`user with uid=${extract_uid(req)} is no admin`);

			return { status: HTTPStatus.Forbidden };
		}
	}

	/**
	 * save a post to the database or update it if it already exists
	 * @param req Request
	 * @returns client-response-message
	 */
	async function save_post(req: Request): Promise<Message> {
		if (await check_admin(req)) {
			const body = req.body as Body;

			if (typeof body.text === "string" && typeof req.query.pid === "string") {
				if (
					!(await db_query("UPDATE posts SET content = ? WHERE pid = ?", [
						body.text,
						req.query.pid
					]))
				) {
					return { status: HTTPStatus.InternalServerError };
				}

				return { status: HTTPStatus.OK };
			} else {
				if (typeof body.text !== "string") {
					logger.warn("query is missing 'pid'");
				} else {
					logger.warn("body is missing 'text'");
				}

				return { status: HTTPStatus.BadRequest };
			}
		} else {
			logger.warn(`user with uid=${extract_uid(req)} is no admin`);

			return { status: HTTPStatus.Forbidden };
		}
	}

	/**
	 * add an comment to a post
	 * @param req Request
	 * @returns client-response-message
	 */
	async function add_comment(req: Request): Promise<Message> {
		const uid = extract_uid(req);

		const body = req.body as Body;

		if (
			is_number_string(req.query.pid) &&
			typeof uid === "number" &&
			typeof body.text === "string"
		) {
			// check wether the post is from today / "accepts" comments
			const post_date = await db_query<Pick<PostEntry, "date">>(
				"SELECT date FROM posts WHERE pid = ?",
				[req.query.pid]
			);

			if (!post_date) {
				return { status: HTTPStatus.InternalServerError };
			}

			if (format_date(new Date()) !== post_date[0].date) {
				logger.log(`Can't add comment: post is not from today (pid=${req.query.pid})`);

				return { status: HTTPStatus.Forbidden };
			}

			// check wether the user already posted
			const data = await db_query<1>("SELECT 1 FROM comments WHERE pid = ? AND uid = ? LIMIT 1", [
				req.query.pid,
				uid
			]);

			if (!data) {
				return { status: HTTPStatus.InternalServerError };
			}

			if (data.length === 0) {
				await db_query("INSERT INTO comments (pid, uid, text) VALUES (?, ?, ?)", [
					req.query.pid,
					uid,
					body.text
				]);

				return send_comments(req.query.pid);
			} else {
				logger.log(`Can't add comment: user has already commented on post (pid=${req.query.pid})`);

				return { status: HTTPStatus.Conflict };
			}
		} else {
			if (!is_number_string(req.query.pid)) {
				logger.warn("query is missing 'pid'");
			} else if (typeof uid !== "number") {
				logger.warn("body is missing 'uid'");
			} else if (typeof body.text !== "string") {
				logger.warn("body is missing 'text'");
			}

			return { status: HTTPStatus.BadRequest };
		}
	}

	/**
	 * Delete a comment from the database
	 * @param req Request
	 * @returns client-response-message
	 */
	async function delete_comment(req: Request): Promise<Message> {
		if (await check_admin(req)) {
			if (is_number_string(req.query.cid)) {
				if (!(await db_query("DELETE FROM comments WHERE cid = ?", [req.query.cid]))) {
					return { status: HTTPStatus.InternalServerError };
				} else {
					return { status: HTTPStatus.OK };
				}
			} else {
				logger.warn("query is missing 'cid'");

				return { status: HTTPStatus.BadRequest };
			}
		} else {
			logger.warn(`user with uid=${extract_uid(req)} is no admin`);

			return { status: HTTPStatus.Unauthorized };
		}
	}

	/**
	 * add an answer to a comment
	 * @param req Request
	 * @returns client-response-message
	 */
	async function add_answer(req: Request): Promise<Message> {
		if (await check_admin(req)) {
			const body = req.body as Body;

			if (is_number_string(req.query.cid) && typeof body.answer === "string") {
				await db_query("UPDATE comments SET answer = ? WHERE cid = ?", [
					body.answer,
					req.query.cid
				]);

				const data = await db_query<CommentEntry>("SELECT * FROM comments WHERE cid = ?", [
					req.query.cid
				]);

				if (!data) {
					return { status: HTTPStatus.InternalServerError };
				}

				return { status: HTTPStatus.OK, json: data[0] };
			} else {
				if (!is_number_string(req.query.cid)) {
					logger.warn("query is missing 'cid'");
				} else if (typeof body.answer !== "string") {
					logger.warn("body is missing 'answer'");
				}

				return { status: HTTPStatus.BadRequest };
			}
		} else {
			logger.warn(`user with uid=${extract_uid(req)} is no admin`);

			return { status: HTTPStatus.Forbidden };
		}
	}

	/**
	 * retrieve posts
	 * @param req Request
	 * @returns client-response-message
	 */
	async function get_posts(req: Request): Promise<Message> {
		if (is_number_string(req.query.pid)) {
			const pid = req.query.pid;

			if (typeof pid === "string") {
				const db_result = await db_query<PostEntry>("SELECT * FROM posts WHERE pid = ?", [pid]);

				if (!db_result) {
					return { status: HTTPStatus.InternalServerError };
				}

				// only send post, if the date allows it
				if (new Date() >= new Date(db_result[0].date)) {
					return { status: HTTPStatus.OK, json: db_result[0] };
				} else {
					return { status: HTTPStatus.Forbidden };
				}
			} else {
				return { status: HTTPStatus.BadRequest };
			}
		} else {
			if (await check_admin(req)) {
				const data = await db_query<PostEntry>("SELECT * FROM posts");

				if (!data) {
					return { status: HTTPStatus.InternalServerError };
				}

				return { status: HTTPStatus.OK, json: data };
			} else {
				logger.warn(`user with uid=${extract_uid(req)} is no admin`);

				return { status: HTTPStatus.Unauthorized };
			}
		}
	}

	/**
	 * get the post-config (start-date and number of days)
	 * @returns client-response-message
	 */
	function get_post_config(): Promise<Message> {
		return Promise.resolve({
			status: HTTPStatus.OK,
			json: Config.setup
		});
	}

	/**
	 * validates a login and sets a session-cookie with a login-token
	 * @param req Request
	 * @param res Response
	 * @returns client-response-message
	 */
	async function login(req: Request, res: Response): Promise<Message> {
		const body = req.body as Body;

		if (typeof body.user === "string" && typeof body.password === "string") {
			const users = await db_query<UserEntry>("SELECT * FROM users WHERE name = ? LIMIT 1", [
				body.user
			]);

			if (!users) {
				return { status: HTTPStatus.InternalServerError };
			} else if (users.length === 0) {
				logger.log(`user with name '${body.user}' doesn't exist`);

				return { status: HTTPStatus.Unauthorized };
			} else {
				const user = users[0];

				let password_hash_result: boolean;

				try {
					password_hash_result = bcrypt.compareSync(body.password, user.password.toString());
				} catch (error) {
					logger.error(
						`password-hash-compare failed with error '${error instanceof Error ? error.message : "unkown error"}'`
					);

					return { status: HTTPStatus.InternalServerError };
				}

				if (password_hash_result) {
					const data: JWT = {
						uid: user.uid
					};

					let token: string;

					try {
						token = jwt.sign(data, Config.jwt_secret);
					} catch (error) {
						logger.error(
							`jwt generation failed with error '${error instanceof Error ? error.message : "unkown error"}'`
						);

						return { status: HTTPStatus.InternalServerError };
					}

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
					logger.debug(`rejected loging: invalid password (uid='${user.uid}'`);

					return { status: HTTPStatus.Unauthorized };
				}
			}
		} else {
			if (typeof body.user !== "string") {
				logger.warn("body is missing 'user'");
			} else if (typeof body.password !== "string") {
				logger.warn("body is missing 'password'");
			}

			return { status: HTTPStatus.BadRequest };
		}
	}

	/**
	 * sends-welcome information (user-information)
	 * @param req Request
	 * @returns client-response-message
	 */
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

	/**
	 * performs a logout / deletes the session-cookie
	 * @param _req Request
	 * @param res Resposne
	 * @returns client-response-message
	 */
	function logout(_req: Request, res: Response): Promise<Message> {
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

	/**
	 * returns all the users in the database
	 * @returns client-response-message
	 */
	async function get_users(): Promise<Message> {
		const data_raw = await db_query<Omit<UserEntry, "password">>(
			"SELECT uid, name, admin FROM users"
		);

		if (!data_raw) {
			return { status: HTTPStatus.InternalServerError };
		}

		const data: (Omit<(typeof data_raw)[0], "admin"> & { admin: boolean })[] = data_raw.map(
			(user) => {
				return {
					...user,
					admin: Boolean(user.admin)
				};
			}
		);

		return { status: HTTPStatus.OK, json: data };
	}

	/**
	 * returns all comments in the database
	 * @param req Request
	 * @returns client-response-message
	 */
	async function get_comments(req: Request): Promise<Message> {
		if (typeof req.query.pid === "string") {
			if (is_number_string(req.query.pid)) {
				return send_comments(req.query.pid);
			} else {
				return { status: HTTPStatus.BadRequest };
			}
		} else {
			logger.warn("query is missing 'pid'");

			return send_comments(req);
		}
	}

	/**
	 * send all comments in the database
	 * @param req Request
	 * @returns client-resposne-message
	 */
	async function send_comments(req: Request): Promise<Message>;
	/**
	 * send all comments of the post
	 * @param pid pid of the post
	 * @returns client-response-message
	 */
	async function send_comments(pid: string): Promise<Message>;
	/**
	 * send all comments in the database or for the post
	 * @param req_pid Request or pid of the post
	 * @returns client-response-meesage
	 */
	async function send_comments(req_pid: Request | string): Promise<Message> {
		let data;

		if (typeof req_pid === "string") {
			const pid = req_pid;

			// get the date of the post
			const db_result = await db_query<Pick<PostEntry, "date">>(
				"SELECT date FROM posts WHERE pid = ?",
				[pid]
			);

			if (!db_result) {
				return { status: HTTPStatus.InternalServerError };
			}

			// only send post, if the date allows it
			if (new Date() >= new Date(db_result[0].date)) {
				data = await db_query<CommentEntry>(
					"SELECT * FROM comments WHERE pid=? ORDER BY cid DESC",
					[pid]
				);
			} else {
				logger.log(
					`denied send-comments: requested post is in the future (date='${db_result[0].date}')`
				);

				return { status: HTTPStatus.Forbidden };
			}
		} else {
			const req = req_pid;

			if (await check_admin(req)) {
				data = await db_query<CommentEntry>("SELECT * FROM comments ORDER BY cid DESC");
			} else {
				logger.warn(`user with uid=${extract_uid(req)} is no admin`);

				return { status: HTTPStatus.Unauthorized };
			}
		}

		if (data !== false) {
			return { status: HTTPStatus.OK, json: data };
		} else {
			return { status: HTTPStatus.InternalServerError };
		}
	}
})();
