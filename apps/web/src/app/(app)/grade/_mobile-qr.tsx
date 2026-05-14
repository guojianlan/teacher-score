'use client';

import { useEffect, useRef, useState } from 'react';
import { Box, Button, HStack, Image, Stack, Text, useToast } from '@chakra-ui/react';
import { apiClient } from '@/lib/api-client';

interface StartResp { sessionId: string; token: string; url: string; expiresAt: string; }

export function MobileQrCapture({ onCaptured }: { onCaptured: (key: string) => void }) {
  const toast = useToast();
  const [session, setSession] = useState<StartResp | null>(null);
  const pollRef = useRef<number | null>(null);
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => () => { if (pollRef.current) window.clearInterval(pollRef.current); }, []);

  const start = async () => {
    const res = await apiClient.post<StartResp>('/api/mobile-capture/start');
    if (!res.ok) {
      toast({
        status: 'error',
        title: '生成失败',
        description: res.error.error === 'mobile_capture_disabled' ? '未配置 SHARE_LINK_SECRET' : res.error.message,
      });
      return;
    }
    setSession(res.data);
    seen.current = new Set();
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = window.setInterval(async () => {
      const p = await apiClient.get<{ keys: string[] }>(`/api/mobile-capture/poll?s=${encodeURIComponent(res.data.sessionId)}`);
      if (p.ok) for (const k of p.data.keys) if (!seen.current.has(k)) { seen.current.add(k); onCaptured(k); }
    }, 3000);
  };

  const finish = async () => {
    if (!session) return;
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = null;
    await apiClient.post('/api/mobile-capture/finish', { sessionId: session.sessionId });
    setSession(null);
  };

  if (!session) {
    return (
      <Box flex="1" borderWidth="1px" borderColor="border.base" borderRadius="6px" p={4}>
        <Button onClick={start} variant="outline" size="sm" w="100%">
          📱 手机扫码拍照
        </Button>
      </Box>
    );
  }

  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(session.url)}`;

  return (
    <Box flex="1" borderWidth="1px" borderColor="border.base" borderRadius="6px" p={4}>
      <Stack spacing={3} align="center">
        <Text fontSize="xs" color="text.fgSubtle" fontFamily="mono">15 分钟内有效</Text>
        <Image src={qrSrc} alt="QR" width="160px" height="160px" />
        <HStack><Button size="xs" variant="ghost" onClick={finish}>结束会话</Button></HStack>
      </Stack>
    </Box>
  );
}
