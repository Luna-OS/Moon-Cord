package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

// candidate ist ein möglicher Discord-Ordner mit Anzeigenamen.
type candidate struct{ name, dir string }

func candidates() []candidate {
	var list []candidate
	add := func(name string, dirs ...string) {
		for _, d := range dirs {
			if d != "" {
				list = append(list, candidate{name, d})
			}
		}
	}

	switch runtime.GOOS {
	case "windows":
		local, roaming := os.Getenv("LOCALAPPDATA"), os.Getenv("APPDATA")
		for _, v := range []struct{ name, dir string }{
			{"Discord", "Discord"}, {"Discord PTB", "DiscordPTB"},
			{"Discord Canary", "DiscordCanary"}, {"Discord Dev", "DiscordDevelopment"},
		} {
			add(v.name, join(local, v.dir), join(roaming, strings.ToLower(v.dir)))
			add(v.name, join(os.Getenv("ProgramFiles"), v.dir), join(os.Getenv("ProgramFiles(x86)"), v.dir))
		}
	case "linux":
		config := configHome()
		add("Discord", filepath.Join(config, "discord"))
		add("Discord PTB", filepath.Join(config, "discordptb"))
		add("Discord Canary", filepath.Join(config, "discordcanary"))
		add("Discord (System)", "/usr/share/discord", "/usr/lib/discord", "/usr/lib64/discord", "/opt/discord", "/opt/Discord")
	}
	return list
}

func join(base, dir string) string {
	if base == "" {
		return ""
	}
	return filepath.Join(base, dir)
}

func searchedDirs() []string {
	var dirs []string
	for _, c := range candidates() {
		dirs = append(dirs, c.dir)
	}
	return dirs
}

func findInstalls() []discordInstall {
	var found []discordInstall
	seen := map[string]bool{}
	add := func(d discordInstall) {
		key := strings.ToLower(filepath.Clean(d.Root))
		if !seen[key] {
			seen[key] = true
			found = append(found, d)
		}
	}

	for _, c := range candidates() {
		if len(resourceDirs(c.dir)) > 0 {
			add(discordInstall{Name: c.name, Root: c.dir, Exe: exeFor(c.dir)})
		}
	}
	// Läuft Discord gerade? Dann wissen wir genau, wo es liegt – egal wo installiert
	for _, path := range runningDiscordPaths() {
		if d, err := installFromPath(path); err == nil {
			add(d)
		}
	}
	return found
}

// installFromPath macht aus Discord.exe, einer Verknüpfung, app-*/resources oder dem
// Discord-Ordner selbst eine Installation.
func installFromPath(path string) (discordInstall, error) {
	path = filepath.Clean(strings.Trim(path, "\"' "))
	if strings.EqualFold(filepath.Ext(path), ".lnk") {
		target := resolveShortcut(path)
		if target == "" {
			return discordInstall{}, fmt.Errorf("Verknüpfung %s konnte nicht gelesen werden", path)
		}
		path = target
	}
	if strings.Contains(strings.ToLower(path), `\windowsapps\`) {
		return discordInstall{}, fmt.Errorf("das ist Discord aus dem Microsoft Store – das lässt sich nicht verändern. Bitte Discord von https://discord.com/download installieren")
	}

	info, err := os.Stat(path)
	if err != nil {
		return discordInstall{}, fmt.Errorf("%s gibt es nicht", path)
	}
	if !info.IsDir() {
		path = filepath.Dir(path) // Discord.exe / Update.exe
	}

	// Vom Unterordner zur Installation hochgehen: …/app-1.0.x/resources → …
	given := path
	for i := 0; i < 3 && len(resourceDirs(path)) == 0; i++ {
		parent := filepath.Dir(path)
		if parent == path {
			break
		}
		path = parent
	}
	if len(resourceDirs(path)) == 0 {
		return discordInstall{}, fmt.Errorf("in %s ist kein Discord (app-*/resources/app.asar) zu finden", given)
	}
	// app-1.0.x selbst → der Ordner darüber, damit alle Versionen und Discord-Updates erfasst werden
	if parent := filepath.Dir(path); strings.HasPrefix(filepath.Base(path), "app-") && len(resourceDirs(parent)) > 0 {
		path = parent
	}

	name := "Discord"
	lower := strings.ToLower(filepath.Base(path))
	switch {
	case strings.Contains(lower, "ptb"):
		name = "Discord PTB"
	case strings.Contains(lower, "canary"):
		name = "Discord Canary"
	case strings.Contains(lower, "development"):
		name = "Discord Dev"
	}
	return discordInstall{Name: name, Root: path, Exe: exeFor(path)}, nil
}

// exeFor sucht den Programmnamen (Discord.exe, DiscordPTB.exe, …) in der neuesten Version.
func exeFor(root string) string {
	if runtime.GOOS != "windows" {
		return ""
	}
	dirs := resourceDirs(root)
	if len(dirs) > 0 {
		entries, _ := os.ReadDir(filepath.Dir(dirs[0]))
		for _, e := range entries {
			n := e.Name()
			if strings.HasPrefix(strings.ToLower(n), "discord") && strings.EqualFold(filepath.Ext(n), ".exe") {
				return n
			}
		}
	}
	return "Discord.exe"
}

// runningDiscordPaths liefert die Programmpfade laufender Discord-Prozesse.
func runningDiscordPaths() []string {
	var out []byte
	switch runtime.GOOS {
	case "windows":
		out, _ = hidden(exec.Command("powershell", "-NoProfile", "-NonInteractive", "-Command",
			"Get-Process -Name Discord* -ErrorAction SilentlyContinue | ForEach-Object { $_.Path }")).Output()
	case "linux":
		matches, _ := filepath.Glob("/proc/[0-9]*/exe")
		var paths []string
		for _, m := range matches {
			if target, err := os.Readlink(m); err == nil && strings.EqualFold(filepath.Base(target), "Discord") {
				paths = append(paths, target)
			}
		}
		return paths
	}
	var paths []string
	for _, line := range strings.Split(string(out), "\n") {
		if line = strings.TrimSpace(line); line != "" {
			paths = append(paths, line)
		}
	}
	return paths
}

// resolveShortcut liest das Ziel einer Windows-Verknüpfung (.lnk).
func resolveShortcut(lnk string) string {
	if runtime.GOOS != "windows" {
		return ""
	}
	script := "(New-Object -ComObject WScript.Shell).CreateShortcut($env:MOON_LNK).TargetPath"
	cmd := hidden(exec.Command("powershell", "-NoProfile", "-NonInteractive", "-Command", script))
	cmd.Env = append(os.Environ(), "MOON_LNK="+lnk)
	out, err := cmd.Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}
