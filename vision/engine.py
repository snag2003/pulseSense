"""Experimental image/signal processing. No diagnostic or recovery scoring."""
import base64, json, sys, os
from pathlib import Path
import cv2
import numpy as np
from scipy import signal


def decode(data):
    if not isinstance(data, str) or len(data) > 1500000:
        raise ValueError('Image is too large. Use the resized preview.')
    raw = base64.b64decode(data.split(',', 1)[-1], validate=True)
    image = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
    if image is None or image.shape[0]*image.shape[1] > 1200000:
        raise ValueError('Use an image under 1.2 megapixels.')
    return image


def estimate(times, colors):
    t=np.asarray(times,dtype=float); rgb=np.asarray(colors,dtype=float)
    if len(t)<200 or t[-1]-t[0]<20 or np.any(np.diff(t)<=0):
        return {'accepted':False,'reason':'Record at least 20 seconds of steady, well-lit video.'}
    fs=(len(t)-1)/(t[-1]-t[0]); dt=np.diff(t)
    if fs<10 or np.max(dt)>.4:
        return {'accepted':False,'reason':'Too many missing frames. Close other camera apps and retry.'}
    grid=np.linspace(t[0],t[-1],len(t)); c=np.array([np.interp(grid,t,rgb[:,k]) for k in range(3)]).T
    # Windowed POS projection (Wang et al., 2017), then pulse-band filtering.
    h=np.zeros(len(c)); counts=np.zeros(len(c)); width=int(fs*1.6)
    for end in range(width,len(c)+1):
        start=end-width; window=c[start:end]; n=window/(window.mean(axis=0)+1e-9)-1
        x=n[:,1]-n[:,2]; y=n[:,1]+n[:,2]-2*n[:,0]
        pulse=x+(np.std(x)/(np.std(y)+1e-9))*y
        h[start:end]+=pulse-pulse.mean(); counts[start:end]+=1
    h/=np.maximum(counts,1)
    if np.std(h)<1e-5:
        return {'accepted':False,'reason':'No usable color signal. Try softer, brighter front lighting.'}
    filtered=signal.sosfiltfilt(signal.butter(3,[.75,3],btype='bandpass',fs=fs,output='sos'),h)
    def peak(v):
        f,p=signal.periodogram(v,fs=fs,window='hann',nfft=max(4096,len(v)))
        band=(f>=.75)&(f<=3); f,p=f[band],p[band]; k=int(np.argmax(p))
        concentration=float(p[np.abs(f-f[k])<.12].sum()/(p.sum()+1e-12))
        return float(f[k]*60), concentration
    bpm,purity=peak(filtered); halves=[peak(v)[0] for v in np.array_split(filtered,2)]
    accepted=purity>=.5 and abs(halves[0]-halves[1])<=8
    return {'accepted':accepted,'bpm':round(bpm,1) if accepted else None,
            'reason':'Stable experimental signal' if accepted else 'Signal was inconsistent. Keep still and retry in even lighting.',
            'quality':{'spectralConcentration':round(purity,3),'halfWindowDifferenceBpm':round(abs(halves[0]-halves[1]),1),'fps':round(fs,1),'durationSeconds':round(t[-1]-t[0],1)},
            'waveform':[round(float(v),4) for v in (filtered/(np.std(filtered)+1e-9))[::max(1,len(filtered)//180)]]}


def scan(payload):
    import mediapipe as mp
    frames=payload.get('frames',[])
    if not 200<=len(frames)<=500: raise ValueError('Record a 30-second scan before processing.')
    options=mp.tasks.vision.FaceLandmarkerOptions(base_options=mp.tasks.BaseOptions(model_asset_path=str(Path(__file__).with_name('face_landmarker.task')),delegate=mp.tasks.BaseOptions.Delegate.CPU),running_mode=mp.tasks.vision.RunningMode.VIDEO,num_faces=2,min_face_detection_confidence=.6,min_tracking_confidence=.6)
    times=[]; colors=[]; centers=[]; bad_light=0; previous=-1
    detector=None;backend='MediaPipe Face Landmarker'
    try:
        detector=mp.tasks.vision.FaceLandmarker.create_from_options(options)
    except RuntimeError:
        # Sandboxed/headless macOS may deny OpenGL even for the CPU delegate.
        # Keep a clearly identified OpenCV-only face-box fallback.
        backend='OpenCV face-box fallback'
        cascade=cv2.CascadeClassifier(cv2.data.haarcascades+'haarcascade_frontalface_default.xml')
        if cascade.empty():raise ValueError('Face detector is unavailable. Run vision setup again.')
    try:
        for item in frames:
            stamp=float(item['t']); ms=int(stamp*1000)
            if not np.isfinite(stamp) or ms<=previous: raise ValueError('Invalid camera timestamps. Restart the scan.')
            previous=ms; image=decode(item['image']); rgb=cv2.cvtColor(image,cv2.COLOR_BGR2RGB)
            height,width=rgb.shape[:2];mask=np.zeros((height,width),np.uint8)
            if detector is not None:
                result=detector.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB,data=rgb),ms)
                if len(result.face_landmarks)!=1:continue
                lm=result.face_landmarks[0]
                for indexes in ([50,101,205,187,123],[280,330,425,411,352]):
                    polygon=np.array([[round(lm[i].x*width),round(lm[i].y*height)] for i in indexes],np.int32)
                    cv2.fillConvexPoly(mask,cv2.convexHull(polygon),255)
                center=[lm[1].x,lm[1].y]
            else:
                faces=cascade.detectMultiScale(cv2.cvtColor(image,cv2.COLOR_BGR2GRAY),scaleFactor=1.1,minNeighbors=6,minSize=(70,70))
                if len(faces)!=1:continue
                x,y,w,h=faces[0]
                for left,right in ((.15,.35),(.65,.85)):
                    cv2.rectangle(mask,(int(x+w*left),int(y+h*.48)),(int(x+w*right),int(y+h*.7)),255,-1)
                center=[(x+w/2)/width,(y+h/2)/height]
            pixels=rgb[mask>0]
            if len(pixels)<70:continue
            mean=pixels.mean(axis=0)
            if mean.min()<25 or mean.max()>235:bad_light+=1
            times.append(stamp);colors.append(mean);centers.append(center)
    finally:
        if detector is not None:detector.close()
    if len(times)<len(frames)*.9:return {'accepted':False,'reason':'Keep exactly one face visible throughout the scan.'}
    if bad_light>len(times)*.1:return {'accepted':False,'reason':'Lighting was too dark or overexposed. Use even front lighting.'}
    if np.max(np.std(centers,axis=0))>.018:return {'accepted':False,'reason':'Too much head movement. Rest your device and keep still.'}
    return {**estimate(times,colors),'trackingBackend':backend}


def segment(payload):
    image=decode(payload['image']); height,width=image.shape[:2]
    box=np.asarray(payload['box'],float)
    if box.shape!=(4,) or not np.all(np.isfinite(box)) or np.any(box<0) or np.any(box>1):raise ValueError('Draw a box inside the photo.')
    x,y,w,h=box
    if w<.03 or h<.03 or x+w>1 or y+h>1:raise ValueError('Draw a larger box around the area you want to track.')
    rect=(max(1,int(x*width)),max(1,int(y*height)),min(int(w*width),width-2-int(x*width)),min(int(h*height),height-2-int(y*height)))
    if min(rect[2:])<5:raise ValueError('Selection is too small.')
    mask=np.zeros((height,width),np.uint8)
    cv2.setRNGSeed(0)
    cv2.grabCut(image,mask,rect,np.zeros((1,65),np.float64),np.zeros((1,65),np.float64),4,cv2.GC_INIT_WITH_RECT)
    foreground=np.uint8((mask==1)|(mask==3))*255
    contours,_=cv2.findContours(foreground,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
    if not contours:raise ValueError('No boundary found. Try a tighter box with clear contrast.')
    contour=max(contours,key=cv2.contourArea); area=float(cv2.contourArea(contour))
    if area<20:raise ValueError('Boundary was too small. Choose another photo or selection.')
    overlay=image.copy();cv2.drawContours(overlay,[contour],-1,(170,60,240),2)
    ok,encoded=cv2.imencode('.jpg',overlay,[cv2.IMWRITE_JPEG_QUALITY,82])
    if not ok:raise ValueError('Could not create overlay.')
    return {'overlay':'data:image/jpeg;base64,'+base64.b64encode(encoded).decode(),'areaPixels':round(area),'imageAreaPixels':width*height,'areaPercent':round(area/(width*height)*100,2),'method':'OpenCV GrabCut — user-selected region','width':width,'height':height}

if __name__=='__main__':
    try:
        request=json.loads(sys.stdin.read(12000000))
        result=scan(request) if request.get('action')=='scan' else segment(request) if request.get('action')=='segment' else {'ready':True}
        print(json.dumps(result,allow_nan=False))
    except Exception as exc:
        # Avoid logging images, user text, and raw dependency diagnostics.
        print(json.dumps({'error':str(exc) if isinstance(exc,ValueError) else 'Vision processing failed. Check the Python setup and try again.'}))
        sys.exit(1)
