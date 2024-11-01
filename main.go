package main

import (
	"database/sql"
	"fmt"
	"os"
	"reflect"
	"strconv"
	"strings"
	"time"

	"github.com/go-sql-driver/mysql"
	"github.com/gofiber/fiber/v2"
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
}

func (result responseMessage) send(c *fiber.Ctx) error {
	if result.Status >= 400 {
		if result.Message != nil {
			return fiber.NewError(result.Status, *result.Message)
		} else {
			return fiber.NewError(result.Status)
		}
	} else {
		if result.Data != nil {
			c.JSON(result.Data)
		} else {
			if result.Message != nil {
				c.SendString(*result.Message)
			}
		}

		return c.SendStatus(result.Status)
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

func extractUid(c *fiber.Ctx) (int, error) {
	cookie := c.Cookies("session")

	token, err := jwt.ParseWithClaims(cookie, &JWT{}, func(token *jwt.Token) (any, error) {
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

func checkUser(c *fiber.Ctx) (bool, error) {
	uid, err := extractUid(c)

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

func handleWelcome(c *fiber.Ctx) error {
	response := responseMessage{}
	response.Data = WelcomeMessage{
		LoggedIn: false,
	}

	if uid, err := extractUid(c); err == nil {
		if users, err := dbSelect[User]("users", "uid = ? LIMIT 1", strconv.Itoa(uid)); err != nil {
			response.Status = fiber.StatusInternalServerError
		} else {
			if len(users) != 1 {
				response.Status = fiber.StatusForbidden
				response.Message = ptr("unknown user")

				removeSessionCookie(c)
			} else {
				user := users[0]

				response.Data = WelcomeMessage{
					Uid:      user.Uid,
					Admin:    user.Admin,
					LoggedIn: true,
				}
			}
		}
	}

	return response.send(c)
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

func handleLogin(c *fiber.Ctx) error {
	var response responseMessage

	body := new(LoginBody)

	if err := c.BodyParser(body); err != nil {
		logger.Warn("error while parsing login-body")

		response.Status = fiber.StatusBadRequest
	} else {
		// try to get the hashed password from the database
		dbResult, err := dbSelect[User]("users", "name = ? LIMIT 1", body.User)

		if err != nil {
			response.Status = fiber.StatusInternalServerError
		} else {
			response.Data = LoginInfo{
				LoggedIn: false,
			}

			user := dbResult[0]

			if len(dbResult) != 1 || bcrypt.CompareHashAndPassword(user.Password, []byte(body.Password)) != nil {
				response.Status = fiber.StatusUnauthorized
				message := "Unkown user or wrong password"
				response.Message = &message
			} else {
				// create the jwt
				jwt, err := Config.signJWT(JWTPayload{
					Uid: user.Uid,
				})

				if err != nil {
					logger.Sugar().Errorf("failed creating json-webtoken: %q", err.Error())
					response.Status = fiber.StatusInternalServerError
				} else {

					c.Cookie(&fiber.Cookie{
						Name:     "session",
						Value:    jwt,
						HTTPOnly: true,
						SameSite: "strict",
						MaxAge:   int(Config.SessionExpire.Seconds()),
					})

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

	return response.send(c)
}

func removeSessionCookie(c *fiber.Ctx) {
	c.Cookie(&fiber.Cookie{
		Name:     "session",
		Value:    "",
		HTTPOnly: true,
		SameSite: "strict",
		Expires:  time.Unix(0, 0),
	})
}

func handleLogout(c *fiber.Ctx) error {
	removeSessionCookie(c)

	return responseMessage{
		Status: fiber.StatusOK,
	}.send(c)
}

type PostsConfig struct {
	Start string `json:"start"`
	Days  int8   `json:"days"`
}

func getPostsConfig(_ *fiber.Ctx) responseMessage {
	return responseMessage{
		Status: fiber.StatusOK,
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

func getPosts(c *fiber.Ctx) responseMessage {
	var response responseMessage

	if pid := c.QueryInt("pid", -1); pid >= 0 {
		posts, err := dbSelect[Post]("posts", "pid = ?", pid)

		if err != nil {
			logger.Error(err.Error())
			response.Status = fiber.StatusInternalServerError
		} else {
			response.Data = posts[0]
		}
	} else {
		// if there is no pid given and the user is an admin, send all posts
		if ok, err := checkUser(c); err != nil {
			response.Status = fiber.StatusInternalServerError
		} else if ok {
			if posts, err := dbSelect[Post]("posts", ""); err != nil {
				response.Status = fiber.StatusInternalServerError
			} else {
				response.Data = posts
			}

		} else {
			response.Status = fiber.StatusUnauthorized
		}
	}

	return response
}

func patchPosts(c *fiber.Ctx) responseMessage {
	var response responseMessage

	if admin, err := checkUser(c); err != nil {
		logger.Error(err.Error())
		response.Status = fiber.StatusInternalServerError
	} else if !admin {
		logger.Warn("user is no admin")
		response.Status = fiber.StatusForbidden
	} else {
		body := new(struct{ Content string })

		if pid := c.QueryInt("pid", -1); pid < 0 {
			logger.Info(`query doesn't include valid "pid"`)
			response.Status = fiber.StatusBadRequest
		} else if err := c.BodyParser(&body); err != nil {
			logger.Info(err.Error())
			response.Status = fiber.StatusBadRequest
		} else {
			if err := dbUpdate("posts", body, struct{ Pid int }{Pid: pid}); err != nil {
				logger.Error(err.Error())
				response.Status = fiber.StatusInternalServerError
			} else {
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

func getComments(c *fiber.Ctx) responseMessage {
	var response responseMessage

	if pid := c.QueryInt("pid", -1); pid >= 0 {
		comments, err := dbSelect[Comment]("comments", "pid = ?", pid)

		if err != nil {
			logger.Error(err.Error())
			response.Status = fiber.StatusInternalServerError
		} else {
			response.Data = comments
		}
	} else {
		// if there is no pid given and the user is an admin, send all posts
		if ok, err := checkUser(c); err != nil {
			response.Status = fiber.StatusInternalServerError
		} else if ok {
			if posts, err := dbSelect[Comment]("comments", ""); err != nil {
				response.Status = fiber.StatusInternalServerError
			} else {
				response.Data = posts
			}

		} else {
			response.Status = fiber.StatusUnauthorized
		}
	}

	return response
}

func postComments(c *fiber.Ctx) responseMessage {
	var response responseMessage

	if pid := c.QueryInt("pid", -1); pid < 0 {
		logger.Info(`query doesn't include valid "pid"`)
	} else if uid, err := extractUid(c); err != nil {
		logger.Error(err.Error())
	} else {
		// check wether the post-date is today
		if dbResponse, err := dbSelect[struct{ Date string }]("posts", "pid = ? LIMIT 1", pid); err != nil {
			response.Status = fiber.StatusInternalServerError
		} else if len(dbResponse) != 1 {
			response.Status = fiber.StatusBadRequest
		} else {
			postDate := dbResponse[0].Date

			today := time.Now().Format(time.DateOnly)

			if postDate != today {
				response.Status = fiber.StatusForbidden
			} else {
				// check wether the user already posted
				if posts, err := dbSelect[struct{ Cid int }]("comments", "pid = ? AND uid = ?", pid, uid); err != nil {
					response.Status = fiber.StatusInternalServerError
				} else if len(posts) != 0 {
					response.Status = fiber.StatusConflict
				} else {
					// everything is valid, add the comment

					body := new(struct {
						Text string `json:"text"`
					})

					if err := c.BodyParser(&body); err != nil {
						logger.Warn(`"body" can't be parsed as "{ text string }"`)
						response.Status = fiber.StatusBadRequest
					} else {
						if err := dbInsert("comments", CommentInsert{
							Pid:  pid,
							Uid:  uid,
							Text: body.Text,
						}); err != nil {
							logger.Sugar().Warnf("Writing comment to database failed with error: %q", err.Error())
							response.Status = fiber.StatusInternalServerError
						} else {
							response = getComments(c)
						}
					}
				}
			}
		}
	}

	return response
}

func deleteComments(c *fiber.Ctx) responseMessage {
	var response responseMessage

	// check wether the query is valid
	if cid := c.QueryInt("cid", -1); cid < 0 {
		logger.Warn(`request doesn't include valid "cid"`)
		response.Status = fiber.StatusBadRequest
	} else {
		// check wether the user has the permissions
		if admin, err := checkUser(c); err != nil {
			response.Status = fiber.StatusInternalServerError
		} else if !admin {
			response.Status = fiber.StatusForbidden
		} else {
			// everything is good

			if err := dbDelete("comments", struct{ Cid int }{cid}); err != nil {
				logger.Sugar().Warnf("Deleting comment from database failed with error: %q", err.Error())
				response.Status = fiber.StatusInternalServerError
			}

			response = getComments(c)
		}
	}

	return response
}

func postCommentsAnswer(c *fiber.Ctx) responseMessage {
	var response responseMessage

	// check wether the user is an admin = allowed to post an answer
	if admin, err := checkUser(c); err != nil {
		response.Status = fiber.StatusInternalServerError
	} else if !admin {
		response.Status = fiber.StatusForbidden
	} else {
		if cid := c.QueryInt("cid", -1); cid < 0 {
			response.Status = fiber.StatusBadRequest
		} else {
			body := new(struct {
				Answer string `json:"answer"`
			})

			if err := c.BodyParser(&body); err != nil {
				logger.Info(err.Error())
				response.Status = fiber.StatusBadRequest
			} else {
				if err := dbUpdate("comments", struct{ Answer string }{Answer: body.Answer}, struct{ Cid int }{Cid: cid}); err != nil {
					logger.Error(err.Error())
					response.Status = fiber.StatusInternalServerError
				} else {
					if comments, err := dbSelect[Comment]("comments", "cid = ?", cid); err != nil || len(comments) != 1 {
						response.Status = fiber.StatusInternalServerError
					} else {
						response.Data = comments[0]
					}
				}
			}
		}
	}

	return response
}

func getUsers(c *fiber.Ctx) responseMessage {
	var response responseMessage

	// check wether the user is an admin
	isAdmin, err := checkUser(c)

	if err != nil {
		response.Status = fiber.StatusInternalServerError
	} else if isAdmin {
		// retrieve all users
		if users, err := dbSelect[User]("users", ""); err != nil {
			response.Status = fiber.StatusInternalServerError
		} else {
			response.Data = users
		}
	} else {
		response.Status = fiber.StatusForbidden
	}

	return response
}

func hashPassword(password string) ([]byte, error) {
	return bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
}

func postUsers(c *fiber.Ctx) responseMessage {
	var response responseMessage

	if admin, err := checkUser(c); err != nil {
		logger.Error(err.Error())
		response.Status = fiber.StatusInternalServerError
	} else if !admin {
		logger.Warn("user is no admin")
		response.Status = fiber.StatusForbidden
	} else {
		body := new(struct {
			Name     string `json:"name"`
			Password string `json:"password"`
		})

		// validate parameters
		if err := c.BodyParser(&body); err != nil {
			logger.Info(err.Error())
			response.Status = fiber.StatusBadRequest
		} else {
			// check wether a user with the same name already exists
			if userCount, err := dbCount("users", struct{ Name string }{Name: body.Name}); err != nil {
				logger.Error(err.Error())
				response.Status = fiber.StatusInternalServerError
			} else if userCount != 0 {
				logger.Sugar().Debugf("user with name %q already exists", body.Name)
				response.Status = fiber.StatusConflict
			} else {
				// everything is valid
				if hashedPassword, err := hashPassword(body.Password); err != nil {
					logger.Error(err.Error())
					response.Status = fiber.StatusInternalServerError
				} else {
					if err := dbInsert("users", struct {
						Name     string
						Password []byte
					}{Name: body.Name, Password: hashedPassword}); err != nil {
						logger.Error(err.Error())
						response.Status = fiber.StatusInternalServerError
					} else {
						response = getUsers(c)
					}
				}
			}
		}
	}

	return response
}

func patchUsers(c *fiber.Ctx) responseMessage {
	var response responseMessage

	if admin, err := checkUser(c); err != nil {
		logger.Error(err.Error())
		response.Status = fiber.StatusInternalServerError
	} else if !admin {
		logger.Warn("user is no admin")
		response.Status = fiber.StatusForbidden
	} else {
		body := new(struct {
			Password string
			Admin    bool
		})

		if uid := c.QueryInt("uid", -1); uid < 0 {
			logger.Info(`query doesn't include valid "uid"`)
			response.Status = fiber.StatusBadRequest
		} else if err := c.BodyParser(&body); err != nil {
			logger.Info(err.Error())
			response.Status = fiber.StatusBadRequest
		} else if modifyUsers, err := dbSelect[User]("users", "uid = ?", uid); err != nil {
			logger.Error(err.Error())
			response.Status = fiber.StatusInternalServerError
		} else if len(modifyUsers) != 1 {
			logger.Warn("User doesn't exist")
			response.Status = fiber.StatusBadRequest
		} else {
			if requestUid, err := extractUid(c); err != nil {
				logger.Info(err.Error())
				response.Status = fiber.StatusBadRequest
			} else if requestUsers, err := dbSelect[User]("users", "uid = ?", requestUid); err != nil {
				logger.Error(err.Error())
				response.Status = fiber.StatusInternalServerError
			} else if len(requestUsers) != 1 {
				logger.Sugar().Errorf("User doesn't exist %q", requestUid)
				response.Status = fiber.StatusBadRequest
			} else {
				modifyUser := modifyUsers[0]
				requestUser := requestUsers[0]

				// if requested, modify the password
				if len(body.Password) > 0 {
					// only allow admin to change himself
					if modifyUser.Name == "admin" && requestUser.Name != "admin" {
						logger.Error(`password of user "admin" can only be changed by himself`)
						response.Status = fiber.StatusForbidden

						// check wether the current-user tries to modify himself
					} else if requestUser.Name == modifyUser.Name && requestUser.Name != "admin" {
						logger.Error(`can't change own password`)
						response.Status = fiber.StatusForbidden
					} else {
						if hashedPassword, err := hashPassword(body.Password); err != nil {
							logger.Error(err.Error())
							response.Status = fiber.StatusInternalServerError
						} else {
							if err := dbUpdate("users", struct{ Password []byte }{Password: hashedPassword}, struct{ Uid int }{Uid: modifyUser.Uid}); err != nil {
								logger.Error(err.Error())
								response.Status = fiber.StatusInternalServerError
							}
						}
					}
				}

				// only proceed, if there is no response.Status set already
				if response.Status == 0 {
					// disallow demoting of the "admin"-user
					if modifyUser.Name == "admin" {
						logger.Error(`"admin"-user can't be demoted"`)
						response.Status = fiber.StatusForbidden

						// check wether the current-user tries to modify himself
					} else if requestUser.Name == modifyUser.Name {
						logger.Error(`can't demote self`)
						response.Status = fiber.StatusForbidden
					} else {
						if err := dbUpdate("users", struct{ Admin bool }{Admin: body.Admin}, struct{ Uid int }{Uid: modifyUser.Uid}); err != nil {
							logger.Error(err.Error())
							response.Status = fiber.StatusInternalServerError
						} else {
							response = getUsers(c)
						}
					}
				}
			}
		}
	}

	return response
}

func deleteUsers(c *fiber.Ctx) responseMessage {
	var response responseMessage

	// check wether the user is an admin
	if admin, err := checkUser(c); err != nil {
		logger.Error(err.Error())
		response.Status = fiber.StatusInternalServerError
	} else if !admin {
		logger.Warn("user is no admin")
		response.Status = fiber.StatusForbidden
	} else {
		if uid := c.QueryInt("uid", -1); uid < 0 {
			logger.Info(`query doesn't include valid "uid"`)
			response.Status = fiber.StatusBadRequest
		} else if modifyUsers, err := dbSelect[User]("users", "uid = ?", uid); err != nil {
			logger.Error(err.Error())
			response.Status = fiber.StatusInternalServerError
		} else if len(modifyUsers) != 1 {
			logger.Warn("User doesn't exist")
			response.Status = fiber.StatusBadRequest
		} else {
			if requestUid, err := extractUid(c); err != nil {
				logger.Info(err.Error())
				response.Status = fiber.StatusBadRequest
			} else if requestUsers, err := dbSelect[User]("users", "uid = ?", requestUid); err != nil {
				logger.Error(err.Error())
				response.Status = fiber.StatusInternalServerError
			} else if len(requestUsers) != 1 {
				logger.Sugar().Errorf("User doesn't exist %q", requestUid)
				response.Status = fiber.StatusBadRequest
			} else {
				deleteUser := modifyUsers[0]
				requestUser := requestUsers[0]

				// disallow deleting of the "admin"-user
				if deleteUser.Name == "admin" {
					logger.Error(`"admin"-user can't be deleted"`)
					response.Status = fiber.StatusForbidden

					// check wether the current-user tries to modify himself
				} else if requestUser.Name == deleteUser.Name {
					logger.Error(`can't delete self`)
					response.Status = fiber.StatusForbidden
				} else {
					if err := dbDelete("users", struct{ Uid int }{Uid: deleteUser.Uid}); err != nil {
						logger.Error(err.Error())
						response.Status = fiber.StatusInternalServerError
					} else {
						response = getUsers(c)
					}
				}
			}
		}
	}

	return response
}

func main() {
	defer logger.Sync()

	app := fiber.New(fiber.Config{
		AppName:               "advent-server",
		DisableStartupMessage: true,
	})

	// handle specific request special
	app.Get("/api/welcome", handleWelcome)
	app.Post("/api/login", handleLogin)
	app.Get("/api/logout", handleLogout)

	endpoints := map[string]map[string]func(*fiber.Ctx) responseMessage{
		"GET": {
			"posts":        getPosts,
			"posts/config": getPostsConfig,
			"users":        getUsers,
			"comments":     getComments,
		},
		"POST": {
			"comments":        postComments,
			"comments/answer": postCommentsAnswer,
			"users":           postUsers,
		},
		"PATCH": {
			"posts": patchPosts,
			"users": patchUsers,
		},
		"DELETE": {
			"comments": deleteComments,
			"users":    deleteUsers,
		},
	}

	handleMethods := map[string]func(path string, handlers ...func(*fiber.Ctx) error) fiber.Router{
		"GET":    app.Get,
		"POST":   app.Post,
		"PATCH":  app.Patch,
		"DELETE": app.Delete,
	}

	for method, handlers := range endpoints {
		for address, handler := range handlers {
			handleMethods[method]("/api/"+address, func(c *fiber.Ctx) error {
				logger.Sugar().Debugf("HTTP %s request: %q", c.Method(), c.OriginalURL())

				var response responseMessage

				if _, err := checkUser(c); err == nil {
					response = handler(c)
				} else {
					response.Status = fiber.StatusForbidden
				}

				return response.send(c)
			})
		}
	}

	app.Listen(fmt.Sprintf(":%d", Config.Server.Port))
}
