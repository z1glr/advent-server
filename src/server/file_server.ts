import path from "path";
import fs from "fs";
// import mime from "mime-types";
import { IRouter, IRouterMatcher, Request, Response } from "express";
import { Express } from "express";
import mysql from "promise-mysql";

import { logger } from "./logger";
import Config from "./config";
import {
	Body,
	check_admin,
	check_path_escapes,
	check_permission,
	HTTPStatus,
	iiaf_wrap,
	is_object,
	is_string,
	Message,
	Methods,
	send_response
} from "./lib";

/**
 * Handle the requests of vuefinder
 */
export default class FileServer {
	private db: mysql.Connection;

	private endpoint_map: Pick<
		Record<Methods, Record<string, (req: Request) => Message>>,
		"GET" | "POST"
	> = {
		// eslint-disable-next-line @typescript-eslint/naming-convention
		GET: {
			index: (req: Request) => this.get_files(req),
			preview: (req: Request) => this.get_preview(req),
			subfolders: (req: Request) => this.get_subfolders(req),
			download: (req: Request) => this.get_download(req)
		},
		// eslint-disable-next-line @typescript-eslint/naming-convention
		POST: {
			newfolder: (req: Request) => this.create_new_folder(req),
			rename: (req: Request) => this.rename_file(req),
			move: (req: Request) => this.rename_files(req),
			delete: (req: Request) => this.post_delete(req)
		}
	};

	/**
	 * @param app express-instance to use
	 * @param db database
	 */
	constructor(app: Express, db: mysql.Connection) {
		this.db = db;

		// map the individual method-functions into an object
		const function_map: Pick<Record<Methods, IRouterMatcher<IRouter>>, "GET" | "POST"> = {
			/* eslint-disable @typescript-eslint/naming-convention */
			GET: app.get.bind(app),
			POST: app.post.bind(app)
			/* eslint-enable @typescript-eslint/naming-convention */
		};

		(Object.entries(function_map) as ["GET" | "POST", IRouterMatcher<IRouter>][]).forEach(
			([method, router]) => {
				router("/api/storage/browse", (req, res) => {
					iiaf_wrap(async () => {
						logger.log(`HTTP ${method} request: ${req.url}`);

						//check wether the session-token is valid and the user is an admin
						if (check_permission(req) && (await check_admin(db, req))) {
							if (is_string(req.query.q) && this.endpoint_map[method][req.query.q] !== undefined) {
								const message = this.endpoint_map[method][req.query.q](req);

								send_response(res, message);
							} else {
								logger.log("query is missing 'q");

								res.status(HTTPStatus.BadRequest).send();
							}
						} else {
							// invalid session-token
							send_response(res, { status: HTTPStatus.Forbidden });
						}
					});
				});
			}
		);
	}

	/**
	 * handle list-file-requests
	 * @param req Request
	 * @returns client-response-message
	 */
	private get_files(req: Request): Message {
		// if there is no adapter specified, use PUBLIC
		const adapter =
			is_string(req.query.adapter) && req.query.adapter !== "null" ? req.query.adapter : "PUBLIC";

		// if there is no path specified, use the root "/"
		const pth = extract_path(is_string(req.query.path) ? req.query.path : "", adapter);
		const pth_local = Config.get_upload_dir(pth);

		if (check_path_escapes(pth)) {
			const files = fs.readdirSync(pth_local);

			return {
				status: HTTPStatus.OK,
				json: {
					adapter,
					storages: [adapter],
					dirname: pth,
					files: files.map((ff_name) => {
						const ff = path.join(pth, ff_name);
						const ff_local = Config.get_upload_dir(ff);

						return to_vuefinder_resource(adapter, ff, fs.statSync(ff_local));
					})
				}
			};
		} else {
			logger.warn(`request tried to escape its directory (pth='${pth}')`);

			return {
				status: HTTPStatus.Forbidden
			};
		}
	}

	/**
	 * send a preview
	 * @param req Request
	 * @returns client-response-message
	 */
	private get_preview(req: Request): Message {
		if (is_string(req.query.path) && is_string(req.query.adapter)) {
			return {
				status: HTTPStatus.OK,
				buffer: fs.readFileSync(
					Config.get_upload_dir(extract_path(req.query.path, req.query.adapter))
				)
			};
		} else {
			if (!is_string(req.query.path)) {
				logger.warn("query is missing 'path");
			}
			if (!is_string(req.query.adapter)) {
				logger.warn("query is missing 'adaptor");
			}

			return { status: HTTPStatus.BadRequest };
		}
	}

	/**
	 * get the subdirectories of a path
	 * @param req Request
	 * @returns client-response-message
	 */
	private get_subfolders(req: Request): Message {
		const query = req.query;
		if (is_string(query.adapter) && is_string(query.path)) {
			const adapter = query.adapter;
			const pth = extract_path(query.path, adapter);
			const pth_local = Config.get_upload_dir(pth);

			return {
				status: HTTPStatus.OK,
				json: {
					folders: fs
						.readdirSync(pth_local)
						.map((ff) => {
							const stats = fs.statSync(path.join(pth_local, ff));

							if (stats.isDirectory()) {
								return to_vuefinder_resource(adapter, path.join(pth, ff), stats);
							} else {
								return null;
							}
						})
						.filter((ff) => ff !== null)
				}
			};
		} else {
			if (!is_string(query.adapter)) {
				logger.log("query is missing 'adapter'");
			}
			if (!is_string(query.path)) {
				logger.log("query is missing 'path'");
			}

			return { status: HTTPStatus.BadRequest };
		}
	}

	/**
	 * downloads a file
	 * @param req Reqeust
	 * @returns client-response-message
	 */
	private get_download(req: Request): Message {
		return this.get_preview(req);
	}

	/**
	 * create a new folder
	 * @param req Request
	 * @returns client-response-message
	 */
	private create_new_folder(req: Request): Message {
		const body = req.body as Body;

		if (
			is_string(req.query.adapter) &&
			is_string(req.query.path) &&
			is_object(body) &&
			is_string(body.name)
		) {
			fs.mkdirSync(path.join(Config.server.upload_dir, req.query.path, body.name));

			return this.get_files(req);
		} else {
			if (!is_string(req.query.adapter)) {
				logger.log("req is missing 'adapter'");
			}
			if (!is_string(req.query.path)) {
				logger.log("req is missing 'path'");
			}
			if (!is_object(body)) {
				logger.log("body is missing");
			}
			if (!is_string(body.name)) {
				logger.log("body is missing 'name'");
			}

			return { status: HTTPStatus.BadRequest };
		}
	}

	/**
	 * rename a file
	 * @param req Request
	 * @returns client-response-message
	 */
	private rename_file(req: Request): Message {
		const query = req.query;
		const body = req.body as Body;

		if (is_string(query.adapter) && is_string(body.item) && is_string(body.name)) {
			const orig = Config.get_upload_dir(extract_path(body.item, query.adapter));
			const dest = path.join(path.dirname(orig), body.name);

			fs.renameSync(orig, dest);

			return this.get_files(req);
		} else {
			if (!is_string(query.adapter)) {
				logger.log("query is missing 'adapter'");
			}
			if (!is_string(body.item)) {
				logger.log("body is missing 'item'");
			}
			if (!is_string(body.name)) {
				logger.log("body is missing 'name'");
			}

			return { status: HTTPStatus.BadRequest };
		}
	}

	/**
	 * moves files
	 * @param req Request
	 * @returns client-response-message
	 */
	private rename_files(req: Request): Message {
		const body = req.body as Body;

		if (is_string(req.query.adapter) && is_string(body.item) && is_items_array(body.items)) {
			const adapter = req.query.adapter;
			const destination = Config.get_upload_dir(extract_path(body.item, adapter));

			body.items.forEach((ff) => {
				const orig = extract_path((ff as { path: string }).path, adapter);

				fs.renameSync(Config.get_upload_dir(orig), path.join(destination, path.basename(orig)));
			});

			return this.get_files(req);
		} else {
			if (!is_string(req.query.adapter)) {
				logger.log("query is missing 'adapter'");
			}
			if (!is_string(body.item)) {
				logger.log("body is missing 'item'");
			}
			if (!is_items_array(body.items)) {
				logger.log("body is missing 'items'");
			}

			return { status: HTTPStatus.BadRequest };
		}
	}

	/**
	 * delete files
	 * @param req Request
	 * @returns client-response-message
	 */
	private post_delete(req: Request): Message {
		const query = req.query;
		const body = req.body as Body;

		if (is_string(query.adapter) && Array.isArray(body.items) && is_items_array(body.items)) {
			const adapter = query.adapter;

			body.items.forEach((ff) => {
				const local_path = Config.get_upload_dir(extract_path(ff.path, adapter));

				if (ff.type === "file") {
					fs.rmSync(local_path);
				} else {
					fs.rmdirSync(local_path, { recursive: true });
				}
			});

			return this.get_files(req);
		} else {
			if (is_string(query.adapter)) {
				logger.log("query is missing 'adapter'");
			}
			if (Array.isArray(body.items)) {
				logger.log("body is missing 'items'");
			}
			if (is_items_array(body.items)) {
				logger.log("body is missing 'items'");
			}

			return { status: HTTPStatus.BadRequest };
		}
	}
}

/**
 * remove the adapter from the path
 * @param pth path with uri
 * @param adapter adapter used in the uri
 * @returns path without adapter
 */
function extract_path(pth: string, adapter: string): string {
	return `${pth.replace(`${adapter}://`, "")}`;
}

/**
 * craft a vuefinder-resource for a file
 * @param adapter adapter for the path
 * @param pth path of the directory
 * @param info file-info
 * @returns vuefinder-resource
 */
function to_vuefinder_resource(adapter: string, pth: string, info: fs.Stats) {
	const mime_type = false; //mime.lookup(pth);

	const pth_parse = path.parse(pth);

	if (pth[0] === "/") {
		pth = pth.slice(1);
	}

	const data = {
		type: info.isDirectory() ? "dir" : "file",
		path: `${adapter}://${pth}`,
		visibility: "public",
		last_modified: info.mtime.getTime() / 1000,
		mime_type: mime_type !== false ? mime_type : "text/plain",
		extra_metadata: [],
		basename: pth_parse.base,
		extension: pth_parse.ext,
		storage: adapter,
		file_size: info.size
	};

	return data;
}

/**
 * checks wether a unknown is an array of file-definitions ({ path: string; type: string; }[])
 * @param a unknown variable
 * @returns wether a is of type: { path: string; type: string; }[]
 */
function is_items_array(a: unknown): a is Array<{ path: string; type: string }> {
	return (
		Array.isArray(a) &&
		a.every((ele) => {
			const obj = ele as Record<string, unknown>;

			return is_object(ele) && !Array.isArray(ele) && is_string(obj.path) && is_string(obj.type);
		})
	);
}
