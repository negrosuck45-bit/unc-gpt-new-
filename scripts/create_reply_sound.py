import math
import wave
from pathlib import Path

sample_rate = 44100
duration = 0.62
frames = int(sample_rate * duration)
output = Path(__file__).resolve().parents[1] / 'public' / 'reply-complete.wav'

notes = [(523.25, 0.0, 0.22), (659.25, 0.09, 0.27), (783.99, 0.18, 0.38)]
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
                attack = min(1.0, local / 0.018)
                release = min(1.0, max(0.0, (length - local) / 0.13))
                envelope = attack * release
                value += 0.16 * envelope * math.sin(2 * math.pi * frequency * local)
                value += 0.035 * envelope * math.sin(2 * math.pi * frequency * 2 * local)
        fade = min(1.0, t / 0.02, (duration - t) / 0.08)
        sample = max(-1.0, min(1.0, value * max(0.0, fade)))
        wav.writeframes(int(sample * 32767).to_bytes(2, 'little', signed=True))
