.PHONY: all backend client setup init

all: backend

backend:
	@echo "building server"
	go build -ldflags "-s -w"
