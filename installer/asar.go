package main

import (
	"encoding/binary"
	"encoding/json"
	"os"
	"strconv"
	"strings"
)

// shimAsar baut die kleine app.asar, die Discord statt seiner eigenen lädt.
// Sie enthält nur index.js (lädt Moon-Cords patcher.js) und package.json.
// Discords Original liegt daneben als _app.asar und wird vom Patcher geladen –
// genau wie beim offiziellen Vencord-Installer, damit Vencords Reparatur nach
// Discord-Updates (persistAfterDiscordUpdates) funktioniert.
func shimAsar(patcherPath string) ([]byte, error) {
	quoted, err := json.Marshal(patcherPath)
	if err != nil {
		return nil, err
	}
	files := []struct {
		name string
		data []byte
	}{
		{"index.js", []byte("require(" + string(quoted) + ");\n")},
		{"package.json", []byte(`{"name":"discord","main":"index.js"}` + "\n")},
	}

	type entry struct {
		Size   int    `json:"size"`
		Offset string `json:"offset"`
	}
	header := struct {
		Files map[string]entry `json:"files"`
	}{Files: map[string]entry{}}

	var body []byte
	for _, f := range files {
		header.Files[f.name] = entry{Size: len(f.data), Offset: strconv.Itoa(len(body))}
		body = append(body, f.data...)
	}

	headerJSON, err := json.Marshal(header)
	if err != nil {
		return nil, err
	}

	// Asar = Chromium-"Pickle": [4][Kopfgröße] + [Nutzlastgröße][Textlänge][JSON, auf 4 Byte aufgefüllt] + Dateien
	padded := (len(headerJSON) + 3) &^ 3
	headerPickle := make([]byte, 8+padded)
	binary.LittleEndian.PutUint32(headerPickle[0:], uint32(4+padded))
	binary.LittleEndian.PutUint32(headerPickle[4:], uint32(len(headerJSON)))
	copy(headerPickle[8:], headerJSON)

	out := make([]byte, 8, 8+len(headerPickle)+len(body))
	binary.LittleEndian.PutUint32(out[0:], 4)
	binary.LittleEndian.PutUint32(out[4:], uint32(len(headerPickle)))
	out = append(out, headerPickle...)
	out = append(out, body...)
	return out, nil
}

// isShim erkennt eine app.asar von Moon-Cord oder Vencord (klein, lädt einen patcher.js).
func isShim(path string) bool {
	info, err := os.Stat(path)
	if err != nil || info.Size() > 64*1024 {
		return false
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return false
	}
	text := string(data)
	return strings.Contains(text, "index.js") && strings.Contains(text, "patcher.js")
}
