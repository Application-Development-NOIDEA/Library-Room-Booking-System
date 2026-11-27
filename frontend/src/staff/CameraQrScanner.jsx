import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';

/** Ignore the same code seen again within this long (the student is still holding it up). */
const SAME_CODE_PAUSE_MS = 4000;

/**
 * Camera QR scanning for the check-in desk.
 * Uses the browser's built-in BarcodeDetector where there is one (Chrome, Edge,
 * Android) and the jsQR decoder everywhere else (Safari, Firefox), so any laptop
 * or phone camera works. A USB QR scanner, or typing the reference, still works too.
 *
 * The camera stays on between students: each new code is passed to onCode once.
 */
export default function CameraQrScanner({ onCode }) {
  const video = useRef(null);
  const canvas = useRef(null);
  const onCodeRef = useRef(onCode);
  const [active, setActive] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    onCodeRef.current = onCode;
  }, [onCode]);

  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    let stream;
    let frame;
    let detector = null;
    let last = { value: '', at: 0 };
    const videoEl = video.current;

    function decode() {
      const v = videoEl;
      if (detector) {
        return detector.detect(v).then((found) => found[0]?.rawValue || '');
      }
      const c = canvas.current;
      const w = v.videoWidth;
      const h = v.videoHeight;
      if (!w || !h) return Promise.resolve('');
      // Scale large frames down: jsQR is fast enough at ~640px wide
      const scale = Math.min(1, 640 / w);
      c.width = Math.round(w * scale);
      c.height = Math.round(h * scale);
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(v, 0, 0, c.width, c.height);
      const image = ctx.getImageData(0, 0, c.width, c.height);
      const code = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' });
      return Promise.resolve(code?.data || '');
    }

    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('This browser cannot open the camera. Use a USB QR scanner or type the booking reference.');
        }
        if ('BarcodeDetector' in window) {
          try {
            const formats = await window.BarcodeDetector.getSupportedFormats?.();
            if (!formats || formats.includes('qr_code')) detector = new window.BarcodeDetector({ formats: ['qr_code'] });
          } catch {
            detector = null; // fall back to jsQR
          }
        }
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        videoEl.srcObject = stream;
        await videoEl.play();

        const scan = async () => {
          if (cancelled) return;
          try {
            if (videoEl.readyState >= 2) {
              const value = (await decode()).trim();
              const now = Date.now();
              if (value && (value !== last.value || now - last.at > SAME_CODE_PAUSE_MS)) {
                last = { value, at: now };
                onCodeRef.current(value);
              } else if (value) {
                last.at = now;
              }
            }
          } catch {
            /* No code in this frame, or the frame was unavailable. */
          }
          frame = requestAnimationFrame(scan);
        };
        frame = requestAnimationFrame(scan);
      } catch (err) {
        if (!cancelled) {
          setError(
            err?.name === 'NotAllowedError'
              ? 'Camera permission was refused. Allow the camera for this site and try again.'
              : err?.name === 'NotFoundError'
                ? 'No camera was found on this device.'
                : err.message
          );
          setActive(false);
        }
      }
    }

    start();
    return () => {
      cancelled = true;
      if (frame) cancelAnimationFrame(frame);
      if (stream) stream.getTracks().forEach((t) => t.stop());
      if (videoEl) videoEl.srcObject = null;
    };
  }, [active]);

  return (
    <div className="staff-camera">
      <button
        className="staff-secondary"
        type="button"
        onClick={() => {
          setError('');
          setActive((a) => !a);
        }}
      >
        {active ? 'Stop Camera' : 'Scan QR with Camera'}
      </button>
      <video
        ref={video}
        muted
        playsInline
        // The CSS gives this video display:block, which beats the hidden attribute, so hide it inline
        style={{ display: active ? 'block' : 'none' }}
        className="staff-camera-video"
        aria-label="Camera preview for scanning QR codes"
      />
      <canvas ref={canvas} hidden />
      {active && <p className="staff-muted">Hold the student&apos;s QR code up to the camera. The camera stays on for the next student.</p>}
      {error && (
        <p className="staff-muted" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
