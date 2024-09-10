import Ajv from "ajv";
import formatsPlugin from "ajv-formats";
import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import mysql from "promise-mysql";

import { logger } from "./logger";
import Config from "./config";

/**
 * checks wether a string can be parsed as an integer
 * @param value strint to be checked
 * @returns wether strin can be parsed as integer
 */
export function is_number_string(value: qs.ParsedQs["string"]): value is string {
	if (typeof value === "string") {
		return !isNaN(Number(value));
	} else {
		return false;
	}
}

export interface UserEntry {
	uid: number;
	name: string;
	password: Buffer;
	admin: 0 | 1;
}

export type Body = Record<string, unknown>;

// data stored in the session-cokie
export interface SessionCookie {
	name: string;
	admin: boolean;
	uid: number;
	token: string;
}
// data stored in the JSON webtoken
export interface JWT {
	uid: number;
}

export type Methods = "GET" | "POST" | "DELETE";

export enum HTTPStatus {
	Continue = 100,
	SwitchingProtocols = 101,
	EarlyHints = 103,
	OK = 200,
	Created = 201,
	Accepted = 202,
	NonauthoritativeInformation = 203,
	NoContent = 204,
	ResetContent = 205,
	PartialContent = 206,
	MultipleChoices = 300,
	MovedPermanently = 301,
	Found = 302,
	SeeOther = 303,
	NotModified = 304,
	Unused = 306,
	TemporaryRedirect = 307,
	Permanent = 308,
	BadRequest = 400,
	Unauthorized = 401,
	Forbidden = 403,
	NotFound = 404,
	MethodNotAllowed = 405,
	NotAcceptable = 406,
	ProxyAuthenticationRequired = 407,
	RequestTimeout = 408,
	Conflict = 409,
	Gone = 410,
	LengthRequired = 411,
	PreconditionFailed = 412,
	PayloadTooLarge = 413,
	URITooLong = 414,
	UnsupportedMediaType = 415,
	RangeNotSatisfiable = 416,
	ExpectationFailed = 417,
	Imateapot = 418,
	MisdirectedRequest = 421,
	TooEarly = 425,
	UpgradeRequired = 426,
	PreconditionRequired = 428,
	TooManyRequests = 429,
	RequestHeaderFieldsTooLarge = 431,
	UnavailableForLegalReasons = 451,
	InternalServerError = 500,
	NotImplemented = 501,
	BadGateway = 502,
	ServiceUnavailable = 503,
	GatewayTimeout = 504,
	HTTPVersionNotSupported = 505,
	VariantAlsoNegotiates = 506,
	NotExtended = 510,
	NetworkAuthenticationRequired = 511
}

export type Message = { status: HTTPStatus } & Pick<Partial<PayloadOptions>, keyof PayloadOptions>;
// Partial<
// 	{ message?: string; json: never } | { json?: object; message: never }
// >;

interface PayloadOptions {
	message: string;
	json: object;
	buffer: Buffer;
}

/**
 * wrap an asynchronous function into an iiaf (immediately invoked asynchronus function)
 * @param f asynchronous function for wrapping
 */
export function iiaf_wrap(f: () => Promise<void>) {
	void f();
}

export const ajv = new Ajv();
formatsPlugin(ajv);

/**
 * format a date into a string in the style yyyy-mm-dd
 * @param dt date-object
 * @returns formatted date
 */
export function format_date(dt: Date): string {
	return [
		dt.getFullYear().toString(),
		(dt.getMonth() + 1).toString().padStart(2, "0"),
		dt.getDate().toString().padStart(2, "0")
	].join("-");
}

/**
 * check wether an object has all the keys with the specified types
 * @param obj unknown object to check
 * @param keys object with key = obj entry, value = type
 * @returns wether obj contains all keys and types specified in keys
 */
export function check_obj_keys<
	T extends Record<
		string,
		// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
		bigint | boolean | Function | number | object | string | symbol | undefined
	>
>(obj: Record<string, unknown>, keys: T): obj is { [K in keyof T]: T[K] } {
	const ret_obj = Object.entries(keys).map(([key, value]) => typeof obj[key] === value);

	return ret_obj.every((ele) => ele);
}

/**
 * check wether an unknown is of type string
 * @param v unknown variable
 * @returns wether v is of type string
 */
export function is_string(v: unknown): v is string {
	return typeof v === "string";
}

/**
 * check wether an unknown is of type number
 * @param v unknown variable
 * @returns wether v is of type number
 */
export function is_number(v: unknown): v is number {
	return typeof v === "number";
}

/**
 * check wether an unknown is of type boolean
 * @param v unknown variable
 * @returns wether v is of type boolean
 */
export function is_boolean(v: unknown): v is boolean {
	return typeof v === "boolean";
}

/**
 * check wether an unknown is of type object
 * @param v unknown variable
 * @returns wether v is of type object
 */
export function is_object(v: unknown): v is object {
	return typeof v === "object";
}

/**
 * populate and send the response
 * @param res Reponse to be populated
 * @param message Data to be send
 */
export function send_response(res: Response, message: Message) {
	// attach the returned status
	res.status(message.status);

	// res.set("Content-Type", "charset=UTF-8")

	// send (if available) the JSON object
	if (message.json !== undefined) {
		res.json(message.json);
	} else if (message.buffer !== undefined) {
		res.setHeader("Content-Type", "application/octet-stream");
		res.send(message.buffer);
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
export function extract_session_cookie(req: Request): SessionCookie | undefined {
	return req.cookies.session as SessionCookie | undefined;
}

/**
 * Check wether the request has a valid session-token
 * @param req Request with the session-token
 * @returns wether the request has a valid session token
 */
export function check_permission(req: Request): boolean {
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
 * Extract the uid from a token
 * @param req Request
 * @returns uid; null if there is no session-token in req
 */
export function extract_uid(req: Request): number | null {
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
 * Check wether the request came from an admin
 * @param db database
 * @param req Request with the session-cookie
 * @returns wether the request came from an admin
 */
export async function check_admin(db: mysql.Connection, req: Request): Promise<boolean> {
	const uid = extract_uid(req);

	if (typeof uid === "number") {
		const data = await db_query<Pick<UserEntry, "admin">>(
			db,
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
 * wraps a db.query inside a try-catch and logs errors
 * @param db database
 * @param query sql-query
 * @param values values for the query
 * @returns db.query<T>(querry, values)
 */
export async function db_query<T = unknown>(
	db: mysql.Connection,
	query: string,
	values?: unknown[]
): Promise<T[] | false> {
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

/**
 * Check wether a path tries to leave it's root directory
 * @param pth path to check
 * @returns wether pth tries to escape
 */
export function check_path_escapes(pth: string): boolean {
	const upload_dir = Config.get_upload_dir();
	const pth_resolved = Config.get_upload_dir(pth);

	return pth_resolved.includes(upload_dir);
}
