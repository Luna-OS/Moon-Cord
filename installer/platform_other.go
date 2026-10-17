//go:build !windows

package main

import "os/exec"

func hidden(cmd *exec.Cmd) *exec.Cmd { return cmd }
