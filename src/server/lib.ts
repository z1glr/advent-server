import Ajv from "ajv";
import formatsPlugin from "ajv-formats";

export function query_is_string(value: qs.ParsedQs["string"]): value is string {
	if (typeof value === "string") {
		return !isNaN(Number(value));
	} else {
		return false;
	}
}

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

export function iiaf_wrap(f: () => Promise<void>) {
	void f();
}

export const ajv = new Ajv();
formatsPlugin(ajv);
