import math
import wave
from pathlib import Path

sample_rate = 44100
duration = 0.42
frames = int(sample_rate * duration)
output = Path(__file__).resolve().parents[1] / 'public' / 'reply-complete.wav'

# A restrained two-note soft chime: short attack, warm sine partial, gentle release.
notes = [(659.25, 0.0, 0.22), (783.99, 0.105, 0.29)]
with wave.open(str(output), 'wb') as wav:
    wav.setnchannels(1)
    wav.setsampwidth(2)
    wav.setframerate(sample_rate)
    for i in range(frames):
        t = i / sample_rate
        value = 0.0
        for frequency, start, length in notes:
            local = t - start
            if 0 <= local <= length:
                attack = min(1.0, local / 0.012)
                release = min(1.0, max(0.0, (length - local) / 0.12))
                envelope = attack * release
                value += 0.11 * envelope * math.sin(2 * math.pi * frequency * local)
                value += 0.018 * envelope * math.sin(2 * math.pi * frequency * 2 * local)
        fade = min(1.0, t / 0.015, (duration - t) / 0.06)
        sample = max(-1.0, min(1.0, value * max(0.0, fade)))
        wav.writeframes(int(sample * 32767).to_bytes(2, 'little', signed=True))
