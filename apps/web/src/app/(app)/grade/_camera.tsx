'use client';

import { useEffect, useRef, useState } from 'react';
import { Box, Button, HStack, Spinner, Text, useToast } from '@chakra-ui/react';
import { apiClient } from '@/lib/api-client';

export function CameraCapture({ onCaptured }: { onCaptured: (key: string) => void }) {
  const toast = useToast();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setSupported(false);
    }
  }, []);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setActive(true);
      }
    } catch (err) {
      toast({
        status: 'warning',
        title: '摄像头不可用',
        description: '请允许浏览器使用摄像头，或使用文件上传方式。',
      });
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
    const v = videoRef.current;
    const c = canvasRef.current;
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, c.width, c.height);
    setBusy(true);
    c.toBlob(async (blob) => {
      if (!blob) {
        setBusy(false);
        return;
      }
      const form = new FormData();
      form.append('file', new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' }));
      form.append('type', 'student-answer');
      const res = await apiClient.postForm<{ key: string }>('/api/upload', form);
      setBusy(false);
      if (res.ok) onCaptured(res.data.key);
      else toast({ status: 'error', title: '上传失败', description: res.error.message });
    }, 'image/jpeg', 0.92);
  };

  if (!supported) {
    return (
      <Box p={3} bg="orange.50" borderWidth="1px" rounded="md">
        <Text fontSize="sm">摄像头不可用，请使用上方的文件上传方式。</Text>
      </Box>
    );
  }

  return (
    <Box borderWidth="1px" rounded="md" p={3}>
      {!active && (
        <Button size="sm" onClick={start}>
          打开摄像头拍照
        </Button>
      )}
      <Box display={active ? 'block' : 'none'} mt={3}>
        <video ref={videoRef} style={{ width: '100%', maxHeight: 400, background: '#000' }} playsInline muted />
        <canvas ref={canvasRef} style={{ display: 'none' }} />
        <HStack mt={2}>
          <Button size="sm" colorScheme="brand" onClick={capture} isDisabled={busy}>
            {busy ? <Spinner size="sm" /> : '拍照并上传'}
          </Button>
          <Button size="sm" variant="ghost" onClick={stop}>
            关闭
          </Button>
        </HStack>
      </Box>
    </Box>
  );
}
