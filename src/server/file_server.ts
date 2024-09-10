import path from "path";
import fs from "fs";
import mime from "mime-types";
import { Body, HTTPStatus, is_object, is_string, Message, Methods } from "./lib";
import Config from "./config";
import { Request, Response } from "express";
import { Express } from "express";

/**
 * Handle the requests of vuefinder
 */
export default class FileServer {
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
	 *
	 * @param app express-instance to use
	 */
	constructor(app: Express) {
		app.get("/api/storage/browse", (req: Request, res: Response) => {
			void this.get(req, res);
		});

		app.post("/api/storage/browse", (req: Request, res: Response) => {
			void this.post(req, res);
		});
	}

	/**
	 * handles all GET-requests
	 * @param req Request
	 * @param res Response
	 */
	get(req: Request, res: Response) {
		if (typeof req.query.q === "string") {
			if (this.endpoint_map.GET[req.query.q] !== undefined) {
				const message = this.endpoint_map.GET[req.query.q]?.(req);

				res.status(message.status);

				if (message.json !== undefined) {
					res.json(message.json);
				} else if (message.buffer !== undefined) {
					res.setHeader("Content-Type", "application/octet-stream");
					res.send(message.buffer);
				} else {
					res.send(message.message);
				}
			} else {
				res.status(HTTPStatus.NotImplemented).send();
			}
		} else {
			res.status(HTTPStatus.BadRequest).send();
		}
	}

	/**
	 * Handle all POST-requests
	 * @param req Request
	 * @param res Response
	 */
	post(req: Request, res: Response) {
		if (typeof req.query.q === "string") {
			if (this.endpoint_map.POST[req.query.q] !== undefined) {
				const message = this.endpoint_map.POST[req.query.q]?.(req);

				res.status(message.status);

				if (message.json !== undefined) {
					res.json(message.json);
				} else if (message.buffer !== undefined) {
					res.setHeader("Content-Type", "application/octet-stream");
					res.send(message.buffer);
				} else {
					res.send(message.message);
				}
			} else {
				res.status(HTTPStatus.NotImplemented).send();
			}
		} else {
			res.status(HTTPStatus.BadRequest).send();
		}
	}

	/**
	 * handle list-file-requests
	 * @param req Request
	 * @returns client-response-message
	 */
	protected get_files(req: Request): Message {
		const adapter =
			is_string(req.query.adapter) && req.query.adapter !== "null" ? req.query.adapter : "PUBLIC";

		const pth = this.extract_path(is_string(req.query.path) ? req.query.path : "/", adapter);
		const pth_local = Config.get_upload_dir(pth);

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

					return this.to_vuefinder_resource(adapter, ff, fs.statSync(ff_local));
				})
			}
		};
	}

	/**
	 * send a preview
	 * @param req Request
	 * @returns client-response-message
	 */
	protected get_preview(req: Request): Message {
		if (typeof req.query.path === "string" && typeof req.query.adapter === "string") {
			return {
				status: HTTPStatus.OK,
				buffer: fs.readFileSync(
					Config.get_upload_dir(this.extract_path(req.query.path, req.query.adapter))
				)
			};
		} else {
			return { status: HTTPStatus.BadRequest };
		}
	}

	/**
	 * get the subdirectories of a path
	 * @param req Request
	 * @returns client-response-message
	 */
	protected get_subfolders(req: Request): Message {
		const query = req.query;
		if (is_string(query.adapter) && is_string(query.path)) {
			const adapter = query.adapter;
			const pth = this.extract_path(query.path, adapter);
			const pth_local = Config.get_upload_dir(pth);

			return {
				status: HTTPStatus.OK,
				json: {
					folders: fs
						.readdirSync(pth_local)
						.map((ff) => {
							const stats = fs.statSync(path.join(pth_local, ff));

							if (stats.isDirectory()) {
								return this.to_vuefinder_resource(adapter, path.join(pth, ff), stats);
							} else {
								return null;
							}
						})
						.filter((ff) => ff !== null)
				}
			};
		} else {
			return { status: HTTPStatus.BadRequest };
		}
	}

	/**
	 * downloads a file
	 * @param req Reqeust
	 * @returns client-response-message
	 */
	protected get_download(req: Request): Message {
		return this.get_preview(req);
	}

	/**
	 * create a new folder
	 * @param req Request
	 * @returns client-response-message
	 */
	protected create_new_folder(req: Request): Message {
		const body = req.body as Body;

		if (
			typeof req.query.adapter === "string" &&
			typeof req.query.path === "string" &&
			typeof body === "object" &&
			typeof body.name === "string"
		) {
			fs.mkdirSync(path.join(Config.server.upload_dir, req.query.path, body.name));

			return this.get_files(req);
		} else {
			return { status: HTTPStatus.NotImplemented };
		}
	}

	/**
	 * rename a file
	 * @param req Request
	 * @returns client-response-message
	 */
	protected rename_file(req: Request): Message {
		const query = req.query;
		const body = req.body as Body;

		if (is_string(query.adapter) && is_string(body.item) && is_string(body.name)) {
			const orig = Config.get_upload_dir(this.extract_path(body.item, query.adapter));
			const dest = path.join(path.dirname(orig), body.name);

			fs.renameSync(orig, dest);

			return this.get_files(req);
		} else {
			return { status: HTTPStatus.NotImplemented };
		}
	}

	/**
	 * moves files
	 * @param req Request
	 * @returns client-response-message
	 */
	protected rename_files(req: Request): Message {
		const body = req.body as Body;

		if (is_string(req.query.adapter) && is_string(body.item) && is_items_array(body.items)) {
			const adapter = req.query.adapter;
			const destination = Config.get_upload_dir(this.extract_path(body.item, adapter));

			body.items.forEach((ff) => {
				const orig = this.extract_path((ff as { path: string }).path, adapter);

				fs.renameSync(Config.get_upload_dir(orig), path.join(destination, path.basename(orig)));
			});

			return this.get_files(req);
		} else {
			return { status: HTTPStatus.BadRequest };
		}
	}

	/**
	 * delete files
	 * @param req Request
	 * @returns client-response-message
	 */
	protected post_delete(req: Request): Message {
		const query = req.query;
		const body = req.body as Body;

		if (is_string(query.adapter) && Array.isArray(body.items) && is_items_array(body.items)) {
			const adapter = query.adapter;

			body.items.forEach((ff) => {
				const local_path = Config.get_upload_dir(this.extract_path(ff.path, adapter));

				if (ff.type === "file") {
					fs.rmSync(local_path);
				} else {
					fs.rmdirSync(local_path, { recursive: true });
				}
			});

			return this.get_files(req);
		} else {
			return { status: HTTPStatus.BadRequest };
		}
	}

	/**
	 * remove the adapter from the path
	 * @param pth path with uri
	 * @param adapter adapter used in the uri
	 * @returns path without adapter
	 */
	private extract_path(pth: string, adapter: string): string {
		return pth.replace(`${adapter}:/`, "");
	}

	/**
	 * craft a vuefinder-resource for a file
	 * @param adapter adapter for the path
	 * @param pth path of the directory
	 * @param info file-info
	 * @returns vuefinder-resource
	 */
	private to_vuefinder_resource(adapter: string, pth: string, info: fs.Stats) {
		const mime_type = mime.lookup(pth);

		const pth_parse = path.parse(pth);

		if (pth[0] === "/") {
			pth = pth.slice(1);
		}

		const data = {
			type: info.isDirectory() ? "dir" : "file",
			path: `${adapter}:/${pth}`,
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
