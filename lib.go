package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"reflect"
	"strconv"
)

func ptr[T any](v T) *T {
	return &v
}

func strucToMap(data any) (map[string]any, error) {
	result := make(map[string]any)

	v := reflect.ValueOf(data)

	if v.Kind() != reflect.Struct {
		return nil, fmt.Errorf("expected a struct but got %T", data)
	}

	for ii := 0; ii < v.NumField(); ii++ {
		field := v.Type().Field(ii)
		value := v.Field(ii)

		// skip unexported fields
		if field.PkgPath != "" {
			continue
		}

		result[field.Tag.Get("json")] = value.Interface()
	}

	return result, nil
}

func queryInt(v *http.Request, key string) (int, error) {
	if val := v.URL.Query().Get(key); val == "" {
		return 0, fmt.Errorf("query doesn't %q", key)
	} else if iVal, err := strconv.Atoi(val); err != nil {
		return 0, err
	} else {
		return iVal, nil
	}
}

func bodyDecode(r *http.Request, v any) error {
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	err := decoder.Decode(&v)

	return err
}
