/*
 * Moon-Cord – Bildschirmübertragung nicht ständig neu auswählen
 * Copyright (c) 2026 Luna
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Vesktop öffnet bei jeder Anfrage von Discord den "Screen Share Picker".
 * Discord fragt aber auch mitten in einer laufenden Übertragung neu an
 * (z. B. nach kurzen Verbindungsabbrüchen oder einem Sprachserver-Wechsel) –
 * dann ploppt der Picker auf, obwohl man schon überträgt.
 *
 * Läuft schon eine Übertragung und kam die neue Anfrage nicht von einem
 * eigenen Klick, nimmt Moon-Cord still dieselbe Quelle wieder.
 * Klickt man selbst (z. B. "Fenster wechseln"), erscheint der Picker wie gewohnt.
 */

import type { StreamPick } from "./components/ScreenSharePicker";

interface Source {
    id: string;
}

let lastPick: StreamPick | null = null;
let activeTrack: MediaStreamTrack | null = null;
let lastRequestFromUser = true;

const mediaDevices = navigator.mediaDevices;
const originalGetDisplayMedia = mediaDevices.getDisplayMedia;

mediaDevices.getDisplayMedia = async function (this: MediaDevices, options?: DisplayMediaStreamOptions) {
    // Hat der Nutzer gerade geklickt? Automatische Neu-Anfragen von Discord haben keine Nutzeraktion.
    lastRequestFromUser = navigator.userActivation?.isActive ?? true;

    const stream = await originalGetDisplayMedia.call(this, options);

    const track = stream.getVideoTracks()[0];
    if (track) {
        activeTrack = track;
        track.addEventListener("ended", () => {
            if (activeTrack === track) activeTrack = null;
        });
    }

    return stream;
};

/** Läuft gerade eine eigene Übertragung? */
export function isStreaming() {
    return activeTrack?.readyState === "live";
}

export function rememberStreamPick(pick: StreamPick) {
    lastPick = pick;
}

export function getReusableStreamPick(screens: Source[]): StreamPick | null {
    if (lastRequestFromUser || !lastPick) return null;
    if (activeTrack?.readyState !== "live") return null;
    if (!screens.some(s => s.id === lastPick!.id)) return null;

    console.log("[Moon-Cord] Übertragung läuft schon – nehme dieselbe Quelle wieder:", lastPick.id);
    return lastPick;
}
