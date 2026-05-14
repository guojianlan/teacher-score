'use client';

import { useEffect, useRef, useState } from 'react';
import { Box, Button, HStack, Spinner, Text, useToast } from '@/components/ui';
import { apiClient } from '@/lib/api-client';

export function CameraCapture({ onCaptured }: { onCaptured: (key: string) => void }) {
  const toast = useToast();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) setSupported(false);
  }, []);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setActive(true);
      }
    } catch {
      toast({ status: 'warning', title: '摄像头不可用', description: '请允许浏览器使用摄像头，或使用文件上传。' });
      setSupported(false);
    }
  };

  const stop = () => {
    const stream = videoRef.current?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((t) => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    setActive(false);
  };

  const capture = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const v = videoRef.current; const c = canvasRef.current;
    c.width = v.videoWidth; c.height = v.videoHeight;
    const ctx = c.getContext('2d'); if (!ctx) return;
    ctx.drawImage(v, 0, 0, c.width, c.height);
    setBusy(true);
    c.toBlob(async (blob) => {
      if (!blob) { setBusy(false); return; }
      const form = new FormData();
      form.append('file', new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' }));
      form.append('type', 'student-answer');
      const res = await apiClient.postForm<{ key: string }>('/api/upload', form);
      setBusy(false);
      if (res.ok) onCaptured(res.data.key);
      else toast({ status: 'error', title: '上传失败', description: res.error.message });
    }, 'image/jpeg', 0.92);
  };

  if (!supported) return null;

  return (
    <Box flex="1" borderWidth="1px" borderColor="border.default" borderRadius="6px" p={4}>
      {!active && (
        <Button onClick={start} variant="outline" size="sm" w="100%">
          📷 打开摄像头
        </Button>
      )}
      <Box display={active ? 'block' : 'none'}>
        <video ref={videoRef} style={{ width: '100%', maxHeight: 320, background: '#000', borderRadius: 4 }} playsInline muted />
        <canvas ref={canvasRef} style={{ display: 'none' }} />
        <HStack mt={3}>
          <Button size="sm" onClick={capture} disabled={busy} flex="1">
            {busy ? <Spinner size="sm" /> : '拍照'}
          </Button>
          <Button size="sm" variant="ghost" onClick={stop}>关闭</Button>
        </HStack>
      </Box>
    </Box>
  );
}
