package main

import (
	"fmt"
	"reflect"
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
