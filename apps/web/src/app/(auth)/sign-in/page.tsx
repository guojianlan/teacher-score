'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Box,
  Button,
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
    <Stack spacing={8}>
      <Box>
        <Text fontFamily="mono" fontSize="xs" color="ink.500" letterSpacing="0.12em" textTransform="uppercase" mb={2}>
          Welcome back
        </Text>
        <Heading as="h1" size="xl" fontStyle="italic" fontWeight={400}>
          登录
        </Heading>
      </Box>

      <form onSubmit={onSubmit}>
        <Stack spacing={5}>
          <FormControl isRequired>
            <FormLabel fontSize="sm" color="ink.700" mb={1.5}>邮箱</FormLabel>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </FormControl>
          <FormControl isRequired>
            <FormLabel fontSize="sm" color="ink.700" mb={1.5}>密码</FormLabel>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </FormControl>
          <Button type="submit" isLoading={loading} size="lg" mt={2}>
            登录 →
          </Button>
          <Button
            variant="outline"
            size="lg"
            onClick={(e) => {
              e.preventDefault();
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (signIn as any).social({ provider: 'google' }).catch(() => {
                toast({ status: 'info', title: 'Google 登录未配置', description: '请联系管理员配置 GOOGLE_CLIENT_ID/SECRET。' });
              });
            }}
          >
            使用 Google 登录
          </Button>
        </Stack>
      </form>

      <Box fontSize="sm" color="ink.500" pt={4} borderTop="1px solid" borderColor="ink.100">
        <Text>
          还没有账号？{' '}
          <Link href="/sign-up" style={{ color: '#0969DA', textDecoration: 'underline', textUnderlineOffset: '3px' }}>
            注册
          </Link>
        </Text>
        <Text mt={2}>
          <Link href="/forgot-password" style={{ color: '#656D76' }}>
            忘记密码
          </Link>
        </Text>
      </Box>
    </Stack>
  );
}
