package main

import (
	"database/sql"
	"fmt"
	"math/rand/v2"
	"os"
	"regexp"
	"strings"

	"github.com/go-sql-driver/mysql"
	"golang.org/x/crypto/bcrypt"
)

func createPassword(l int) string {
	passwordChars := [...]string{`A`, `B`, `C`, `D`, `E`, `F`, `G`, `H`, `I`, `J`, `K`, `L`, `M`, `N`, `O`, `P`, `Q`, `R`, `S`, `T`, `U`, `V`, `W`, `X`, `Y`, `Z`, `Ä`, `Ö`, `Ü`, `a`, `b`, `c`, `d`, `e`, `f`, `g`, `h`, `i`, `j`, `k`, `l`, `m`, `n`, `o`, `p`, `q`, `r`, `s`, `t`, `u`, `v`, `w`, `x`, `y`, `z`, `ä`, `ö`, `ü`, `ß`, `0`, `1`, `2`, `3`, `4`, `5`, `6`, `7`, `8`, `9`, `!`, `"`, `§`, `$`, `%`, `&`, `/`, `(`, `)`, `=`, `?`, `@`, `{`, `}`, `[`, `]`, `#`, `+`, `'`, `*`, `,`, `.`, `-`, `;`, `:`, `_`, `<`, `>`, `|`, `°`}
	var password string

	for ii := 0; ii < l; ii++ {
		password += passwordChars[rand.IntN(len(passwordChars))]
	}

	return password
}

func exit(e error) {
	fmt.Printf("%v\n", e)
	os.Exit(1)
}

func main() {
	fmt.Println("connecting to database")

	// connect to the database
	sqlConfig := mysql.Config{
		AllowNativePasswords: true,
		Net:                  "tcp",
		User:                 Config.Database.User,
		Passwd:               Config.Database.Password,
		Addr:                 Config.Database.Host,
		DBName:               Config.Database.Database,
	}

	db, err := sql.Open("mysql", sqlConfig.FormatDSN())
	if err != nil {
		exit(err)
	}

	// load the sql-script
	fmt.Println(`reading "setup.sql"`)
	var sqlScriptCommands []byte
	if c, err := os.ReadFile("setup.sql"); err != nil {
		exit(err)
	} else {
		sqlScriptCommands = c
	}

	// read the currently availabe tables
	fmt.Println("reading available tables in database")
	if rows, err := db.Query("SHOW TABLES"); err != nil {
		exit(err)
	} else {
		defer rows.Close()

		fmt.Println("checking for already existing tables in database")
		for rows.Next() {
			var name string

			if err := rows.Scan(&name); err != nil {
				exit(err)
			} else {
				// check wether for the table there exists a create command

				if match, err := regexp.Match(fmt.Sprintf(`(?i)^create table %s`, name), sqlScriptCommands); err != nil {
					exit(err)
				} else {
					if match {
						exit(fmt.Errorf("can't setup databases: table %q already exists", name))
					}
				}
			}
		}
	}

	// everything is good (so far), create the tables
	fmt.Println("Creating the individual tables:")
	for _, cmd := range strings.Split(string(sqlScriptCommands), "\n") {
		db.Exec(cmd)
	}

	fmt.Println("Creating admin-password:")

	// create an admin-password
	const passwordLength = 20
	password := createPassword(passwordLength)

	// hash the admin-password
	if passwordHash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost); err != nil {
		exit(err)
	} else {
		fmt.Println("\thashed password")

		// create an admin-user
		if _, err := db.Exec("INSERT INTO users (name, admin, password) VALUES ('admin', 1, ?)", passwordHash); err != nil {
			exit(err)
		}

		fmt.Println("\twrote hashed password to database")
	}

	fmt.Printf("created user \"admin\" with password %s\n", password)

	// create a jwt-signature
	Config.ClientSession.JwtSignature = createPassword(100)

	// write the modified config-file
	writeConfig()
}
