"""Download the official MediaPipe model; run after installing requirements."""
from pathlib import Path
from urllib.request import urlopen
url='https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
target=Path(__file__).with_name('face_landmarker.task')
with urlopen(url,timeout=60) as response:
    data=response.read(10000000)
if len(data)<1000000:raise RuntimeError('Unexpected model download size')
target.write_bytes(data)
print('Face landmark model installed. Camera images are never used during setup.')
