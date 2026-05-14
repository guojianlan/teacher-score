'use client';

import { useRef, useState } from 'react';
import { Box, Button, Spinner, Text, useToast } from '@chakra-ui/react';
import { apiClient } from '@/lib/api-client';

export function Uploader({ onUploaded }: { onUploaded: (key: string) => void }) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const submit = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    for (const file of Array.from(files)) {
      const form = new FormData();
      form.append('file', file);
      form.append('type', 'student-answer');
      const res = await apiClient.postForm<{ key: string }>('/api/upload', form);
      if (res.ok) onUploaded(res.data.key);
      else toast({ status: 'error', title: `上传失败：${file.name}`, description: res.error.message });
    }
    setBusy(false);
  };

  return (
    <Box
      borderWidth="1px"
      borderStyle="dashed"
      borderColor={dragOver ? 'accent.500' : 'ink.100'}
      bg={dragOver ? 'accent.50' : 'paper.50'}
      borderRadius="6px"
      p={10}
      textAlign="center"
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); submit(e.dataTransfer.files); }}
      transition="all 120ms ease"
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        multiple
        hidden
        onChange={(e) => submit(e.target.files)}
      />
      {busy ? (
        <Spinner color="ink.300" />
      ) : (
        <>
          <Text fontSize="md" mb={1} color="ink.700">把图片拖到这里</Text>
          <Text fontSize="sm" color="ink.500" mb={4} fontFamily="mono" letterSpacing="0.04em">
            JPG · PNG · WEBP · HEIC · ≤ 10MB
          </Text>
          <Button onClick={() => inputRef.current?.click()} variant="outline" size="sm">
            或选择文件
          </Button>
        </>
      )}
    </Box>
  );
}
