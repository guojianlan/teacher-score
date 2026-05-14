'use client';

import { useState } from 'react';
import { Box, Button, FormControl, FormLabel, Heading, Input, Stack, Text, useToast } from '@chakra-ui/react';
import { authClient } from '@teacher-score/auth/client';

export default function ForgotPasswordPage() {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await authClient.forgetPassword({ email, redirectTo: `${window.location.origin}/reset-password` });
      if (res.error) throw new Error(res.error.message ?? '发送失败');
      setSent(true);
    } catch (err) {
      toast({ status: 'error', title: '发送失败', description: (err as Error).message });
    } finally { setLoading(false); }
  };

  return (
    <Stack spacing={8}>
      <Box>
        <Text fontFamily="mono" fontSize="xs" color="text.fgSubtle" letterSpacing="0.12em" textTransform="uppercase" mb={2}>
          Recover
        </Text>
        <Heading as="h1" size="xl" fontStyle="italic" fontWeight={400}>忘记密码</Heading>
      </Box>
      {sent ? (
        <Text color="text.fgMuted" lineHeight={1.6}>
          如果该邮箱已注册，重置链接已发送，请查收。
        </Text>
      ) : (
        <form onSubmit={onSubmit}>
          <Stack spacing={5}>
            <FormControl isRequired>
              <FormLabel fontSize="sm" color="text.fgMuted" mb={1.5}>邮箱</FormLabel>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </FormControl>
            <Button type="submit" isLoading={loading} size="lg">发送重置链接 →</Button>
          </Stack>
        </form>
      )}
    </Stack>
  );
}
