# todo
- use .env
- use fibers `fiber.NewError` for http-error handling
- update datenschutz

# dotenv-example-code from chatgpt
```go
package main

import (
    "fmt"
    "log"
    "os"

    "github.com/joho/godotenv"
)

func main() {
    // Load the .env file
    err := godotenv.Load()
    if err != nil {
        log.Fatal("Error loading .env file")
    }

    // Now you can access the variables
    dbHost := os.Getenv("DB_HOST")
    dbUser := os.Getenv("DB_USER")
    dbPassword := os.Getenv("DB_PASSWORD")

    fmt.Println("DB_HOST:", dbHost)
    fmt.Println("DB_USER:", dbUser)
    fmt.Println("DB_PASSWORD:", dbPassword)
}
```