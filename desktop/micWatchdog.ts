/*
 * Moon-Cord – Mikrofon-Wächter
 * Copyright (c) 2026 Luna
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Problem: Nach einer Weile im Sprachkanal kommt vom Mikrofon nichts mehr an.
 * Erst Stummschalten + wieder Einschalten (oder neu beitreten) hilft.
 * Ursache ist, dass Chromiums Mikrofon-Aufnahme hängen bleibt – die Spur liefert
 * keine Daten mehr oder nur noch exakte Stille.
 *
 * Moon-Cord prüft deshalb im Sprachkanal alle paar Sekunden, ob das Mikrofon noch
 * Ton liefert. Ein echtes Mikrofon rauscht immer ein wenig – kommt über längere
 * Zeit exakt gar nichts mehr, wird automatisch kurz stumm- und wieder
 * eingeschaltet (ohne Ton-Effekt). Genau das, was sonst von Hand hilft.
 */

import { Logger } from "@vencord/types/utils";
import { findByPropsLazy } from "@vencord/types/webpack";
import { MediaEngineStore, SelectedChannelStore } from "@vencord/types/webpack/common";

const logger = new Logger("MoonCordMic", "#8e7cff");

const CHECK_EVERY = 3000;
const DEAD_CHECKS = 5; // 15 s ohne jedes Signal
const COOLDOWN = 60_000; // höchstens ein Reparaturversuch pro Minute
const MAX_FAILED_RECOVERIES = 3; // dann warten, bis wieder Ton kommt (z. B. Mikro-Hardware-Stummschalter)

const AudioActions = findByPropsLazy("toggleSelfMute", "setTemporarySelfMute");

interface WatchedMic {
    track: MediaStreamTrack;
    probe: MediaStreamTrack;
    analyser: AnalyserNode;
    buffer: Float32Array<ArrayBuffer>;
}

let audioContext: AudioContext | null = null;
let mic: WatchedMic | null = null;
let deadChecks = 0;
let lastRecovery = 0;
let failedRecoveries = 0;

function watch(track: MediaStreamTrack) {
    if (track.kind !== "audio" || track.label === "vencord-screen-share") return;

    try {
        audioContext ??= new AudioContext();
        // Eigene Kopie der Spur: bleibt aktiv, auch wenn Discord die Original-Spur stummschaltet
        const probe = track.clone();
        probe.enabled = true;
        const source = audioContext.createMediaStreamSource(new MediaStream([probe]));
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        source.connect(analyser);

        mic?.probe.stop();
        mic = { track, probe, analyser, buffer: new Float32Array(analyser.fftSize) };
        deadChecks = 0;
    } catch (e) {
        logger.error("Kann Mikrofon nicht überwachen", e);
    }
}

const originalGetUserMedia = navigator.mediaDevices.getUserMedia;
navigator.mediaDevices.getUserMedia = async function (this: MediaDevices, constraints?: MediaStreamConstraints) {
    const stream = await originalGetUserMedia.call(this, constraints);
    if (constraints?.audio) stream.getAudioTracks().forEach(watch);
    return stream;
};

function isSignalDead(m: WatchedMic) {
    if (m.track.readyState === "ended" || m.probe.readyState === "ended") return true;
    if (m.track.muted) return true; // Gerät liefert keine Daten mehr

    m.analyser.getFloatTimeDomainData(m.buffer);
    let peak = 0;
    for (const sample of m.buffer) peak = Math.max(peak, Math.abs(sample));
    return peak === 0; // exakte digitale Stille – ein echtes Mikrofon rauscht immer
}

function recover() {
    lastRecovery = Date.now();
    failedRecoveries++;
    logger.warn(`Mikrofon liefert nichts mehr – schalte kurz stumm und wieder an (Versuch ${failedRecoveries})`);

    const options = { playSoundEffect: false, location: "Moon-Cord Mikrofon-Wächter" };
    AudioActions.toggleSelfMute(options);
    setTimeout(() => AudioActions.toggleSelfMute(options), 400);
}

function check() {
    try {
        const inVoice = SelectedChannelStore?.getVoiceChannelId?.() != null;
        const muted = MediaEngineStore?.isSelfMute?.() || MediaEngineStore?.isSelfDeaf?.();
        if (!inVoice || muted || !mic) {
            deadChecks = 0;
            return;
        }

        if (audioContext?.state === "suspended") audioContext.resume().catch(() => { });

        if (!isSignalDead(mic)) {
            deadChecks = 0;
            failedRecoveries = 0;
            return;
        }

        deadChecks++;
        if (deadChecks < DEAD_CHECKS) return;
        if (Date.now() - lastRecovery < COOLDOWN) return;
        if (failedRecoveries >= MAX_FAILED_RECOVERIES) return;

        deadChecks = 0;
        recover();
    } catch (e) {
        logger.error("Mikrofon-Prüfung fehlgeschlagen", e);
    }
}

setInterval(check, CHECK_EVERY);
