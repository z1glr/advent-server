import express, { Request, Response } from "express";
import bcrypt from "bcrypt";
import mysql from "promise-mysql";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import multer from "multer";
import path from "path";
import { Express } from "express-serve-static-core";

import Config from "./config";
import { logger } from "./logger";
import {
	Body,
	check_admin,
	check_path_escape,
	check_permission,
	db_query,
	extract_session_cookie,
	extract_uid,
	format_date,
	HTTPStatus,
	iiaf_wrap,
	is_boolean,
	is_number,
	is_number_string,
	is_string,
	JWT,
	Message,
	Methods,
	send_response,
	SessionCookie,
	UserEntry
} from "./lib";
import FileServer from "./file_server";

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
	const app: Express = express();

	app.use(express.json());
	app.use(cookieParser());

	// connect to the database
	const db = await mysql.createConnection({
		...Config.database
	});

	// initialize the file-server for vuefinder
	const _file_server = new FileServer(app, db);

	// setup multer to store files
	const storage = multer.diskStorage({
		destination: function (_req, _file, cb) {
			cb(null, Config.get_upload_dir(""));
		},
		filename: function (_req, file, cb) {
			cb(null, Buffer.from(file.originalname, "latin1").toString("utf-8").replace(" ", "_"));
		}
	});

	const upload = multer({
		storage: storage,
		// eslint-disable-next-line @typescript-eslint/naming-convention
		fileFilter: (req: Request, _file, callback) => {
			iiaf_wrap(async () => {
				callback(
					null,
					(await check_admin(db, req)) && check_path_escape(req.file?.originalname ?? "")
				);
			});
		}
	});

	logger.log("Connected to database");

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
	app.post("/api/storage/upload", upload.single("file"), function (req: Request, res: Response) {
		iiaf_wrap(async () => {
			logger.log("HTTP POST request: /api/storage/upload");

			//check wether the session-token is valid
			const check_perm_res = check_permission(req);

			// if the session-token is valid, proceed with the handler-function
			if (check_perm_res) {
				const response_values = await storage_upload(req);

				send_response(res, response_values);
			} else {
				// invalid session-token
				send_response(res, { status: HTTPStatus.Forbidden });
			}
		});
	});
	app.use("/api/storage/public", express.static(Config.server.upload_dir));

	app.listen(Config.server.port);
	logger.log("added API-endpoints");

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
			const user = await db_query<Pick<UserEntry, "name">>(
				db,
				"SELECT name FROM users WHERE uid = ?",
				[req.query.uid]
			);

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

		if (is_string(uid_req)) {
			result = await db_query<1>(db, "SELECT 1 FROM users WHERE uid = ? AND name = admin", [
				uid_req
			]);
		} else {
			result = await db_query<1>(db, "SELECT 1 FROM users WHERE uid = ? AND name = admin", [
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
		if (await check_admin(db, req)) {
			const body = req.body as Body;

			if (is_string(body.user) && is_string(body.password)) {
				// check, wether the user already exists
				const data = await db_query<1>(db, "SELECT 1 FROM users WHERE name = ?", [body.user]);

				if (data && data.length === 0) {
					const password_hash = await hash_password(body.password);

					if (is_string(password_hash)) {
						await db_query(db, "INSERT INTO users (name, password) VALUES (?, ?)", [
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
				if (!is_string(body.user)) {
					logger.warn("body is missing 'user'");
				}
				if (!is_string(body.password)) {
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
		if (await check_admin(db, req)) {
			const body = req.body as Body;
			if (is_number_string(req.query.uid) && is_boolean(body.admin) && is_string(body.password)) {
				const uid = req.query.uid;

				// prevent from demote self
				if (await is_self_or_admin_user(uid, req)) {
					body.admin = true;
				}

				// only save the password, if it isn't empty and prevent others from changing the admin-users password
				if (
					body.password.length > 0 &&
					((await is_admin_user(req)) || !(await is_admin_user(uid)))
				) {
					const password_hash = await hash_password(body.password);

					if (is_string(password_hash)) {
						await db_query(db, "UPDATE users SET password = ?, admin = ? WHERE uid = ?", [
							password_hash,
							body.admin,
							req.query.uid
						]);
					} else {
						return password_hash;
					}
				} else {
					await db_query(db, "UPDATE users SET admin = ? WHERE uid = ?", [
						body.admin,
						req.query.uid
					]);
				}

				return get_users();
			} else {
				if (!is_number_string(req.query.uid)) {
					logger.warn("query is missing 'uid");
				}
				if (!is_string(body.admin)) {
					logger.warn("body is missing 'admin'");
				}
				if (!is_string(body.password)) {
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
		if (await check_admin(db, req)) {
			if (is_number_string(req.query.uid)) {
				// prevent deleting the admin-account or self
				if (await is_self_or_admin_user(req.query.uid, req)) {
					logger.warn(`Deleting self or admin isn't allowed (uid=${req.query.uid}')`);

					return { status: HTTPStatus.Forbidden };
				} else {
					if (
						!(await db_query(db, "DELETE FROM users WHERE uid=?", [req.query.uid])) ||
						!(await db_query(db, "DELETE FROM comments WHERE uid = ?", [req.query.uid]))
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
		if (await check_admin(db, req)) {
			const body = req.body as Body;

			if (is_string(body.text) && is_string(req.query.pid)) {
				if (
					!(await db_query(db, "UPDATE posts SET content = ? WHERE pid = ?", [
						body.text,
						req.query.pid
					]))
				) {
					return { status: HTTPStatus.InternalServerError };
				}

				return { status: HTTPStatus.OK };
			} else {
				if (!is_string(body.text)) {
					logger.warn("query is missing 'pid'");
				}
				if (!is_string(body.text)) {
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

		if (is_number_string(req.query.pid) && is_number(uid) && is_string(body.text)) {
			// check wether the post is from today / "accepts" comments
			const post_date = await db_query<Pick<PostEntry, "date">>(
				db,
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
			const data = await db_query<1>(
				db,
				"SELECT 1 FROM comments WHERE pid = ? AND uid = ? LIMIT 1",
				[req.query.pid, uid]
			);

			if (!data) {
				return { status: HTTPStatus.InternalServerError };
			}

			if (data.length === 0) {
				await db_query(db, "INSERT INTO comments (pid, uid, text) VALUES (?, ?, ?)", [
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
			}
			if (!is_number(uid)) {
				logger.warn("body is missing 'uid'");
			}
			if (!is_string(body.text)) {
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
		if (await check_admin(db, req)) {
			if (is_number_string(req.query.cid)) {
				if (!(await db_query(db, "DELETE FROM comments WHERE cid = ?", [req.query.cid]))) {
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
		if (await check_admin(db, req)) {
			const body = req.body as Body;

			if (is_number_string(req.query.cid) && is_string(body.answer)) {
				await db_query(db, "UPDATE comments SET answer = ? WHERE cid = ?", [
					body.answer,
					req.query.cid
				]);

				const data = await db_query<CommentEntry>(db, "SELECT * FROM comments WHERE cid = ?", [
					req.query.cid
				]);

				if (!data) {
					return { status: HTTPStatus.InternalServerError };
				}

				return { status: HTTPStatus.OK, json: data[0] };
			} else {
				if (!is_number_string(req.query.cid)) {
					logger.warn("query is missing 'cid'");
				}
				if (!is_string(body.answer)) {
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

			if (is_string(pid)) {
				const db_result = await db_query<PostEntry>(db, "SELECT * FROM posts WHERE pid = ?", [pid]);

				if (!db_result) {
					return { status: HTTPStatus.InternalServerError };
				}

				// only send post, if the date allows it
				if (new Date() >= new Date(db_result[0].date)) {
					return { status: HTTPStatus.OK, json: db_result[0] };
				} else {
					logger.log(
						`denied send-posts: requested post is in the future (date='${db_result[0].date}')`
					);

					return { status: HTTPStatus.Forbidden };
				}
			} else {
				logger.warn("query is missing 'pid'");

				return { status: HTTPStatus.BadRequest };
			}
		} else {
			if (await check_admin(db, req)) {
				const data = await db_query<PostEntry>(db, "SELECT * FROM posts");

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

		if (is_string(body.user) && is_string(body.password)) {
			const users = await db_query<UserEntry>(db, "SELECT * FROM users WHERE name = ? LIMIT 1", [
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
					password_hash_result = bcrypt.compareSync(body.password, user.password.toString("utf-8"));
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
					logger.debug(`rejected login: invalid password (uid='${user.uid}')`);

					return { status: HTTPStatus.Unauthorized };
				}
			}
		} else {
			if (!is_string(body.user)) {
				logger.warn("body is missing 'user'");
			}
			if (!is_string(body.password)) {
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
			db,
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
		if (is_string(req.query.pid)) {
			if (is_number_string(req.query.pid)) {
				return send_comments(req.query.pid);
			} else {
				return { status: HTTPStatus.BadRequest };
			}
		} else {
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

		if (is_string(req_pid)) {
			const pid = req_pid;

			// get the date of the post
			const db_result = await db_query<Pick<PostEntry, "date">>(
				db,
				"SELECT date FROM posts WHERE pid = ?",
				[pid]
			);

			if (!db_result) {
				return { status: HTTPStatus.InternalServerError };
			}

			// only send comment, if the date allows it
			if (new Date() >= new Date(db_result[0].date)) {
				data = await db_query<CommentEntry>(
					db,
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

			if (await check_admin(db, req)) {
				data = await db_query<CommentEntry>(db, "SELECT * FROM comments ORDER BY cid DESC");
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

	/**
	 * handle a request for a media upload
	 * @param req Request
	 * @returns client-response-message
	 */
	async function storage_upload(req: Request): Promise<Message> {
		if (await check_admin(db, req)) {
			return {
				status: HTTPStatus.OK,
				json: {
					url: path
						.join(
							"/api/storage/public/",
							Buffer.from(req.file?.originalname ?? "", "latin1").toString("utf-8")
						)
						.replace(" ", "_")
				}
			};
		} else {
			logger.warn(`user with uid=${extract_uid(req)} is no admin`);

			return { status: HTTPStatus.Forbidden };
		}
	}
})();
