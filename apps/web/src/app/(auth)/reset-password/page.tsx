'use client';

import { Suspense, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Button,
  Container,
  FormControl,
  FormLabel,
  Heading,
  Input,
  Stack,
  useToast,
} from '@chakra-ui/react';
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
    if (password.length < 8) {
      toast({ status: 'warning', title: '密码至少 8 位' });
      return;
    }
    setLoading(true);
    try {
      const res = await authClient.resetPassword({ newPassword: password, token });
      if (res.error) throw new Error(res.error.message ?? '重置失败');
      toast({ status: 'success', title: '密码已重置，请重新登录' });
      router.replace('/sign-in');
    } catch (err) {
      toast({ status: 'error', title: '重置失败', description: (err as Error).message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxW="sm" py={16}>
      <Stack spacing={6}>
        <Heading size="lg">重置密码</Heading>
        <form onSubmit={onSubmit}>
          <Stack spacing={4}>
            <FormControl isRequired>
              <FormLabel>新密码</FormLabel>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </FormControl>
            <Button type="submit" colorScheme="brand" isLoading={loading} isDisabled={!token}>
              确认重置
            </Button>
          </Stack>
        </form>
      </Stack>
    </Container>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordInner />
    </Suspense>
  );
}
