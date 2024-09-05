import express, { Request, Response } from "express";
import bcrypt from "bcrypt";
import mysql from "promise-mysql";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";

import Config, { HTTPStatus } from "./config";
import { logger } from "./logger";

// TODO: add res.status().send("TEXT HERE");
// TODO: add logging
// TODO: only allow posts-retrieve up to current date (maybe client-side too for cursor / design, server returns 403)
// TODO: catch more stuff
// TODO: user-delte: delete comments

interface JWT {
	uid: number;
}

interface SessionCookie {
	uid: number;
	name: string;
	admin: boolean;
	token: string;
}

(async () => {
	const app = express();

	// app.use(function(req, res, next) {
	// 	res.header("Access-Control-Allow-Origin", "http://172.25.220.64:5173");
	// 	res.header("Access-Control-Allow-Methods", "POST,GET,DELETE");
	// 	res.header("Access-Control-Allow-Headers", "Origin,Content-Type");
	// 	res.header("Access-Control-Allow-Credentials", "true");
	// 	next();
	// });
	app.use(express.json());
	app.use(cookieParser());
	
	// connect to the database
	const db = await mysql.createConnection(Config.database);
	logger.log("Connected to database");
	
	type Methods = "GET" | "POST" | "DELETE";
	type Message = { status: number; } & Partial<{ message?: string; json: never; } | { json?: object; message: never; }>;

	type API = { [K in Methods]: Record<string, (req: Request, res: Response) => Promise<Message>> };
	const api: API = {
		GET: {
			users: get_users,
			posts: get_posts,
			logout,
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
	};

	// add the listeners
	Object.entries(api).forEach(([method, paths]) => {
		const function_map: { [K in Methods]: (path: string, callback: (req: Request, res: Response) => void ) => void}  = {
			GET: app.get.bind(app),
			POST: app.post.bind(app),
			DELETE: app.delete.bind(app)
		};

		Object.entries(paths).forEach(([path, func]) => {
			function_map[method as Methods]("/api/" + path, async (req, res) => {
				logger.debug(`HTTP ${method} request: ${req.url}`)

				const check_perm_res = await check_permission(req, res);

				if (check_perm_res) {
					const response_values = await func(req, res);

					res.status(response_values.status);

					if (response_values.json !== undefined) {
						res.json(response_values.json);
					} else {
						res.send(response_values.message);
					}
				}
			});
			logger.trace(`Added API-endpoint for '/api/${path}'`)
		});
	});
	// handle methods without session-token seperately
	app.get("/api/welcome", async (req, res) => {
		welcome(req, res);
	});
	app.post("/api/login", async (req, res) => {
		login(req, res);
	});

	async function check_permission(req: Request, res: Response): Promise<boolean> {
		const session: SessionCookie | undefined = req.cookies.session;

		if (session !== undefined) {
			try {
				jwt.verify(session.token, Config.jwt_secret);

				return true;
			} catch { }
		}

		res.status(HTTPStatus.Unauthorized).send("invalid session-token");

		return false;
	}
	
	async function check_admin(req: Request): Promise<boolean> {
		try {
			const uid = await extract_uid(req);
			const data = await db.query("SELECT admin FROM users WHERE uid = ?", [uid]);

			return data[0].admin === 1;
		}  catch {
			return false;
		}
	}

	async function extract_uid(req: Request): Promise<number> {
		return (jwt.verify(req.cookies.session.token, Config.jwt_secret) as JWT).uid
	}

	async function get_users(req: Request, res: Response): Promise<Message> {
		return send_users(res);
	}
	
	async function add_user(req: Request, res: Response): Promise<Message> {
		if (typeof req.body.user === "string" && typeof req.body.password === "string") {
			try {
				// check, wether the user already exists
				const user_available = (await db.query("SELECT 1 FROM users WHERE name = ? LIMIT 1", [req.body.user])).length === 0;

				if (user_available) {
					const salt = await bcrypt.genSalt();
		
					const password_hash = await bcrypt.hash(req.body.password, salt);
					
					await db.query("INSERT INTO users (name, password) VALUES (?, ?)", [req.body.user, password_hash]);

					return send_users(res);
				} else {
					return { status: HTTPStatus.Conflict, message: "user already exists" };
				}
			} catch (error) {
				return { status: HTTPStatus.InternalServerError };
			}
		} else {
			return { status: HTTPStatus.BadRequest };
		}
	}

	async function modify_user(req: Request, res: Response): Promise<Message> {
		if (await check_admin(req)) {
			if (queryIsString(req.query.uid) && typeof req.body.admin === "boolean" && typeof req.body.password === "string") {
				// if it is the admin, user overwrite 'admin' to true
				const user = await db.query("SELECT name FROM users WHERE uid = ?", [req.query.uid]);

				if (user[0].name === "admin") {
					req.body.admin = true;
				}

				// only save the password, if it isn't empty
				if (req.body.password.length > 0) {
					const salt = await bcrypt.genSalt();
			
					const password_hash = await bcrypt.hash(req.body.password, salt);

					await db.query("UPDATE users SET password = ?, admin = ? WHERE uid = ?", [password_hash, req.body.admin, req.query.uid]);
				} else {
					await db.query("UPDATE users SET admin = ? WHERE uid = ?", [req.body.admin, req.query.uid]);
				}

				return send_users(res);
			} else {
				return { status: HTTPStatus.BadRequest };
			}
		} else {
			return { status: HTTPStatus.Unauthorized };
		}
	}
	
	async function delete_user(req: Request, res: Response): Promise<Message> {
		if (await check_admin(req)) {
			logger.trace("delete_user: admin-check successful");

			if (queryIsString(req.query.uid)) {
				logger.trace("delete_user: arguments are valid");
				try {
					await db.query("DELETE FROM users WHERE uid=?", [req.query.uid]);

					logger.trace("delete_user: deleted user from database");
	
					const send_user_result = send_users(res);
					logger.trace("delete_user: send users to client");
					return send_user_result;
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

	async function save_post(req: Request, res: Response): Promise<Message> {
		if (await check_admin(req)) {
			if (typeof req.body.title === "string" && typeof req.body.text === "string" && typeof req.query.pid === "string") {
				await db.query("UPDATE posts SET title = ?, content = ? WHERE pid = ?", [req.body.title, req.body.text, req.query.pid]);

				return { status: HTTPStatus.OK };
			} else {
				return { status: HTTPStatus.BadRequest };
			}
		} else {
			return { status: HTTPStatus.Unauthorized };
		}

		res.send();
	}
	
	async function add_comment(req: Request, res: Response): Promise<Message> {
		const uid = await extract_uid(req);

		if (queryIsString(req.query.pid) && typeof uid === "number" && typeof req.body.text === "string") {
			try {
				// check wether the user already posted
				const data = await db.query("SELECT 1 FROM comments WHERE pid = ? AND uid = ? LIMIT 1", [req.query.pid, uid]);

				if (data.length === 0) {
					await db.query("INSERT INTO comments (pid, uid, text) VALUES (?, ?, ?)", [req.query.pid, uid, req.body.text]);

					return send_comments(res, parseInt(req.query.pid));
				} else {
					return { status: HTTPStatus.Conflict, message: "user has already commented on post" };
				}
			} catch {
				return { status: HTTPStatus.InternalServerError };;
			}
		} else {
			return { status: HTTPStatus.BadRequest };
		}
	};

	async function delete_comment(req: Request, res: Response): Promise<Message> {
		if (await check_admin(req)) {
			if (typeof req.body.cid === "number" && typeof req.body.cid === "number") {
				try {
					await db.query("DELETE FROM comments WHERE cid = ?", [req.body.cid]);
					
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
	
	async function add_answer(req: Request, res: Response): Promise<Message> {
		if (await check_admin(req)) {
			logger.trace("add_answer: admin-check succesful");

			if (queryIsString(req.query.cid) && typeof req.body.answer === "string") {
				logger.trace("add_answer: arguments are valid");

				try {
					await db.query("UPDATE comments SET answer = ? WHERE cid = ?", [req.body.answer, req.query.cid]);
					logger.trace("add_answer: wrote answer to database");

					const data = await db.query("SELECT * FROM comments WHERE cid = ?", [req.query.cid]);
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
	};
	
	async function get_posts(req: Request, res: Response): Promise<Message> {
		if (queryIsString(req.query.pid)) {
			const pid = parseInt(req.query.pid);

			if (!isNaN(pid)) {
				return send_posts(res, pid);
			} else {
				return { status: HTTPStatus.BadRequest };
			}
		} else {
			return send_posts(req, res);
		}
	}

	async function login(req: Request, res: Response) {
		if (typeof req.body.user === "string" && typeof req.body.password === "string") {
			const response_wrong = "wrong username or password";

			try {
				const users: { uid: number; name: string; password: Buffer; admin: boolean | null; }[] = await db.query("SELECT * FROM users WHERE name = ? LIMIT 1", [req.body.user]);

				if (users.length === 0) {
					res.status(HTTPStatus.Unauthorized).send(response_wrong);
				} else {
					const user = users[0];

					if (await bcrypt.compare(req.body.password, user.password.toString("utf-8"))) {
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

						res.cookie("session", cookie, { httpOnly: true, sameSite: 'strict', maxAge: Config.session_expire });

						res.status(HTTPStatus.OK).json({
							...response,
							loggedIn: true
						});
					} else {
						res.status(HTTPStatus.Unauthorized).send(response_wrong);
					}
				}
			} catch {
				res.status(HTTPStatus.InternalServerError).send();
			}
		} else {
			res.status(HTTPStatus.BadRequest).send();
		}
	}

	async function welcome(req: Request, res: Response) {
		const session = req.cookies.session;

		const return_object = {
			name: null,
			admin: null,
			loggedIn: false,
			uid: null
		};

		if (session !== undefined) {
			return_object.name = session.name;
			return_object.admin = session.admin;
			return_object.loggedIn = true;
			return_object.uid = session.uid;
		}

		res.status(HTTPStatus.OK).json(return_object);
	}

	async function logout(req: Request, res: Response): Promise<Message> {
		res.clearCookie("session");

		return {
			status: HTTPStatus.OK,
			json: {
				uid: 0,
				name: "",
				admin: false,
				loggedIn: false
			}
		};
	}
	
	app.listen(61016, "172.25.220.64");
	
	async function send_users(res: Response): Promise<Message> {
		const data_raw: { uid: number; name: string; admin: number; }[] = await db.query("SELECT uid, name, admin FROM users");

		const data: { uid: number; name: string; admin: boolean; }[] = data_raw.map(user => {
			return {
				...user,
				admin: Boolean(user.admin)
			}
		});

		return { status: HTTPStatus.OK, json: data };
	}
	
	async function get_comments(req: Request, res: Response): Promise<Message> {
		if (typeof req.query.pid === "string") {
			const pid = parseInt(req.query.pid);

			if (!isNaN(pid)) {
				return send_comments(res, pid);
			} else {
				return { status: HTTPStatus.BadRequest };
			}
		} else {
			return send_comments(req, res);
		}
	}

	async function send_posts(req: Request, res: Response): Promise<Message>;
	async function send_posts(res: Response, pid: number): Promise<Message>;
	async function send_posts(req_res: Request | Response, res_pid: Response | number ): Promise<Message> {
		let data;
		let res: Response;

		if (typeof res_pid === "number") {
			const pid = res_pid;
			res = req_res as Response;

			data = (await db.query("SELECT * FROM posts WHERE pid = ?", [pid]))[0];
		} else {
			const req = req_res as Request;
			res = res_pid;

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

	async function send_comments(req: Request, res: Response): Promise<Message>;
	async function send_comments(res: Response, pid: number): Promise<Message>;
	async function send_comments(req_res: Request | Response, res_pid: Response | number ): Promise<Message> {
		let data;
		let res: Response;

		if (typeof res_pid === "number") {
			const pid = res_pid;
			res = req_res as Response;

			data = await db.query("SELECT * FROM comments WHERE pid=? ORDER BY cid DESC", [pid]);
		} else {
			const req = req_res as Request;
			res = res_pid;

			if (await check_admin(req)) {
				data = await db.query("SELECT * FROM comments ORDER BY cid DESC");
			} else {
				return { status: HTTPStatus.Unauthorized };
			}
		}

		if (data !== undefined) {
			return { status: HTTPStatus.OK, json: data};
		} else {
			return { status: HTTPStatus.InternalServerError };
		}
	}
})();

function queryIsString(value: qs.ParsedQs["string"]): value is string {
	if (typeof value === "string") {
		return !isNaN(Number(value));
	} else {
		return false;
	}
}