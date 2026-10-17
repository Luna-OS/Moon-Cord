// Moon-Cord für Discord – Installer
//
// Klinkt Moon-Cord (Moon-Theme + alle Vencord-Plugins) in das installierte,
// offizielle Discord ein. Discord bleibt Discord: eigener Sprach- und Stream-Motor,
// Hardware-Kodierung, globale Tastenkürzel, Krisp, Overlay – nur eben im Moon-Design.
//
// Vorgehen wie beim offiziellen Vencord-Installer: Discords app.asar wird zu
// _app.asar, an ihre Stelle kommt eine kleine app.asar, die Moon-Cord lädt.
// Nach Discord-Updates repariert sich das selbst (Vencord persistAfterDiscordUpdates);
// sonst einfach den Installer noch einmal starten.
package main

import (
	"bufio"
	"embed"
	"errors"
	"flag"
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"time"
)

//go:embed files/patcher.js files/preload.js files/renderer.js files/renderer.css files/settings.json files/version.txt
var payload embed.FS

var moonFiles = []string{"patcher.js", "preload.js", "renderer.js", "renderer.css"}

type discordInstall struct {
	Name string // z. B. "Discord", "Discord PTB"
	Root string // Ordner mit app-*/resources (oder direkt resources)
	Exe  string // Prozessname unter Windows
}

func main() {
	doInstall := flag.Bool("install", false, "ohne Nachfrage installieren bzw. reparieren")
	doUninstall := flag.Bool("uninstall", false, "ohne Nachfrage entfernen")
	root := flag.String("root", "", "Discord-Ordner selbst angeben (enthält app-*/resources)")
	noStart := flag.Bool("no-start", false, "Discord danach nicht starten")
	flag.Parse()
	interactive := !*doInstall && !*doUninstall

	version, _ := payload.ReadFile("files/version.txt")
	fmt.Printf("\n  🌙 Moon-Cord für Discord  %s\n\n", strings.TrimSpace(string(version)))

	var installs []discordInstall
	if *root != "" {
		installs = []discordInstall{{Name: "Discord", Root: *root, Exe: "Discord.exe"}}
	} else {
		installs = findInstalls()
	}

	if len(installs) == 0 {
		fmt.Println("  Kein installiertes Discord gefunden.")
		fmt.Println("  Bitte zuerst Discord installieren: https://discord.com/download")
		finish(interactive, 1)
	}

	fmt.Println("  Gefunden:")
	for _, d := range installs {
		state := "Original"
		if isPatched(d) {
			state = "Moon-Cord/Vencord eingebaut"
		}
		fmt.Printf("    • %-16s %s  (%s)\n", d.Name, d.Root, state)
	}
	fmt.Println()

	action := ""
	switch {
	case *doInstall:
		action = "install"
	case *doUninstall:
		action = "uninstall"
	default:
		fmt.Println("  [1] Moon-Cord installieren / reparieren")
		fmt.Println("  [2] Moon-Cord entfernen (Discord wieder original)")
		fmt.Println("  [0] Abbrechen")
		fmt.Print("\n  Auswahl: ")
		switch readLine() {
		case "1", "":
			action = "install"
		case "2":
			action = "uninstall"
		default:
			finish(interactive, 0)
		}
		fmt.Println()
	}

	failed := false
	if action == "install" {
		if err := writeMoonFiles(); err != nil {
			fmt.Println("  ✖ Konnte Moon-Cord-Dateien nicht schreiben:", err)
			finish(interactive, 1)
		}
		writeDefaultSettings()
	}

	for _, d := range installs {
		wasRunning := stopDiscord(d)

		var err error
		if action == "install" {
			err = patch(d)
		} else {
			err = unpatch(d)
		}

		if err != nil {
			failed = true
			fmt.Printf("  ✖ %s: %v\n", d.Name, err)
		} else if action == "install" {
			fmt.Printf("  ✔ %s: Moon-Cord ist drin\n", d.Name)
		} else {
			fmt.Printf("  ✔ %s: wieder original\n", d.Name)
		}

		if !*noStart && (wasRunning || action == "install") {
			startDiscord(d)
		}
	}

	fmt.Println()
	if failed {
		fmt.Println("  Nicht alles hat geklappt. Discord komplett schließen (auch im Tray) und noch einmal versuchen.")
		finish(interactive, 1)
	}
	if action == "install" {
		fmt.Println("  Fertig! Discord startet jetzt im Moon-Design.")
		fmt.Println("  Einstellungen: Benutzereinstellungen → Moon-Cord. Updates kommen automatisch.")
	} else {
		fmt.Println("  Fertig! Discord ist wieder original.")
	}
	finish(interactive, 0)
}

// ---------- Discord finden ----------

func findInstalls() []discordInstall {
	var found []discordInstall
	add := func(name, root, exe string) {
		if len(resourceDirs(root)) > 0 {
			found = append(found, discordInstall{name, root, exe})
		}
	}

	switch runtime.GOOS {
	case "windows":
		local := os.Getenv("LOCALAPPDATA")
		add("Discord", filepath.Join(local, "Discord"), "Discord.exe")
		add("Discord PTB", filepath.Join(local, "DiscordPTB"), "DiscordPTB.exe")
		add("Discord Canary", filepath.Join(local, "DiscordCanary"), "DiscordCanary.exe")
		add("Discord Dev", filepath.Join(local, "DiscordDevelopment"), "DiscordDevelopment.exe")
	case "linux":
		config := configHome()
		add("Discord", filepath.Join(config, "discord"), "")
		add("Discord PTB", filepath.Join(config, "discordptb"), "")
		add("Discord Canary", filepath.Join(config, "discordcanary"), "")
		for _, dir := range []string{"/usr/share/discord", "/usr/lib/discord", "/usr/lib64/discord", "/opt/discord", "/opt/Discord"} {
			add("Discord (System)", dir, "")
		}
	}
	return found
}

// resourceDirs liefert alle resources-Ordner einer Installation, neueste Version zuerst.
func resourceDirs(root string) []string {
	var dirs []string
	entries, _ := os.ReadDir(root)
	var versions []string
	for _, e := range entries {
		if e.IsDir() && strings.HasPrefix(e.Name(), "app-") {
			versions = append(versions, e.Name())
		}
	}
	sort.Slice(versions, func(i, j int) bool { return versionLess(versions[j], versions[i]) })
	for _, v := range versions {
		res := filepath.Join(root, v, "resources")
		if hasDiscordAsar(res) {
			dirs = append(dirs, res)
		}
	}
	if res := filepath.Join(root, "resources"); hasDiscordAsar(res) {
		dirs = append(dirs, res)
	}
	return dirs
}

func hasDiscordAsar(res string) bool {
	return exists(filepath.Join(res, "app.asar")) || exists(filepath.Join(res, "_app.asar"))
}

func versionLess(a, b string) bool {
	pa := strings.Split(strings.TrimPrefix(a, "app-"), ".")
	pb := strings.Split(strings.TrimPrefix(b, "app-"), ".")
	for i := 0; i < len(pa) && i < len(pb); i++ {
		na, _ := strconv.Atoi(pa[i])
		nb, _ := strconv.Atoi(pb[i])
		if na != nb {
			return na < nb
		}
	}
	return len(pa) < len(pb)
}

func isPatched(d discordInstall) bool {
	dirs := resourceDirs(d.Root)
	return len(dirs) > 0 && exists(filepath.Join(dirs[0], "_app.asar"))
}

// ---------- Dateien ----------

func configHome() string {
	if dir := os.Getenv("XDG_CONFIG_HOME"); dir != "" {
		return dir
	}
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".config")
}

// appData: %APPDATA% unter Windows, ~/.config unter Linux – dort, wo auch Discord seine Daten hat
func appData() string {
	if runtime.GOOS == "windows" {
		return os.Getenv("APPDATA")
	}
	return configHome()
}

func moonDir() string { return filepath.Join(appData(), "Moon-Cord-Discord") }

func writeMoonFiles() error {
	dir := moonDir()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	for _, name := range moonFiles {
		data, err := payload.ReadFile("files/" + name)
		if err != nil {
			return err
		}
		if err := os.WriteFile(filepath.Join(dir, name), data, 0o644); err != nil {
			return err
		}
	}
	return nil
}

// Moon-Standardeinstellungen nur, wenn es noch keine Vencord-Einstellungen gibt
func writeDefaultSettings() {
	file := filepath.Join(appData(), "Vencord", "settings", "settings.json")
	if exists(file) {
		return
	}
	data, err := payload.ReadFile("files/settings.json")
	if err != nil {
		return
	}
	if os.MkdirAll(filepath.Dir(file), 0o755) == nil {
		_ = os.WriteFile(file, data, 0o644)
	}
}

// ---------- Einbauen / Entfernen ----------

func patch(d discordInstall) error {
	dirs := resourceDirs(d.Root)
	if len(dirs) == 0 {
		return errors.New("keine app.asar gefunden")
	}
	shim, err := shimAsar(filepath.Join(moonDir(), "patcher.js"))
	if err != nil {
		return err
	}

	for _, res := range dirs {
		asar := filepath.Join(res, "app.asar")
		backup := filepath.Join(res, "_app.asar")

		if !exists(backup) {
			if isShim(asar) {
				return fmt.Errorf("%s ist schon verändert, aber das Original fehlt – bitte Discord neu installieren", res)
			}
			if err := retry(func() error { return os.Rename(asar, backup) }); err != nil {
				return fmt.Errorf("Discord läuft noch? %w", err)
			}
		}
		if err := retry(func() error { return os.WriteFile(asar, shim, 0o644) }); err != nil {
			return err
		}
		if exists(filepath.Join(res, "app")) {
			fmt.Printf("    ⚠ In %s liegt ein Ordner \"app\" (anderer Mod?) – Discord lädt den statt Moon-Cord.\n", res)
		}
	}
	return nil
}

func unpatch(d discordInstall) error {
	for _, res := range resourceDirs(d.Root) {
		asar := filepath.Join(res, "app.asar")
		backup := filepath.Join(res, "_app.asar")
		if !exists(backup) {
			continue
		}
		if err := retry(func() error {
			if err := os.Remove(asar); err != nil && !errors.Is(err, fs.ErrNotExist) {
				return err
			}
			return os.Rename(backup, asar)
		}); err != nil {
			return fmt.Errorf("Discord läuft noch? %w", err)
		}
	}
	return nil
}

// ---------- Discord beenden / starten ----------

func stopDiscord(d discordInstall) bool {
	switch runtime.GOOS {
	case "windows":
		if d.Exe == "" {
			return false
		}
		out, _ := exec.Command("tasklist", "/FI", "IMAGENAME eq "+d.Exe, "/NH").Output()
		if !strings.Contains(strings.ToLower(string(out)), strings.ToLower(d.Exe)) {
			return false
		}
		fmt.Printf("  … %s wird kurz beendet\n", d.Name)
		_ = hidden(exec.Command("taskkill", "/F", "/T", "/IM", d.Exe)).Run()
	default:
		// Nur Discord selbst treffen (…/app-<version>/Discord bzw. …/Discord), nicht diesen Installer
		pattern := filepath.Join(d.Root, "Discord")
		if dirs := resourceDirs(d.Root); len(dirs) > 0 && strings.Contains(dirs[0], string(os.PathSeparator)+"app-") {
			pattern = filepath.Join(d.Root, "app-")
		}
		if hidden(exec.Command("pgrep", "-f", pattern)).Run() != nil {
			return false
		}
		fmt.Printf("  … %s wird kurz beendet\n", d.Name)
		_ = hidden(exec.Command("pkill", "-f", pattern)).Run()
	}
	time.Sleep(1500 * time.Millisecond)
	return true
}

func startDiscord(d discordInstall) {
	if runtime.GOOS != "windows" {
		return // unter Linux startet man Discord wie gewohnt selbst
	}
	updater := filepath.Join(d.Root, "Update.exe")
	if !exists(updater) || d.Exe == "" {
		return
	}
	_ = hidden(exec.Command(updater, "--processStart", d.Exe)).Start()
}

// ---------- Hilfen ----------

func exists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

// Windows gibt Dateien nach dem Beenden von Discord manchmal erst nach einem Moment frei
func retry(f func() error) error {
	var err error
	for i := 0; i < 20; i++ {
		if err = f(); err == nil {
			return nil
		}
		time.Sleep(500 * time.Millisecond)
	}
	return err
}

var stdin = bufio.NewReader(os.Stdin)

func readLine() string {
	line, _ := stdin.ReadString('\n')
	return strings.TrimSpace(line)
}

func finish(interactive bool, code int) {
	if interactive {
		fmt.Print("\n  Enter drücken zum Schließen …")
		readLine()
	}
	os.Exit(code)
}
