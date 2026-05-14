'use client';

import { useState } from 'react';
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
      const res = await authClient.forgetPassword({
        email,
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (res.error) throw new Error(res.error.message ?? '发送失败');
      setSent(true);
    } catch (err) {
      toast({ status: 'error', title: '发送失败', description: (err as Error).message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxW="sm" py={16}>
      <Stack spacing={6}>
        <Heading size="lg">忘记密码</Heading>
        {sent ? (
          <Text>如果该邮箱已注册，重置链接已发送，请查收。</Text>
        ) : (
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
              <Button type="submit" colorScheme="brand" isLoading={loading}>
                发送重置链接
              </Button>
            </Stack>
          </form>
        )}
      </Stack>
    </Container>
  );
}
