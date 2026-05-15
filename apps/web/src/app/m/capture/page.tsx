'use client';

import { Suspense, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Box,
  Button,
  Container,
  Heading,
  Spinner,
  Stack,
  Text,
  useToast,
} from '@/components/ui';

function CaptureInner() {
  const params = useSearchParams();
  const toast = useToast();
  const sessionId = params.get('s') ?? '';
  const token = params.get('t') ?? '';
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(0);

  const submit = async (files: FileList | null) => {
    if (!files || !sessionId || !token) return;
    setBusy(true);
    for (const file of Array.from(files)) {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(
        `/api/mobile-capture/upload?s=${encodeURIComponent(sessionId)}&t=${encodeURIComponent(token)}`,
        { method: 'POST', body: form },
      );
      if (res.ok) setCount((c) => c + 1);
      else {
        toast({ status: 'error', title: '上传失败', description: `${res.status}` });
        break;
      }
    }
    setBusy(false);
  };

  if (!sessionId || !token) {
    return (
      <Container maxW="sm" py={10}>
        <Heading size="md">无效链接</Heading>
        <Text mt={2} color="fg.muted">
          请回到桌面端重新生成二维码。
        </Text>
      </Container>
    );
  }

  return (
    <Container maxW="sm" py={6}>
      <Stack gap={4}>
        <Heading size="md">拍照上传学生答卷</Heading>
        <Text fontSize="sm" color="fg.muted">
          会话有效期 15 分钟。多张可连续拍照。
        </Text>
        <Box bg="white" p={4} rounded="md" borderWidth="1px" textAlign="center">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            hidden
            onChange={(e) => submit(e.target.files)}
          />
          {busy ? (
            <Spinner />
          ) : (
            <Button colorPalette="primary" size="lg" onClick={() => inputRef.current?.click()}>
              拍照 / 选择照片
            </Button>
          )}
          <Text mt={3} fontSize="sm">
            已上传：{count} 张
          </Text>
        </Box>
      </Stack>
    </Container>
  );
}

export default function MobileCapturePage() {
  return (
    <Suspense fallback={null}>
      <CaptureInner />
    </Suspense>
  );
}
