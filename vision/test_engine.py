import unittest
import numpy as np
import cv2,base64
from engine import estimate,segment
class VisionTests(unittest.TestCase):
 def test_pulse_and_flat_signal(self):
  t=np.arange(450)/15; p=np.sin(2*np.pi*1.2*t)
  c=np.stack([120+.15*p,95+.9*p,80+.2*p],axis=1)
  r=estimate(t,c); self.assertTrue(r['accepted']);self.assertAlmostEqual(r['bpm'],72,delta=2)
  self.assertFalse(estimate(t,np.ones((450,3))*100)['accepted'])
 def test_short_and_gap(self):
  self.assertFalse(estimate([0,1],[[100]*3]*2)['accepted'])
  t=np.arange(450)/15;t[225:]+=1
  self.assertFalse(estimate(t,np.ones((450,3))*100)['accepted'])
 def test_boundary(self):
  img=np.full((200,200,3),180,np.uint8);cv2.circle(img,(100,100),35,(20,40,190),-1)
  _,buf=cv2.imencode('.png',img);r=segment({'image':base64.b64encode(buf).decode(),'box':[.2,.2,.6,.6]})
  self.assertGreater(r['areaPixels'],3000);self.assertLess(r['areaPixels'],4200)
  self.assertTrue(r['overlay'].startswith('data:image/jpeg'))
if __name__=='__main__':unittest.main()
