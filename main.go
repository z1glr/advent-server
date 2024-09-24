package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"reflect"
	"strconv"
	"strings"
	"time"

	"github.com/go-sql-driver/mysql"
	"github.com/golang-jwt/jwt/v5"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
	"golang.org/x/crypto/bcrypt"
	"golang.org/x/text/cases"
	"golang.org/x/text/language"
	"gopkg.in/natefinch/lumberjack.v2"
)

var logger zap.Logger
var db *sql.DB

type responseMessage struct {
	Status  int
	Message *string
	Data    any
	Error   error
}

func (result responseMessage) send(w http.ResponseWriter) {
	if result.Error != nil {
		logger.Sugar().Errorf("Error while handling request: %q", result.Error)
	} else {
		if result.Data != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(result.Status)

			json.NewEncoder(w).Encode(result.Data)
		} else {
			w.WriteHeader(result.Status)

			if result.Message != nil {
				fmt.Fprintf(w, *result.Message)
			}
		}
	}
}

func init() {
	// initialize the logger
	stdout := zapcore.AddSync(os.Stdout)

	file := zapcore.AddSync(&lumberjack.Logger{
		Filename: "logs/server.log",
		MaxSize:  10,
	})

	level, err := zapcore.ParseLevel(Config.LogLevel)

	if err != nil {
		level = zapcore.InfoLevel
	}

	productionConfig := zap.NewProductionEncoderConfig()
	productionConfig.TimeKey = "timestamp"
	productionConfig.EncodeTime = zapcore.ISO8601TimeEncoder

	developmentConfig := zap.NewDevelopmentEncoderConfig()
	developmentConfig.EncodeLevel = zapcore.CapitalColorLevelEncoder

	consoleEncoder := zapcore.NewConsoleEncoder(developmentConfig)
	fileEncoder := zapcore.NewJSONEncoder(productionConfig)

	core := zapcore.NewTee(
		zapcore.NewCore(consoleEncoder, stdout, level),
		zapcore.NewCore(fileEncoder, file, level),
	)

	zap.ReplaceGlobals(zap.Must(zap.NewProduction()))

	logger = *zap.New(core, zap.AddCaller())

	// database
	sqlConfig := mysql.Config{
		AllowNativePasswords: true,
		Net:                  "tcp",
		User:                 Config.Database.User,
		Passwd:               Config.Database.Password,
		Addr:                 Config.Database.Host,
		DBName:               Config.Database.Database,
	}

	db, _ = sql.Open("mysql", sqlConfig.FormatDSN())
	db.SetMaxIdleConns(10)
	db.SetMaxIdleConns(100)
	db.SetConnMaxLifetime(time.Minute)
}

type WelcomeMessage struct {
	Admin    bool `json:"admin"`
	LoggedIn bool `json:"logged_in"`
	Uid      int  `json:"uid"`
}

func dbSelect[T any](table string, where string, args ...any) ([]T, error) {
	// validate columns against struct T
	tType := reflect.TypeOf(new(T)).Elem()
	columns := make([]string, tType.NumField())

	validColumns := make(map[string]any)
	for ii := 0; ii < tType.NumField(); ii++ {
		field := tType.Field(ii)
		validColumns[strings.ToLower(field.Name)] = struct{}{}
		columns[ii] = strings.ToLower(field.Name)
	}

	for _, col := range columns {
		if _, ok := validColumns[strings.ToLower(col)]; !ok {
			return nil, fmt.Errorf("invalid column: %s for struct type %T", col, new(T))
		}
	}

	completeQuery := fmt.Sprintf("SELECT %s FROM %s", strings.Join(columns, ", "), table)

	if where != "" {
		completeQuery = fmt.Sprintf("%s WHERE %s", completeQuery, where)
	}

	var rows *sql.Rows
	var err error

	if len(args) > 0 {

		db.Ping()

		rows, err = db.Query(completeQuery, args...)
	} else {

		db.Ping()

		rows, err = db.Query(completeQuery)
	}

	if err != nil {
		logger.Sugar().Errorf("database access failed with error %q", err.Error())

		return nil, err
	}

	defer rows.Close()
	results := []T{}

	title := cases.Title(language.Und)

	for rows.Next() {
		var lineResult T

		scanArgs := make([]any, len(columns))
		v := reflect.ValueOf(&lineResult).Elem()

		for ii, col := range columns {
			colTitle := title.String(col)

			field := v.FieldByName(colTitle)

			if field.IsValid() && field.CanSet() {
				scanArgs[ii] = field.Addr().Interface()
			} else {
				logger.Sugar().Warnf("Field %s not found in struct %T", col, lineResult)
				scanArgs[ii] = new(any) // save dummy value
			}
		}

		// scan the row into the struct
		if err := rows.Scan(scanArgs...); err != nil {
			logger.Sugar().Warnf("Scan-error: %q", err.Error())

			return nil, err
		}

		results = append(results, lineResult)
	}

	if err := rows.Err(); err != nil {
		logger.Sugar().Errorf("rows-error: %q", err.Error())
		return nil, err
	} else {
		return results, nil
	}
}

func dbCount(table string, where any) (int, error) {
	// extract columns from vals
	v := reflect.ValueOf(where)
	t := v.Type()

	columns := make([]string, t.NumField())
	values := make([]any, t.NumField())

	for ii := 0; ii < t.NumField(); ii++ {
		fieldValue := v.Field(ii)

		// skip empty (zero) values
		if !fieldValue.IsZero() {
			field := t.Field(ii)

			columns[ii] = strings.ToLower(field.Name) + " = ?"
			values[ii] = fmt.Sprint(fieldValue.Interface())
		}
	}

	var rows *sql.Rows
	var err error

	completeQuery := fmt.Sprintf("SELECT 1 FROM %s", table)

	if len(values) > 0 {
		completeQuery = fmt.Sprintf("%s WHERE %s", completeQuery, strings.Join(columns, ", "))

		db.Ping()

		rows, err = db.Query(completeQuery, values...)
	} else {

		db.Ping()

		rows, err = db.Query(completeQuery)
	}

	if err != nil {
		logger.Sugar().Errorf("database access failed with error %q", err.Error())

		return 0, err
	}

	defer rows.Close()

	// Initialize row count
	count := 0

	// Loop through all rows returned by the query
	for rows.Next() {
		var lineResult bool

		// Scan the row (even though we don't actually need the content)
		if err := rows.Scan(&lineResult); err != nil {
			logger.Sugar().Warnf("Scan-error: %q", err.Error())
			return 0, err
		}

		// Increment the count for each row
		count++
	}

	if err := rows.Err(); err != nil {
		logger.Sugar().Errorf("rows-error: %q", err.Error())
		return 0, err
	} else {
		return count, nil
	}
}

func dbInsert(table string, vals any) error {
	// extract columns from vals
	v := reflect.ValueOf(vals)
	t := v.Type()

	columns := make([]string, t.NumField())
	values := make([]any, t.NumField())

	for ii := 0; ii < t.NumField(); ii++ {
		fieldValue := v.Field(ii)

		// skip empty (zero) values
		if !fieldValue.IsZero() {
			field := t.Field(ii)

			columns[ii] = strings.ToLower(field.Name)
			values[ii] = fieldValue.Interface()
		}
	}

	placeholders := strings.Repeat(("?, "), len(columns))
	placeholders = strings.TrimSuffix(placeholders, ", ")

	completeQuery := fmt.Sprintf("INSERT INTO %s (%s) VALUES (%s)", table, strings.Join(columns, ", "), placeholders)

	_, err := db.Exec(completeQuery, values...)

	return err
}

func dbUpdate(table string, set, where any) error {
	setV := reflect.ValueOf(set)
	setT := setV.Type()

	setColumns := make([]string, setT.NumField())
	setValues := make([]any, setT.NumField())

	for ii := 0; ii < setT.NumField(); ii++ {
		fieldValue := setV.Field(ii)

		field := setT.Field(ii)

		setColumns[ii] = strings.ToLower(field.Name) + " = ?"
		setValues[ii] = fieldValue.Interface()
	}

	whereV := reflect.ValueOf(where)
	whereT := whereV.Type()

	whereColumns := make([]string, whereT.NumField())
	whereValues := make([]any, whereT.NumField())

	for ii := 0; ii < whereT.NumField(); ii++ {
		fieldValue := whereV.Field(ii)

		// skip empty (zero) values
		if !fieldValue.IsZero() {
			field := whereT.Field(ii)

			whereColumns[ii] = strings.ToLower(field.Name) + " = ?"
			whereValues[ii] = fmt.Sprint(fieldValue.Interface())
		}
	}

	sets := strings.Join(setColumns, ", ")
	wheres := strings.Join(whereColumns, " AND ")

	placeholderValues := append(setValues, whereValues...)

	completeQuery := fmt.Sprintf("UPDATE %s SET %s WHERE %s", table, sets, wheres)

	_, err := db.Exec(completeQuery, placeholderValues...)

	return err
}

func dbDelete(table string, vals any) error {
	// extract columns from vals
	v := reflect.ValueOf(vals)
	t := v.Type()

	columns := make([]string, t.NumField())
	values := make([]any, t.NumField())

	for ii := 0; ii < t.NumField(); ii++ {
		fieldValue := v.Field(ii)

		// skip empty (zero) values
		if !fieldValue.IsZero() {
			field := t.Field(ii)

			columns[ii] = strings.ToLower(field.Name) + " = ?"
			values[ii] = fmt.Sprint(fieldValue.Interface())
		}
	}

	completeQuery := fmt.Sprintf("DELETE FROM %s WHERE %s", table, strings.Join(columns, ", "))

	_, err := db.Exec(completeQuery, values...)

	return err
}

func extractUid(r *http.Request) (int, error) {
	cookie, err := r.Cookie("session")

	if err != nil {
		return 0, err
	}

	token, err := jwt.ParseWithClaims(cookie.Value, &JWT{}, func(token *jwt.Token) (any, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected JWT signing method: %v", token.Header["alg"])
		}

		return []byte(Config.ClientSession.JwtSignature), nil
	})

	if err != nil {
		return 0, err
	}

	if claims, ok := token.Claims.(*JWT); ok && token.Valid {
		return claims.CustomClaims.Uid, nil
	} else {
		return 0, fmt.Errorf("invalid JWT")
	}
}

func checkUser(r *http.Request) (bool, error) {
	uid, err := extractUid(r)

	if err != nil {
		return false, err
	}

	response, err := dbSelect[struct{ Admin bool }]("users", "uid = ? LIMIT 1", uid)

	if err != nil {
		return false, err
	}

	if len(response) != 1 {
		return false, nil
	} else {
		return response[0].Admin, err
	}
}

func handleWelcome(w http.ResponseWriter, r *http.Request) {
	response := responseMessage{}
	response.Data = WelcomeMessage{
		LoggedIn: false,
	}

	if uid, err := extractUid(r); err != nil {
		logger.Sugar().Errorf("Failed to extract session-cookie: %q", err.Error())
		response.Status = http.StatusBadRequest
	} else {
		if users, err := dbSelect[User]("users", "uid = ? LIMIT 1", strconv.Itoa(uid)); err != nil {
			response.Status = http.StatusInternalServerError
		} else {
			if len(users) != 1 {
				response.Status = http.StatusForbidden
				response.Message = ptr("unknown user")

				removeSessionCookie(&w)

				return
			} else {
				user := users[0]

				response.Status = http.StatusOK
				response.Data = WelcomeMessage{
					Uid:      user.Uid,
					Admin:    user.Admin,
					LoggedIn: true,
				}
			}
		}
	}

	response.send(w)
}

type LoginBody struct {
	User     string `json:"user"`
	Password string `json:"password"`
}

type User struct {
	Uid      int    `json:"uid"`
	Name     string `json:"name"`
	Admin    bool   `json:"admin"`
	Password []byte `json:"password"`
}

type LoginInfo struct {
	Uid      int    `json:"uid"`
	Name     string `json:"name"`
	Admin    bool   `json:"admin"`
	LoggedIn bool   `json:"logged_in"`
}

type JWTPayload struct {
	Uid int `json:"uid"`
}

type JWT struct {
	Payload
	CustomClaims JWTPayload
}

func handleLogin(w http.ResponseWriter, r *http.Request) {
	var response responseMessage

	var body LoginBody

	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	err := decoder.Decode(&body)

	if err != nil {
		logger.Warn("error while parsing login-body")

		response.Status = http.StatusBadRequest
	} else {
		// try to get the hashed password from the database
		dbResult, err := dbSelect[User]("users", "name = ? LIMIT 1", body.User)

		if err != nil {
			response.Status = http.StatusInternalServerError
		} else {
			response.Data = LoginInfo{
				LoggedIn: false,
			}

			user := dbResult[0]

			if len(dbResult) != 1 || bcrypt.CompareHashAndPassword(user.Password, []byte(body.Password)) != nil {
				response.Status = http.StatusUnauthorized
				message := "Unkown user or wrong password"
				response.Message = &message
			} else {
				// create the jwt
				jwt, err := Config.signJWT(JWTPayload{
					Uid: user.Uid,
				})

				if err != nil {
					logger.Sugar().Errorf("failed creating json-webtoken: %q", err.Error())
					response.Status = http.StatusInternalServerError
				} else {
					response.Status = http.StatusOK

					cookie := &http.Cookie{
						Name:     "session",
						Value:    jwt,
						HttpOnly: true,
						SameSite: http.SameSiteStrictMode,
						MaxAge:   int(Config.SessionExpire.Seconds()),
					}

					http.SetCookie(w, cookie)

					response.Data = LoginInfo{
						Uid:      user.Uid,
						Name:     user.Name,
						Admin:    user.Admin,
						LoggedIn: true,
					}
				}
			}
		}
	}

	response.send(w)
}

func removeSessionCookie(w *http.ResponseWriter) {
	cookie := &http.Cookie{
		Name:     "session",
		Value:    "",
		Expires:  time.Unix(0, 0),
		HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
	}

	http.SetCookie(*w, cookie)
}

func handleLogout(w http.ResponseWriter, r *http.Request) {
	removeSessionCookie(&w)

	responseMessage{
		Status: http.StatusOK,
	}.send(w)
}

type PostsConfig struct {
	Start string `json:"start"`
	Days  int8   `json:"days"`
}

func getPostsConfig(r *http.Request) responseMessage {
	return responseMessage{
		Status: http.StatusOK,
		Data: PostsConfig{
			Start: Config.Setup.Start,
			Days:  Config.Setup.Days,
		},
	}
}

type Post struct {
	Pid     int    `json:"pid"`
	Date    string `json:"date"`
	Content string `json:"content"`
}

func getPosts(r *http.Request) responseMessage {
	var response responseMessage

	if pid := r.URL.Query().Get("pid"); pid != "" {
		if _, err := strconv.Atoi(pid); err != nil {
			response.Status = http.StatusBadRequest
			*response.Message = `"pid" must be a valid integer`
		} else {
			posts, err := dbSelect[Post]("posts", "pid = ?", pid)

			if err != nil {
				response.Status = http.StatusInternalServerError
				response.Error = err
			} else {
				response.Status = http.StatusOK
				response.Data = posts[0]
			}
		}
	} else {
		// if there is no pid given and the user is an admin, send all posts
		if ok, err := checkUser(r); err != nil {
			response.Status = http.StatusInternalServerError
		} else if ok {
			if posts, err := dbSelect[Post]("posts", ""); err != nil {
				response.Status = http.StatusInternalServerError
			} else {
				response.Status = http.StatusOK
				response.Data = posts
			}

		} else {
			response.Status = http.StatusUnauthorized
		}
	}

	return response
}

func patchPosts(r *http.Request) responseMessage {
	var response responseMessage

	if admin, err := checkUser(r); err != nil {
		logger.Error(err.Error())
		response.Status = http.StatusInternalServerError
	} else if !admin {
		logger.Warn("user is no admin")
		response.Status = http.StatusForbidden
	} else {
		var body struct {
			Content string
		}

		if pid, err := queryInt(r, "pid"); err != nil {
			logger.Info(err.Error())
			response.Status = http.StatusBadRequest
		} else if err := bodyDecode(r, &body); err != nil {
			logger.Info(err.Error())
			response.Status = http.StatusBadRequest
		} else {
			if err := dbUpdate("posts", body, struct{ Pid int }{Pid: pid}); err != nil {
				logger.Error(err.Error())
				response.Status = http.StatusInternalServerError
			} else {
				response.Status = http.StatusOK
			}
		}
	}

	return response
}

type Comment struct {
	Cid    int     `json:"cid"`
	Pid    int     `json:"pid"`
	Uid    int     `json:"uid"`
	Text   string  `json:"text"`
	Answer *string `json:"answer,omitempty"`
}
type Comments []Comment

type CommentInsert struct {
	Pid  int    `json:"pid"`
	Uid  int    `json:"uid"`
	Text string `json:"text"`
}

func getComments(r *http.Request) responseMessage {
	var response responseMessage

	if r.URL.Query().Get("pid") != "" {
		if pid, err := queryInt(r, "pid"); err != nil {
			response.Status = http.StatusBadRequest
			*response.Message = `"pid" must be a valid integer`
		} else {
			comments, err := dbSelect[Comment]("comments", "pid = ?", pid)

			if err != nil {
				response.Status = http.StatusInternalServerError
				response.Error = err
			} else {
				response.Status = http.StatusOK
				response.Data = comments
			}
		}
	} else {
		// if there is no pid given and the user is an admin, send all posts
		if ok, err := checkUser(r); err != nil {
			response.Status = http.StatusInternalServerError
		} else if ok {
			if posts, err := dbSelect[Comment]("comments", ""); err != nil {
				response.Status = http.StatusInternalServerError
			} else {
				response.Status = http.StatusOK
				response.Data = posts
			}

		} else {
			response.Status = http.StatusUnauthorized
		}
	}

	return response
}

func postComments(r *http.Request) responseMessage {
	var response responseMessage

	if pid, err := queryInt(r, "pid"); err != nil {
		logger.Error(err.Error())
		response.Status = http.StatusBadRequest
	} else if uid, err := extractUid(r); err != nil {
		logger.Error(err.Error())
	} else {
		// check wether the post-date is today
		if dbResponse, err := dbSelect[struct{ Date string }]("posts", "pid = ? LIMIT 1", pid); err != nil {
			response.Status = http.StatusInternalServerError
		} else if len(dbResponse) != 1 {
			response.Status = http.StatusBadRequest
		} else {
			postDate := dbResponse[0].Date

			today := time.Now().Format(time.DateOnly)

			if postDate != today {
				response.Status = http.StatusForbidden
			} else {
				// check wether the user already posted
				if posts, err := dbSelect[struct{ Cid int }]("comments", "pid = ? AND uid = ?", pid, uid); err != nil {
					response.Status = http.StatusInternalServerError
				} else if len(posts) != 0 {
					response.Status = http.StatusConflict
				} else {
					// everything is valid, add the comment

					var body struct {
						Text string `json:"text"`
					}

					err := bodyDecode(r, &body)

					if err != nil {
						logger.Warn(`"body" can't be parsed as "{ text string }"`)
						response.Status = http.StatusBadRequest
					} else {
						if err := dbInsert("comments", CommentInsert{
							Pid:  pid,
							Uid:  uid,
							Text: body.Text,
						}); err != nil {
							logger.Sugar().Warnf("Writing comment to database failed with error: %q", err.Error())
							response.Status = http.StatusInternalServerError
						} else {
							response = getComments(r)
						}
					}
				}
			}
		}
	}

	return response
}

func deleteComments(r *http.Request) responseMessage {
	var response responseMessage

	// check wether the query is valid
	if cid := r.URL.Query().Get("cid"); cid != "" {
		// try to parse cid as an integer
		if iCid, err := strconv.Atoi(cid); err != nil {
			logger.Warn(`"cid" can't be parsed as an integer`)
			response.Status = http.StatusBadRequest
		} else {
			// check wether the user has the permissions
			if admin, err := checkUser(r); err != nil {
				response.Status = http.StatusInternalServerError
			} else if !admin {
				response.Status = http.StatusForbidden
			} else {
				// everything is good

				if err := dbDelete("comments", struct{ Cid int }{iCid}); err != nil {
					logger.Sugar().Warnf("Deleting comment from database failed with error: %q", err.Error())
					response.Status = http.StatusInternalServerError
				}

				response = getComments(r)
			}
		}
	} else {
		response.Status = http.StatusBadRequest
	}

	return response
}

func postCommentsAnswer(r *http.Request) responseMessage {
	var response responseMessage

	// check wether the user is an admin = allowed to post an answer
	if admin, err := checkUser(r); err != nil {
		response.Status = http.StatusInternalServerError
	} else if !admin {
		response.Status = http.StatusForbidden
	} else {
		if cid, err := queryInt(r, "cid"); err != nil {
			response.Status = http.StatusBadRequest
		} else {
			var body struct {
				Answer string `json:"answer"`
			}

			if err := bodyDecode(r, &body); err != nil {
				logger.Info(err.Error())
				response.Status = http.StatusBadRequest
			} else {
				if err := dbUpdate("comments", struct{ Answer string }{Answer: body.Answer}, struct{ Cid int }{Cid: cid}); err != nil {
					logger.Error(err.Error())
					response.Status = http.StatusInternalServerError
				} else {
					if comments, err := dbSelect[Comment]("comments", "cid = ?", cid); err != nil || len(comments) != 1 {
						response.Status = http.StatusInternalServerError
					} else {
						response.Status = http.StatusOK
						response.Data = comments[0]
					}
				}
			}
		}
	}

	return response
}

func getUsers(r *http.Request) responseMessage {
	var response responseMessage

	// check wether the user is an admin
	isAdmin, err := checkUser(r)

	if err != nil {
		response.Status = http.StatusInternalServerError
	} else if isAdmin {
		// retrieve all users
		if users, err := dbSelect[User]("users", ""); err != nil {
			response.Status = http.StatusInternalServerError
		} else {
			response.Status = http.StatusOK
			response.Data = users
		}
	} else {
		response.Status = http.StatusForbidden
	}

	return response
}

func hashPassword(password string) ([]byte, error) {
	return bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
}

func postUsers(r *http.Request) responseMessage {
	var response responseMessage

	if admin, err := checkUser(r); err != nil {
		logger.Error(err.Error())
		response.Status = http.StatusInternalServerError
	} else if !admin {
		logger.Warn("user is no admin")
		response.Status = http.StatusForbidden
	} else {
		var body struct {
			Name     string `json:"name"`
			Password string `json:"password"`
		}

		// validate parameters
		if err := bodyDecode(r, &body); err != nil {
			logger.Info(err.Error())
			response.Status = http.StatusBadRequest
		} else {
			// check wether a user with the same name already exists
			if userCount, err := dbCount("users", struct{ Name string }{Name: body.Name}); err != nil {
				logger.Error(err.Error())
				response.Status = http.StatusInternalServerError
			} else if userCount != 0 {
				logger.Sugar().Debugf("user with name %q already exists", body.Name)
				response.Status = http.StatusConflict
			} else {
				// everything is valid
				if hashedPassword, err := hashPassword(body.Password); err != nil {
					logger.Error(err.Error())
					response.Status = http.StatusInternalServerError
				} else {
					if err := dbInsert("users", struct {
						Name     string
						Password []byte
					}{Name: body.Name, Password: hashedPassword}); err != nil {
						logger.Error(err.Error())
						response.Status = http.StatusInternalServerError
					} else {
						response = getUsers(r)
					}
				}
			}
		}
	}

	return response
}

func patchUsers(r *http.Request) responseMessage {
	var response responseMessage

	if admin, err := checkUser(r); err != nil {
		logger.Error(err.Error())
		response.Status = http.StatusInternalServerError
	} else if !admin {
		logger.Warn("user is no admin")
		response.Status = http.StatusForbidden
	} else {
		var body struct {
			Password string
			Admin    bool
		}

		if uid, err := queryInt(r, "uid"); err != nil {
			logger.Info(err.Error())
			response.Status = http.StatusBadRequest
		} else if err := bodyDecode(r, &body); err != nil {
			logger.Info(err.Error())
			response.Status = http.StatusBadRequest
		} else if modifyUsers, err := dbSelect[User]("users", "uid = ?", uid); err != nil {
			logger.Error(err.Error())
			response.Status = http.StatusInternalServerError
		} else if len(modifyUsers) != 1 {
			logger.Warn("User doesn't exist")
			response.Status = http.StatusBadRequest
		} else {
			if requestUid, err := extractUid(r); err != nil {
				logger.Info(err.Error())
				response.Status = http.StatusBadRequest
			} else if requestUsers, err := dbSelect[User]("users", "uid = ?", requestUid); err != nil {
				logger.Error(err.Error())
				response.Status = http.StatusInternalServerError
			} else if len(requestUsers) != 1 {
				logger.Sugar().Errorf("User doesn't exist %q", requestUid)
				response.Status = http.StatusBadRequest
			} else {
				modifyUser := modifyUsers[0]
				requestUser := requestUsers[0]

				// if requested, modify the password
				if len(body.Password) > 0 {
					// only allow admin to change himself
					if modifyUser.Name == "admin" && requestUser.Name != "admin" {
						logger.Error(`password of user "admin" can only be changed by himself`)
						response.Status = http.StatusForbidden

						// check wether the current-user tries to modify himself
					} else if requestUser.Name == modifyUser.Name && requestUser.Name != "admin" {
						logger.Error(`can't change own password`)
						response.Status = http.StatusForbidden
					} else {
						if hashedPassword, err := hashPassword(body.Password); err != nil {
							logger.Error(err.Error())
							response.Status = http.StatusInternalServerError
						} else {
							if err := dbUpdate("users", struct{ Password []byte }{Password: hashedPassword}, struct{ Uid int }{Uid: modifyUser.Uid}); err != nil {
								logger.Error(err.Error())
								response.Status = http.StatusInternalServerError
							}
						}
					}
				}

				// only proceed, if there is no response.Status set already
				if response.Status == 0 {
					// disallow demoting of the "admin"-user
					if modifyUser.Name == "admin" {
						logger.Error(`"admin"-user can't be demoted"`)
						response.Status = http.StatusForbidden

						// check wether the current-user tries to modify himself
					} else if requestUser.Name == modifyUser.Name {
						logger.Error(`can't demote self`)
						response.Status = http.StatusForbidden
					} else {
						if err := dbUpdate("users", struct{ Admin bool }{Admin: body.Admin}, struct{ Uid int }{Uid: modifyUser.Uid}); err != nil {
							logger.Error(err.Error())
							response.Status = http.StatusInternalServerError
						} else {
							response = getUsers(r)
						}
					}
				}
			}
		}
	}

	return response
}

func deleteUsers(r *http.Request) responseMessage {
	var response responseMessage

	// check wether the user is an admin
	if admin, err := checkUser(r); err != nil {
		logger.Error(err.Error())
		response.Status = http.StatusInternalServerError
	} else if !admin {
		logger.Warn("user is no admin")
		response.Status = http.StatusForbidden
	} else {
		if uid, err := queryInt(r, "uid"); err != nil {
			logger.Info(err.Error())
			response.Status = http.StatusBadRequest
		} else if modifyUsers, err := dbSelect[User]("users", "uid = ?", uid); err != nil {
			logger.Error(err.Error())
			response.Status = http.StatusInternalServerError
		} else if len(modifyUsers) != 1 {
			logger.Warn("User doesn't exist")
			response.Status = http.StatusBadRequest
		} else {
			if requestUid, err := extractUid(r); err != nil {
				logger.Info(err.Error())
				response.Status = http.StatusBadRequest
			} else if requestUsers, err := dbSelect[User]("users", "uid = ?", requestUid); err != nil {
				logger.Error(err.Error())
				response.Status = http.StatusInternalServerError
			} else if len(requestUsers) != 1 {
				logger.Sugar().Errorf("User doesn't exist %q", requestUid)
				response.Status = http.StatusBadRequest
			} else {
				deleteUser := modifyUsers[0]
				requestUser := requestUsers[0]

				// disallow deleting of the "admin"-user
				if deleteUser.Name == "admin" {
					logger.Error(`"admin"-user can't be deleted"`)
					response.Status = http.StatusForbidden

					// check wether the current-user tries to modify himself
				} else if requestUser.Name == deleteUser.Name {
					logger.Error(`can't delete self`)
					response.Status = http.StatusForbidden
				} else {
					if err := dbDelete("users", struct{ Uid int }{Uid: deleteUser.Uid}); err != nil {
						logger.Error(err.Error())
						response.Status = http.StatusInternalServerError
					} else {
						response = getUsers(r)
					}
				}
			}
		}
	}

	return response
}

func main() {
	defer logger.Sync()

	// handle specific request special
	http.HandleFunc("/api/login", handleLogin)
	http.HandleFunc("/api/welcome", handleWelcome)
	http.HandleFunc("/api/logout", handleLogout)

	endpoints := map[string]map[string]func(r *http.Request) responseMessage{
		"posts/config":    {http.MethodGet: getPostsConfig},
		"posts":           {http.MethodGet: getPosts, http.MethodPatch: patchPosts},
		"comments":        {http.MethodGet: getComments, http.MethodPost: postComments, http.MethodDelete: deleteComments},
		"comments/answer": {http.MethodPost: postCommentsAnswer},
		"users":           {http.MethodGet: getUsers, http.MethodPost: postUsers, http.MethodPatch: patchUsers, http.MethodDelete: deleteUsers},
	}

	for address, handlers := range endpoints {
		http.HandleFunc("/api/"+address, func(w http.ResponseWriter, r *http.Request) {
			if handler, ok := handlers[r.Method]; ok {
				logger.Sugar().Debugf("HTTP %s request: %q", r.Method, r.URL)

				var response responseMessage

				if _, err := checkUser(r); err == nil {
					response = handler(r)
				} else {
					response.Status = http.StatusForbidden
				}

				response.send(w)
			} else {
				logger.Sugar().Warnf("No %s endpoint for %q available", r.Method, r.URL)
			}
		})
	}

	http.ListenAndServe(fmt.Sprintf(":%d", Config.Server.Port), nil)
}
