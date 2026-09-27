# Camera check-in and photo tracking

PulseSense now has a Python vision engine connected to the authenticated React app. It is an experimental hackathon prototype, not a telehealth service with clinician oversight.

## Start it

Python 3.11 or 3.12 is required. From the app folder:

```sh
npm run vision:setup
npm run build
npm run server
```

Setup installs OpenCV, MediaPipe, NumPy and SciPy in `vision/.venv`, then downloads Google's official face landmark model. No webcam images are used during setup. When MediaPipe cannot initialize graphics on macOS, an explicitly labeled OpenCV face-box fallback selects approximate cheek regions. It is less precise than landmarks and is also experimental. The Node server launches a private Python worker for each scan or photo request; there is no separate public Python port. Keep your existing Oura and AI keys in `.env`.

For development, run `npm run dev` in a second terminal. Camera and microphone features require localhost or HTTPS. Use a browser with camera support. Dictation depends on browser speech-recognition availability; typing remains available.

## Camera check-in

1. Open Camera check-in and read the three preparation steps. Optional ElevenLabs instructions require voice permission in Privacy center.
2. Approve processing the scan on the app server and press Start. Allow the browser camera prompt yourself.
3. Keep one face visible, still and evenly lit for 30 seconds. The preview and countdown are live; the pulse estimate is computed after capture.
4. Camera frames go to the app server, then OpenCV and MediaPipe locate cheek regions. A windowed plane-orthogonal-to-skin (POS) color projection and frequency analysis estimate a pulse in the 45–180 bpm band.
5. Frame coverage, motion, light levels, spectral concentration and agreement between halves of the scan determine whether an estimate is displayed. These are heuristic quality checks, not calibrated confidence or medical validation. Poor scans show a retry message.
6. Save an accepted estimate if you want it in your journal, dashboard and appointment briefs. It is labeled `camera-rppg` and experimental. Frames are not written to the database. Unsaved numeric results expire after ten minutes and cannot be saved twice.
7. Optional Tiger sync uploads your current measurement journal after saving, with a separate consent checkbox. This is event-based sync after a completed scan, not a continuous real-time monitor. No camera frames go to Tiger or Gemini.

Cancel stops camera capture and discards local frames. If processing has already started, the server worker may finish its in-memory computation before the timeout; nothing is saved to the journal unless you choose Save.

## Photo tracking

- Choose a photo; the browser resizes it and removes original file metadata through canvas re-encoding.
- Reuse a tracking label for the same area. Add typed or dictated notes. Browser dictation may send audio to the browser's recognition provider and starts only when requested.
- Draw a box, or adjust it using keyboard-accessible numeric inputs. Preview the OpenCV GrabCut boundary. Adjust and retry if it is not the intended area.
- Saving explicitly stores the resized photo, boundary overlay, date, note and pixel-area information in your account. Preview processing alone does not persist an image.
- Choose an earlier photo with the same label for a side-by-side view. Area percentages are relative to the image, not physical wound size or healing percentages. Framing, angle, selection and lighting can change them.
- Request Gemini observations only after approving which displayed photos and notes are sent. Privacy center must also allow Gemini. The server sends the original resized photos plus boundary metrics. Results provide observations, comparison limits and questions, not a clinical recovery score.
- Delete a saved photo and its review from the photo journal. Deleting a photo does not retract prior processing by external providers. Journal photos are separate from the Health Records JSON export.

The existing configured Gemini model is preserved. The old Gemini 1.5 Pro name in the project outline should not be hardcoded; choose a model currently available to your account.

## What remains unverified

Synthetic pulse and image tests exercise the implementation; they do not establish accuracy on people, across skin tones or devices. No real-person camera accuracy study or clinical tissue segmentation validation has been performed. A clinician-approved recovery scoring system needs a defined outcome, labeled data and validation. This prototype does not provide one.

Real camera capture and browser microphone permissions must be tried on your machine. Gemini/ElevenLabs still require working provider credentials. Tiger Data requires a configured service and migration. There is no ongoing care-team monitoring or alert delivery. Public hosting is still pending, and DigitalOcean remains excluded at your request.

## Verification

```sh
npm test
npm run vision:test
npm run build
```

Node tests use a mocked vision worker to verify consent, ownership, single-use scan saving, photo deletion and explicit AI sharing. Python tests recover a 72 bpm synthetic POS signal, reject flat/short/gapped signals and outline a synthetic colored region. A separate runtime smoke check rejects a blank video using the OpenCV fallback. MediaPipe initialization is blocked by this sandbox’s macOS graphics service; its live landmark path is not verified here. Actual photos and personal health information are not used in the automated tests.

## Technical references

- [MediaPipe face landmarks](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/python)
- [OpenCV GrabCut](https://docs.opencv.org/doc/doxygen/html/d3/d47/group__imgproc__segmentation.html)
- [Wang et al., Algorithmic Principles of Remote PPG](https://pubmed.ncbi.nlm.nih.gov/28113245/)
- [Gemini model lifecycle](https://ai.google.dev/gemini-api/docs/deprecations)
