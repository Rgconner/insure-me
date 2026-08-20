/**
 * CameraView — live viewfinder with capture button.
 *
 * Renders <video> from camera stream, capture button, preview, error, loading states.
 */

import { useRef, useState, useCallback } from 'react';
import type { CameraState } from './useCamera';
import { useSpeechRecognition } from './useSpeechRecognition';

interface Props {
  camera: CameraState;
  onCapture: (blob: Blob, dataUrl: string) => void;
  onSubmit: (blob: Blob, narration: string) => void;
  capturing: boolean;
}

export function CameraView({ camera, onCapture, onSubmit, capturing }: Props) {
  const videoRef    = useRef<HTMLVideoElement>(null);
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pendingBlob, setPendingBlob] = useState<Blob | null>(null);
  const speech = useSpeechRecognition();

  const { stream, devices, activeDeviceId, error, ready, switchCamera, toggleFacing } = camera;

  const setVideoRef = useCallback((el: HTMLVideoElement | null) => {
    (videoRef as React.MutableRefObject<HTMLVideoElement | null>).current = el;
    if (el && stream) {
      el.srcObject = stream;
    }
  }, [stream]);

  const handleCapture = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    setPreviewUrl(dataUrl);

    canvas.toBlob((blob) => {
      if (blob) {
        setPendingBlob(blob);
        onCapture(blob, dataUrl);
      }
    }, 'image/jpeg', 0.92);
  }, [onCapture]);

  const handleRetake = useCallback(() => {
    setPreviewUrl(null);
    setPendingBlob(null);
    speech.reset();
  }, [speech]);

  const handleConfirm = useCallback(() => {
    if (pendingBlob) {
      onSubmit(pendingBlob, speech.transcript);
      speech.reset();
    }
  }, [pendingBlob, onSubmit, speech]);

  // ── Error state ──
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-4">
          <span className="text-2xl">&#9888;</span>
        </div>
        <p className="text-red-700 font-medium mb-2">Camera Error</p>
        <p className="text-gray-600 text-sm max-w-md">{error}</p>
      </div>
    );
  }

  // ── Loading state ──
  if (!ready || !stream) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-gray-500">Starting camera...</p>
      </div>
    );
  }

  // ── Preview mode ──
  if (previewUrl) {
    return (
      <div className="flex flex-col items-center gap-4">
        <div className="relative w-full max-w-md rounded-lg overflow-hidden bg-black">
          <img src={previewUrl} alt="Preview" className="w-full h-auto block" />
        </div>

        {/* Narration / Voice Input */}
        {speech.supported && (
          <div className="w-full max-w-md">
            <div className="flex items-center gap-2 mb-2">
              <button
                onClick={speech.listening ? speech.stop : speech.start}
                className={`w-10 h-10 rounded-full flex items-center justify-center
                  transition-colors ${
                    speech.listening
                      ? 'bg-red-500 text-white animate-pulse'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                title={speech.listening ? 'Stop recording' : 'Record narration'}
              >
                &#127908;
              </button>
              <span className="text-xs text-gray-500">
                {speech.listening
                  ? 'Listening... tap mic to stop'
                  : 'Tap mic to describe this item'}
              </span>
            </div>
            {speech.transcript && (
              <div className="p-2 bg-yellow-50 border border-yellow-200 rounded text-sm text-gray-700 italic">
                &ldquo;{speech.transcript}&rdquo;
              </div>
            )}
            {speech.error && (
              <p className="text-xs text-red-500 mt-1">{speech.error}</p>
            )}
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={handleRetake} disabled={capturing}
            className="px-6 py-3 bg-gray-200 text-gray-800 rounded-lg font-medium
                       hover:bg-gray-300 transition-colors">
            &#x21A9; Retake
          </button>
          <button onClick={handleConfirm} disabled={capturing}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium
                       hover:bg-blue-700 transition-colors disabled:opacity-50
                       flex items-center gap-2">
            {capturing ? (
              <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Identifying...</>
            ) : (
              'Use This Photo'
            )}
          </button>
        </div>
      </div>
    );
  }

  // ── Live viewfinder ──
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative w-full max-w-md rounded-lg overflow-hidden bg-black aspect-[4/3]">
        <video ref={setVideoRef} autoPlay playsInline muted
          className="w-full h-full object-cover" />

        <div className="absolute top-0 left-0 right-0 flex items-center justify-between
                        p-2 bg-gradient-to-b from-black/50 to-transparent">
          <button onClick={toggleFacing}
            className="w-9 h-9 rounded-full bg-white/20 text-white flex items-center
                       justify-center hover:bg-white/30 transition-colors text-sm"
            title="Flip camera">&#x21C4;</button>

          {devices.length > 1 && (
            <select value={activeDeviceId ?? ''}
              onChange={(e) => switchCamera(e.target.value)}
              className="text-xs bg-black/40 text-white border border-white/20 rounded
                         px-2 py-1 max-w-[140px] truncate">
              {devices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
              ))}
            </select>
          )}

          <span className="flex items-center gap-1 text-xs text-green-400">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />Live
          </span>
        </div>
      </div>

      <button onClick={handleCapture} disabled={capturing}
        className="w-16 h-16 rounded-full border-4 border-white bg-white/20
                   hover:bg-white/40 transition-all focus:outline-none
                   disabled:opacity-50 shadow-lg ring-2 ring-gray-300"
        title="Capture frame" />

      <p className="text-sm text-gray-500 text-center max-w-xs">
        Point your camera at an item, then tap the button to capture.
      </p>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
