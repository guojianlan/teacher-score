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
    <Stack spacing={8}>
      <Box>
        <Text fontFamily="mono" fontSize="xs" color="text.fgSubtle" letterSpacing="0.12em" textTransform="uppercase" mb={2}>
          New account
        </Text>
        <Heading as="h1" size="xl" fontStyle="italic" fontWeight={400}>
          注册
        </Heading>
        <Text mt={2} color="text.fgSubtle" fontSize="sm">
          注册即自动开通个人工作区，免费层每月 50 次批改。
        </Text>
      </Box>

      <form onSubmit={onSubmit}>
        <Stack spacing={5}>
          <FormControl isRequired>
            <FormLabel fontSize="sm" color="text.fgMuted" mb={1.5}>姓名</FormLabel>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </FormControl>
          <FormControl isRequired>
            <FormLabel fontSize="sm" color="text.fgMuted" mb={1.5}>邮箱</FormLabel>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </FormControl>
          <FormControl isRequired>
            <FormLabel fontSize="sm" color="text.fgMuted" mb={1.5}>密码 <Text as="span" color="text.fgSubtle" fontFamily="mono" fontSize="xs">/ ≥8</Text></FormLabel>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </FormControl>
          <Button type="submit" isLoading={loading} size="lg" mt={2}>
            注册并进入工作区 →
          </Button>
        </Stack>
      </form>

      <Text fontSize="sm" color="text.fgSubtle" pt={4} borderTop="1px solid" borderColor="border.base">
        已有账号？{' '}
        <Link href="/sign-in" style={{ color: '#0969DA', textDecoration: 'underline', textUnderlineOffset: '3px' }}>
          登录
        </Link>
      </Text>
    </Stack>
  );
}
