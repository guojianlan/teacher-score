'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Box,
  Button,
  HStack,
  Image,
  Stack,
  Text,
  useToast,
} from '@chakra-ui/react';
import { apiClient } from '@/lib/api-client';

interface StartResp {
  sessionId: string;
  token: string;
  url: string;
  expiresAt: string;
}

export function MobileQrCapture({ onCaptured }: { onCaptured: (key: string) => void }) {
  const toast = useToast();
  const [session, setSession] = useState<StartResp | null>(null);
  const pollRef = useRef<number | null>(null);
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, []);

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
      const p = await apiClient.get<{ keys: string[] }>(
        `/api/mobile-capture/poll?s=${encodeURIComponent(res.data.sessionId)}`,
      );
      if (p.ok) {
        for (const k of p.data.keys) {
          if (!seen.current.has(k)) {
            seen.current.add(k);
            onCaptured(k);
          }
        }
      }
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
      <Button size="sm" variant="outline" onClick={start}>
        手机扫码拍照
      </Button>
    );
  }

  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
    session.url,
  )}`;

  return (
    <Box borderWidth="1px" rounded="md" p={4}>
      <Stack spacing={3} align="center">
        <Text fontSize="sm" color="gray.600">
          用手机扫码打开拍照页（15 分钟内有效）
        </Text>
        <Image src={qrSrc} alt="QR" width="200px" height="200px" />
        <Text fontSize="xs" color="gray.500" wordBreak="break-all" maxW="280px">
          {session.url}
        </Text>
        <HStack>
          <Button size="sm" onClick={finish}>
            结束会话
          </Button>
        </HStack>
      </Stack>
    </Box>
  );
}
