'use client';

import { Suspense, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Box, Button, FormControl, FormLabel, Heading, Input, Stack, Text, useToast } from '@chakra-ui/react';
import { authClient } from '@teacher-score/auth/client';

function ResetPasswordInner() {
  const params = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return toast({ status: 'warning', title: '密码至少 8 位' });
    setLoading(true);
    try {
      const res = await authClient.resetPassword({ newPassword: password, token });
      if (res.error) throw new Error(res.error.message ?? '重置失败');
      toast({ status: 'success', title: '密码已重置' });
      router.replace('/sign-in');
    } catch (err) {
      toast({ status: 'error', title: '重置失败', description: (err as Error).message });
    } finally { setLoading(false); }
  };

  return (
    <Stack spacing={8}>
      <Box>
        <Text fontFamily="mono" fontSize="xs" color="text.fgSubtle" letterSpacing="0.12em" textTransform="uppercase" mb={2}>
          Reset
        </Text>
        <Heading as="h1" size="xl" fontStyle="italic" fontWeight={400}>重置密码</Heading>
      </Box>
      <form onSubmit={onSubmit}>
        <Stack spacing={5}>
          <FormControl isRequired>
            <FormLabel fontSize="sm" color="text.fgMuted" mb={1.5}>新密码 <Text as="span" color="text.fgSubtle" fontFamily="mono" fontSize="xs">/ ≥8</Text></FormLabel>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </FormControl>
          <Button type="submit" isLoading={loading} isDisabled={!token} size="lg">确认重置 →</Button>
        </Stack>
      </form>
    </Stack>
  );
}

export default function ResetPasswordPage() {
  return <Suspense fallback={null}><ResetPasswordInner /></Suspense>;
}
