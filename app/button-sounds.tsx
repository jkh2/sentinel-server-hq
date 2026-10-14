"use client";

import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";

const PREFERENCE = "poop-clan-button-sounds-v1";
type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };

/** Synthesized locally: no recording, download, or external audio request. */
function fart(context: AudioContext) {
  const now = context.currentTime;
  const duration = 0.22 + Math.random() * 0.13;
  const voice = context.createGain();
  voice.gain.setValueAtTime(0.001, now);
  voice.gain.exponentialRampToValueAtTime(0.24, now + 0.018);
  voice.gain.exponentialRampToValueAtTime(0.001, now + duration);
  voice.connect(context.destination);

  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(460 + Math.random() * 230, now);
  filter.frequency.exponentialRampToValueAtTime(95, now + duration);
  filter.Q.value = 1.3;
  filter.connect(voice);

  const buzz = context.createOscillator();
  buzz.type = "sawtooth";
  buzz.frequency.setValueAtTime(80 + Math.random() * 45, now);
  buzz.frequency.exponentialRampToValueAtTime(27, now + duration);
  const buzzGain = context.createGain();
  buzzGain.gain.value = 0.42;
  buzz.connect(buzzGain).connect(filter);

  const sampleCount = Math.ceil(context.sampleRate * duration);
  const buffer = context.createBuffer(1, sampleCount, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < sampleCount; i++) {
    const t = i / context.sampleRate;
    const flutter = 0.22 + 0.78 * Math.pow(Math.max(0, Math.sin(t * Math.PI * 2 * 31)), 0.5);
    data[i] = (Math.random() * 2 - 1) * flutter * 0.8;
  }
  const noise = context.createBufferSource();
  noise.buffer = buffer;
  noise.connect(filter);
  buzz.start(now); noise.start(now);
  buzz.stop(now + duration); noise.stop(now + duration);
  noise.onended = () => { noise.disconnect(); buzz.disconnect(); buzzGain.disconnect(); filter.disconnect(); voice.disconnect(); };
}

export default function ButtonSounds() {
  const [enabled, setEnabled] = useState(true);
  const enabledRef = useRef(true), contextRef = useRef<AudioContext | null>(null), lastClick = useRef(0);
  const playRef = useRef<() => void>(() => {});

  useEffect(() => {
    try { const on = window.localStorage.getItem(PREFERENCE) !== "off"; enabledRef.current = on; setEnabled(on); } catch { /* Keep the requested default when storage is unavailable. */ }
    function play() {
      if (!enabledRef.current) return;
      const time = performance.now();
      if (time - lastClick.current < 65) return;
      lastClick.current = time;
      try {
        const Constructor = window.AudioContext || (window as AudioWindow).webkitAudioContext;
        if (!Constructor) return;
        const context = contextRef.current || new Constructor();
        contextRef.current = context;
        if (context.state === "suspended") void context.resume().then(() => { if (enabledRef.current && context.state === "running") fart(context); }).catch(() => {});
        else if (context.state === "running") fart(context);
      } catch { /* Sound must never interfere with a button's actual action. */ }
    }
    playRef.current = play;
    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest("button, [role='button'], input[type='submit'], input[type='button'], a.button, summary") : null;
      if (!target || target.hasAttribute("disabled") || target.getAttribute("aria-disabled") === "true") return;
      play();
    };
    document.addEventListener("click", onClick, true);
    return () => { document.removeEventListener("click", onClick, true); playRef.current = () => {}; if (contextRef.current) void contextRef.current.close().catch(() => {}); contextRef.current = null; };
  }, []);

  function toggle() {
    const next = !enabledRef.current;
    enabledRef.current = next;
    setEnabled(next);
    try { window.localStorage.setItem(PREFERENCE, next ? "on" : "off"); } catch { /* The control still works for this visit. */ }
    if (next) playRef.current();
  }

  return <button type="button" className={`sound-toggle ${enabled ? "enabled" : ""}`} onClick={toggle} aria-pressed={enabled} aria-label={enabled ? "Mute fart button sounds" : "Enable fart button sounds"} title={enabled ? "Button farts: on. Click to mute." : "Button farts: muted. Click to enable."}>{enabled ? <Volume2 size={17} /> : <VolumeX size={17} />}<span>Sounds {enabled ? "on" : "off"}</span></button>;
}
