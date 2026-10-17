//go:build windows

package main

import (
	"os/exec"
	"syscall"
)

func init() {
	// Umlaute und Symbole in der Konsole richtig anzeigen
	kernel32 := syscall.NewLazyDLL("kernel32.dll")
	kernel32.NewProc("SetConsoleOutputCP").Call(65001)
	kernel32.NewProc("SetConsoleCP").Call(65001)
}

// hidden startet Hilfsprogramme (taskkill, tasklist, Update.exe) ohne eigenes Konsolenfenster
func hidden(cmd *exec.Cmd) *exec.Cmd {
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000} // CREATE_NO_WINDOW
	return cmd
}
