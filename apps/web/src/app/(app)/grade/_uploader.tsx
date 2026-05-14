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
      else
        toast({
          status: 'error',
          title: `上传失败：${file.name}`,
          description: res.error.message,
        });
    }
    setBusy(false);
  };

  return (
    <Box
      borderWidth="2px"
      borderStyle="dashed"
      borderColor={dragOver ? 'brand.400' : 'gray.300'}
      bg={dragOver ? 'brand.50' : 'gray.50'}
      rounded="md"
      p={6}
      textAlign="center"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        submit(e.dataTransfer.files);
      }}
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
        <Spinner />
      ) : (
        <>
          <Text mb={2}>拖拽图片到此处，或</Text>
          <Button onClick={() => inputRef.current?.click()}>选择文件</Button>
          <Text fontSize="xs" color="gray.500" mt={2}>
            支持 JPG / PNG / WEBP / HEIC，单文件 ≤ 10MB
          </Text>
        </>
      )}
    </Box>
  );
}
