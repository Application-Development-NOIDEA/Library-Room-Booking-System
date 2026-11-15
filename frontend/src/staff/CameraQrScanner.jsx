import { useEffect, useRef, useState } from 'react';

// Browser-native QR scanning. Supported browsers only; a USB QR scanner or
// manual ID + matric verification remains available as a fallback.
export default function CameraQrScanner({ onCode }) {
  const video = useRef(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!active) return;
    let cancelled = false, stream, frame, detector;
    async function start() {
      try {
        if (!('BarcodeDetector' in window)) throw new Error('QR camera scanning is not supported in this browser. Use Chrome or a USB QR scanner.');
        detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
        if (cancelled) { stream.getTracks().forEach(t=>t.stop()); return; }
        video.current.srcObject = stream;
        await video.current.play();
        async function scan() {
          if (cancelled) return;
          try {
            if (video.current?.readyState >= 2) {
              const found = await detector.detect(video.current);
              if (found[0]?.rawValue) { onCode(found[0].rawValue); setActive(false); return; }
            }
          } catch { /* No code detected or one frame was unavailable. */ }
          frame = requestAnimationFrame(scan);
        }
        frame = requestAnimationFrame(scan);
      } catch (err) { if (!cancelled) { setError(err.message); setActive(false); } }
    }
    start();
    return () => {
      cancelled=true;
      if (frame) cancelAnimationFrame(frame);
      if (stream) stream.getTracks().forEach(t=>t.stop());
      if (video.current) video.current.srcObject=null;
    };
  }, [active, onCode]);

  return <div className="staff-camera">
    <button className="staff-secondary" type="button" onClick={() => {setError('');setActive(a=>!a)}}>{active?'Stop Camera':'Scan QR with Camera'}</button>
    {active && <video ref={video} muted playsInline className="staff-camera-video" aria-label="Camera preview for scanning QR codes" />}
    {error && <p className="staff-muted" role="alert">{error}</p>}
  </div>;
}
