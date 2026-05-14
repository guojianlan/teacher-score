'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Box,
  Button,
  Container,
  FormControl,
  FormLabel,
  Heading,
  Input,
  Stack,
  Text,
  useToast,
} from '@chakra-ui/react';
import { signIn } from '@teacher-score/auth/client';

export default function SignInPage() {
  const router = useRouter();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await signIn.email({ email, password });
      if (res.error) throw new Error(res.error.message ?? '登录失败');
      router.replace('/dashboard');
    } catch (err) {
      toast({ status: 'error', title: '登录失败', description: (err as Error).message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxW="sm" py={16}>
      <Stack spacing={6}>
        <Heading size="lg">登录</Heading>
        <form onSubmit={onSubmit}>
          <Stack spacing={4}>
            <FormControl isRequired>
              <FormLabel>邮箱</FormLabel>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </FormControl>
            <FormControl isRequired>
              <FormLabel>密码</FormLabel>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </FormControl>
            <Button type="submit" colorScheme="brand" isLoading={loading}>
              登录
            </Button>
            <Button
              variant="outline"
              onClick={(e) => {
                e.preventDefault();
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (signIn as any).social({ provider: 'google' }).catch(() => {
                  toast({
                    status: 'info',
                    title: 'Google 登录未配置',
                    description: '请联系管理员配置 GOOGLE_CLIENT_ID/SECRET。',
                  });
                });
              }}
            >
              使用 Google 登录
            </Button>
          </Stack>
        </form>
        <Box>
          <Text fontSize="sm">
            还没有账号？{' '}
            <Link href="/sign-up" style={{ color: '#2563eb' }}>
              注册
            </Link>
            {' · '}
            <Link href="/forgot-password" style={{ color: '#2563eb' }}>
              忘记密码
            </Link>
          </Text>
        </Box>
      </Stack>
    </Container>
  );
}
