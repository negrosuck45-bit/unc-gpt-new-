import math
import wave
from pathlib import Path

sample_rate = 44100
duration = 0.34
frames = int(sample_rate * duration)
output = Path(__file__).resolve().parents[1] / 'public' / 'reply-complete.wav'

# One soft, low-volume rounded tone with a gentle tail.
frequency = 784.0
with wave.open(str(output), 'wb') as wav:
    wav.setnchannels(1)
    wav.setsampwidth(2)
    wav.setframerate(sample_rate)
    for i in range(frames):
        t = i / sample_rate
        attack = min(1.0, t / 0.012)
        release = max(0.0, min(1.0, (duration - t) / 0.16))
        envelope = attack * release
        tone = math.sin(2 * math.pi * frequency * t)
        warm = 0.08 * math.sin(2 * math.pi * frequency * 2 * t)
        sample = max(-1.0, min(1.0, 0.075 * envelope * (tone + warm)))
        wav.writeframes(int(sample * 32767).to_bytes(2, 'little', signed=True))
