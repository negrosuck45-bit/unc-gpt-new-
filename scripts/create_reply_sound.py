import math
import wave
from pathlib import Path

sample_rate = 44100
duration = 0.16
frames = int(sample_rate * duration)
output = Path(__file__).resolve().parents[1] / 'public' / 'reply-complete.wav'

# Clean iOS-style tactile tap: one rounded body plus a very restrained high tail.
with wave.open(str(output), 'wb') as wav:
    wav.setnchannels(1)
    wav.setsampwidth(2)
    wav.setframerate(sample_rate)
    for i in range(frames):
        t = i / sample_rate
        attack = min(1.0, t / 0.004)
        release = max(0.0, min(1.0, (duration - t) / 0.085))
        envelope = attack * release
        body = math.sin(2 * math.pi * 820 * t) * 0.82
        tail_env = max(0.0, min(1.0, (0.115 - t) / 0.075))
        glass_tail = math.sin(2 * math.pi * 1750 * t) * 0.09 * tail_env
        sample = max(-1.0, min(1.0, 0.030 * envelope * (body + glass_tail)))
        wav.writeframes(int(sample * 32767).to_bytes(2, 'little', signed=True))
