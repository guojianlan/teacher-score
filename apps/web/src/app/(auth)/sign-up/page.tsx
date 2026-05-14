'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
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
import { signUp } from '@teacher-score/auth/client';
import { captureClient, initClientAnalytics } from '@teacher-score/analytics/client';

export default function SignUpPage() {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
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
      const res = await signUp.email({ email, password, name });
      if (res.error) throw new Error(res.error.message ?? '注册失败');
      initClientAnalytics().then(() => captureClient('user_signed_up'));
      router.replace('/dashboard');
    } catch (err) {
      toast({ status: 'error', title: '注册失败', description: (err as Error).message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxW="sm" py={16}>
      <Stack spacing={6}>
        <Heading size="lg">注册</Heading>
        <form onSubmit={onSubmit}>
          <Stack spacing={4}>
            <FormControl isRequired>
              <FormLabel>姓名</FormLabel>
              <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </FormControl>
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
                autoComplete="new-password"
              />
            </FormControl>
            <Button type="submit" colorScheme="brand" isLoading={loading}>
              注册并进入工作区
            </Button>
          </Stack>
        </form>
        <Text fontSize="sm">
          已有账号？{' '}
          <Link href="/sign-in" style={{ color: '#2563eb' }}>
            登录
          </Link>
        </Text>
      </Stack>
    </Container>
  );
}
