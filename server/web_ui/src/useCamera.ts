/**
 * useCamera — manages getUserMedia lifecycle for the Insure Me capture flow.
 *
 * Auto-selects rear-facing camera (facingMode: 'environment').
 * Falls back to any available camera if environment is unavailable.
 * Applies continuous autofocus after stream-up for sharp capture frames
 * (adapted from picker-vision P1a fix).
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export type CameraFacing = 'environment' | 'user' | string;

export interface CameraDevice {
  deviceId: string;
  label: string;
}

export interface CameraState {
  stream: MediaStream | null;
  devices: CameraDevice[];
  activeDeviceId: string | null;
  facing: CameraFacing;
  error: string | null;
  ready: boolean;
  switchCamera: (deviceId: string) => void;
  toggleFacing: () => void;
}

export function useCamera(): CameraState {
  const [stream, setStream]               = useState<MediaStream | null>(null);
  const [devices, setDevices]             = useState<CameraDevice[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null);
  const [facing, setFacing]               = useState<CameraFacing>('environment');
  const [error, setError]                 = useState<string | null>(null);
  const [ready, setReady]                 = useState(false);
  const streamRef                         = useRef<MediaStream | null>(null);

  function stopStream() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }

  async function enumerateDevices(): Promise<CameraDevice[]> {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      return all
        .filter((d) => d.kind === 'videoinput')
        .map((d, i) => ({
          deviceId: d.deviceId,
          label: d.label || `Camera ${i + 1}`,
        }));
    } catch {
      return [];
    }
  }

  const openCamera = useCallback(async (deviceId?: string | null) => {
    stopStream();
    setReady(false);
    setError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera unavailable — page must be served over HTTPS.');
      return;
    }

    const constraints: MediaStreamConstraints = {
      video: deviceId
        ? { deviceId: { exact: deviceId } }
        : { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    };

    try {
      const s = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = s;
      setStream(s);

      // Apply continuous autofocus (picker-vision P1a fix — sharpens frames)
      const track = s.getVideoTracks()[0];
      if (track?.applyConstraints) {
        try {
          await track.applyConstraints({
            advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet],
          });
          console.info('[Camera] continuous AF applied');
        } catch {
          console.info('[Camera] continuous AF not supported — skipped');
        }
      }

      // Determine actual facing
      const { facingMode: actualFacing } = track.getSettings();
      const resolvedFacing: CameraFacing =
        actualFacing === 'user' ? 'user' : 'environment';
      setFacing(resolvedFacing);

      const resolvedDevice = deviceId ?? track.getSettings().deviceId ?? null;
      setActiveDeviceId(resolvedDevice);

      // Enumerate devices now that we have permission
      const devs = await enumerateDevices();
      setDevices(devs);

      setReady(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('NotAllowed') || msg.includes('Permission')) {
        setError('Camera permission denied. Allow camera access to continue.');
      } else if (msg.includes('NotFound')) {
        setError('No camera found on this device.');
      } else {
        setError(`Camera error: ${msg}`);
      }
      stopStream();
    }
  }, []);

  const switchCamera = useCallback((deviceId: string) => {
    openCamera(deviceId);
  }, [openCamera]);

  const toggleFacing = useCallback(() => {
    const next: CameraFacing = facing === 'environment' ? 'user' : 'environment';
    setFacing(next);
    // Find a device matching the desired facing
    const match = devices.find((d) =>
      next === 'user'
        ? /front/i.test(d.label)
        : /back|rear|environment/i.test(d.label)
    );
    if (match) {
      openCamera(match.deviceId);
    } else {
      // Fallback: let the browser pick via facingMode constraint
      openCamera(null);
    }
  }, [facing, devices, openCamera]);

  // Auto-start camera on mount
  useEffect(() => {
    openCamera();
    return () => stopStream();
  }, [openCamera]);

  return {
    stream,
    devices,
    activeDeviceId,
    facing,
    error,
    ready,
    switchCamera,
    toggleFacing,
  };
}
