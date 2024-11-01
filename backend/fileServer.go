package main

import (
	"io/fs"
	"mime"
	"os"
	"path"
	"strings"

	"github.com/gofiber/fiber/v2"
)

func extractPath(p string, a string) string {
	return strings.Replace(p, a+"://", "", 1)
}

type VuefinderFile struct {
	Type          string   `json:"type"`
	Path          string   `json:"path"`
	Visibility    string   `json:"visibility"`
	LastModified  int64    `json:"last_modified"`
	MimeType      string   `json:"mime_type"`
	ExtraMetadata []string `json:"extra_metadata"`
	Basename      string   `json:"basename"`
	Storage       string   `json:"storage"`
	FileSize      int64    `json:"file_size"`
}

type VuefinderFileResponse struct {
	Adapter  string          `json:"adapter"`
	Storages []string        `json:"storages"`
	Dirname  string          `json:"dirname"`
	Files    []VuefinderFile `json:"files"`
}

func createVuefinderFiles(adapter, pth string, files []fs.DirEntry) []VuefinderFile {
	vuefinderFiles := []VuefinderFile{}

	for _, ff := range files {
		if fi, err := ff.Info(); err == nil {
			vueFinderFile := VuefinderFile{
				Path:         adapter + "://" + path.Join(pth, fi.Name()),
				Visibility:   "public",
				LastModified: fi.ModTime().UnixMilli(),
				MimeType:     mime.TypeByExtension(path.Ext(fi.Name())),
				Basename:     fi.Name(),
				Storage:      adapter,
				FileSize:     fi.Size(),
			}

			if fi.IsDir() {
				vueFinderFile.Type = "dir"
			} else {
				vueFinderFile.Type = "file"
			}

			vuefinderFiles = append(vuefinderFiles, vueFinderFile)
		} else {
			logger.Sugar().Warnf("can't stat file %q: %v", path.Join(pth, fi.Name()), err)
		}
	}

	return vuefinderFiles
}

func getFiles(c *fiber.Ctx) responseMessage {
	var response responseMessage

	// if there is no adapter specified, use PUBLIC
	adapter := c.Query("adapter", "PUBLIC")

	if adapter == "null" || adapter == "undefined" {
		adapter = "PUBLIC"
	}

	adapterPath := extractPath(c.Query("path"), adapter)

	if pth, err := Config.sanitizeUploadDir(adapterPath); err != nil {
		response.Status = fiber.StatusBadRequest

		logger.Sugar().Infof("can't sanitize file-path %q: %v", adapterPath, err)
	} else {
		if res, err := fs.ReadDir(Config.UploadDirSys, pth); err != nil {
			response.Status = fiber.StatusBadRequest

			logger.Sugar().Warnf("can't read directory %q: %v", pth, err)
		} else {
			response.Data = VuefinderFileResponse{
				Adapter:  adapter,
				Storages: []string{adapter},
				Dirname:  adapterPath,
				Files:    createVuefinderFiles(adapter, pth, res),
			}
		}
	}

	return response
}

func getPreview(c *fiber.Ctx) responseMessage {
	var response responseMessage
	var err error

	// check wether all query arguments are available
	if pth := c.Query("path"); pth == "" {
		response.Status = fiber.StatusBadRequest

		logger.Sugar().Info(`query doesn't include valid "path"`)

		// check for "adapter" in query
	} else if adapter := c.Query("adapter"); adapter == "" {
		response.Status = fiber.StatusBadRequest

		logger.Sugar().Info(`query doesn't include valid "adapter"`)

		// try to resolve the upload-dir
	} else if pth, err = Config.getUploadDir(extractPath(pth, adapter)); err != nil {
		response.Status = fiber.StatusBadRequest

		logger.Sugar().Infof("can't sanitize file-path %q: %v", pth, err)

		// try to read the file
	} else if buffer, err := os.ReadFile(pth); err != nil {
		response.Status = fiber.StatusBadRequest

		logger.Sugar().Warnf("can't open file %q: %v", pth, err)

		// write the buffer
	} else {
		response.Buffer = buffer
	}

	return response
}

func getSubfolders(c *fiber.Ctx) responseMessage {
	var response responseMessage

	// check wether all query arguments are available
	if adapterPath := c.Query("path"); adapterPath == "" {
		response.Status = fiber.StatusBadRequest

		logger.Sugar().Info(`query doesn't include valid "path"`)

		// check for "adapter" in query
	} else if adapter := c.Query("adapter"); adapter == "" {
		response.Status = fiber.StatusBadRequest

		logger.Sugar().Info(`query doesn't include valid "adapter"`)

		// try to sanitze the path
	} else if pth, err := Config.sanitizeUploadDir(extractPath(adapterPath, adapter)); err != nil {
		response.Status = fiber.StatusBadRequest

		logger.Sugar().Infof("can't sanitize file-path %q: %v", pth, err)

		// try to open the file
	} else if res, err := fs.ReadDir(Config.UploadDirSys, pth); err != nil {
		response.Status = fiber.StatusBadRequest

		logger.Sugar().Warnf("can't read directory %q: %v", pth, err)
	} else {
		// remove non-directories from the files
		removeCount := 0

		for ii, ff := range res {
			if !ff.IsDir() {
				removeCount++

				res[ii] = res[len(res)-removeCount]
			}

		}
		response.Data = struct {
			Folders []VuefinderFile `json:"folders"`
		}{
			Folders: createVuefinderFiles(adapter, pth, res[:len(res)-removeCount]),
		}
	}

	return response
}

func getDownload(c *fiber.Ctx) responseMessage {
	return getPreview(c)
}

func postNewFolder(c *fiber.Ctx) responseMessage {
	var response responseMessage

	// check wether all query arguments are available
	if adapter := c.Query("adapter"); adapter == "" {
		response.Status = fiber.StatusBadRequest

		logger.Sugar().Info(`query doesn't include valid "adapter"`)

		// try to parse the message-body
	} else {
		body := new(struct {
			Name string `json:"name"`
		})

		pth := extractPath(c.Query("path"), adapter)

		if err := c.BodyParser(&body); err != nil {
			response.Status = fiber.StatusBadRequest

			logger.Sugar().Warn(`"body" can't be parsed as "{ name string }"`)

			// try to sanitize the requested path
		} else if pth, err := Config.getUploadDir(path.Join(pth, body.Name)); err != nil {
			response.Status = fiber.StatusBadRequest

			logger.Sugar().Infof("can't sanitize file-path %q: %v", pth, err)

			// try to create the directory
		} else if err := os.Mkdir(pth, fs.ModeDir|0777); err != nil {
			response.Status = fiber.StatusBadRequest

			logger.Sugar().Warnf("can't create directory %q: %v", pth, err)

			// respond with the files
		} else {
			response = getFiles(c)
		}
	}

	return response
}

func postRename(c *fiber.Ctx) responseMessage {
	var response responseMessage

	// check wether all query arguments are available
	if adapter := c.Query("adapter"); adapter == "" {
		response.Status = fiber.StatusBadRequest

		logger.Sugar().Info(`query doesn't include valid "adapter"`)

		// try to parse the message-body
	} else {
		body := new(struct {
			Item string `json:"item"`
			Name string `json:"name"`
		})

		if err := c.BodyParser(&body); err != nil {
			response.Status = fiber.StatusBadRequest

			logger.Sugar().Warn(`"body" can't be parsed as "{ item string; name string }"`)

			// try to sanitize the path
		} else if pthOld, err := Config.getUploadDir(extractPath(body.Item, adapter)); err != nil {
			response.Status = fiber.StatusBadRequest

			logger.Sugar().Infof("can't sanitize file-path %q: %v", extractPath(body.Item, adapter), err)

			// rename the files
		} else {
			pthNew := path.Join(path.Dir(pthOld), body.Name)

			if err := os.Rename(pthOld, pthNew); err != nil {
				response.Status = fiber.StatusBadRequest

				logger.Sugar().Warnf("can't rename directory %q to %q: %v", pthOld, pthNew, err)
			} else {
				response = getFiles(c)
			}
		}
	}

	return response
}

func postMove(c *fiber.Ctx) responseMessage {
	var response responseMessage

	// check wether all query arguments are available
	if adapter := c.Query("adapter"); adapter == "" {
		response.Status = fiber.StatusBadRequest

		logger.Sugar().Info(`query doesn't include valid "adapter"`)

		// parse the body
	} else {
		body := new(struct {
			Item  string `json:"item"`
			Items []struct {
				Path string `json:"path"`
			} `json:"items"`
		})

		if err := c.BodyParser(&body); err != nil {
			response.Status = fiber.StatusBadRequest

			logger.Sugar().Warn(`"body" can't be parsed as "{ item string; items []{ path string } }"`)

			// sanitize the provided path
		} else if destDir, err := Config.sanitizeUploadDir(extractPath(body.Item, adapter)); err != nil {
			response.Status = fiber.StatusBadRequest

			logger.Sugar().Infof("can't sanitize file-path %q: %v", destDir, err)

			// move the files
		} else {
			for _, ff := range body.Items {
				// validate the new path
				if orig, err := Config.getUploadDir(extractPath(ff.Path, adapter)); err == nil {
					response.Status = fiber.StatusBadRequest

					logger.Sugar().Infof("can't sanitize file-path %q: %v", extractPath(ff.Path, adapter), err)

					break
				} else {
					if dest, err := Config.getUploadDir(path.Join(destDir, path.Base(orig))); err != nil {
						response.Status = fiber.StatusBadRequest

						logger.Sugar().Infof("can't sanitize file-path %q: %v", path.Join(destDir, path.Base(orig)), err)

						break
					} else {
						if err := os.Rename(orig, dest); err != nil {
							response.Status = fiber.StatusBadRequest

							logger.Sugar().Warnf("can't move file %q to %q: %v", orig, dest, err)

							break
						}
					}
				}
			}

			response = getFiles(c)
		}
	}

	return response
}

func postDelete(c *fiber.Ctx) responseMessage {
	var response responseMessage

	// check wether all query arguments are available
	if adapter := c.Query("adapter"); adapter == "" {
		response.Status = fiber.StatusBadRequest

		logger.Sugar().Info(`query doesn't include valid "adapter"`)

		// parse the body
	} else {
		body := new(struct {
			Items []struct {
				Path string `json:"path"`
			} `json:"items"`
		})

		if err := c.BodyParser(&body); err != nil {
			response.Status = fiber.StatusBadRequest

			logger.Sugar().Warn(`"body" can't be parsed as "{ item string; items []{ path string } }"`)

			// delete the files
		} else {
			for _, ff := range body.Items {
				// validate the new path
				if pth, err := Config.getUploadDir(extractPath(ff.Path, adapter)); err != nil {
					if err := os.Remove(pth); err == nil {
						response.Status = fiber.StatusBadRequest

						logger.Sugar().Warnf("can't delete file %q: %s", pth, err)

						break
					}
				} else {
					response.Status = fiber.StatusBadRequest

					logger.Sugar().Infof("can't sanitize file-path %q: %v", ff.Path, err)

					break
				}
			}

			response = getFiles(c)
		}
	}

	return response
}

func init() {
	endpoints := map[string]map[string]func(*fiber.Ctx) responseMessage{
		"GET": {
			"index":      getFiles,
			"preview":    getPreview,
			"subfolders": getSubfolders,
			"download":   getDownload,
		},
		"POST": {
			"newfolder": postNewFolder,
			"rename":    postRename,
			"move":      postMove,
			"delete":    postDelete,
		},
	}

	handleMethods := map[string]func(path string, handlers ...func(*fiber.Ctx) error) fiber.Router{
		"GET":  app.Get,
		"POST": app.Post,
	}

	for method, handler := range handleMethods {
		handler("/api/storage/browse", func(c *fiber.Ctx) error {
			logger.Sugar().Debugf("HTTP %s request: %q", c.Method(), c.OriginalURL())

			var response responseMessage

			// check wether the session-cookie is valid and the user is an admin
			if admin, err := checkAdmin(c); err != nil {
				response.Status = fiber.StatusInternalServerError

				logger.Sugar().Errorf("can't check for admin: %v", err)
			} else if !admin {
				response.Status = fiber.StatusUnauthorized

				// check for a valid query
			} else if c.Query("q") == "" {
				response.Status = fiber.StatusBadRequest

				logger.Sugar().Info(`query is missing "q"`)
			} else if requestHandler, ok := endpoints[method][c.Query("q")]; !ok {
				response.Status = fiber.StatusBadRequest

				logger.Sugar().Infof(`invalid value for "q" in query: %s`, c.Query("q"))
			} else {
				response = requestHandler(c)
			}

			return response.send(c)
		})
	}
}
