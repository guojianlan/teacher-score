'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Button,
  Divider,
  FormControl,
  FormLabel,
  Heading,
  Input,
  Stack,
  Text,
  useToast,
} from '@chakra-ui/react';
import { authClient, signOut } from '@teacher-score/auth/client';
import { apiClient } from '@/lib/api-client';

export default function SettingsPage() {
  const toast = useToast();
  const router = useRouter();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [delLoading, setDelLoading] = useState(false);

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast({ status: 'warning', title: '新密码至少 8 位' });
      return;
    }
    setPwLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await (authClient as any).changePassword({
        currentPassword: oldPassword,
        newPassword,
        revokeOtherSessions: true,
      });
      if (res?.error) throw new Error(res.error.message ?? '修改失败');
      toast({ status: 'success', title: '密码已修改' });
      setOldPassword('');
      setNewPassword('');
    } catch (err) {
      toast({ status: 'error', title: '修改失败', description: (err as Error).message });
    } finally {
      setPwLoading(false);
    }
  };

  const deleteAccount = async () => {
    const confirmation = window.prompt('请输入 DELETE 确认注销账户。注销后数据不可恢复。');
    if (confirmation !== 'DELETE') return;
    setDelLoading(true);
    const res = await apiClient.delete('/api/me');
    setDelLoading(false);
    if (res.ok) {
      toast({ status: 'info', title: '账户已注销' });
      await signOut();
      router.replace('/');
    } else {
      toast({ status: 'error', title: '注销失败', description: res.error.message });
    }
  };

  return (
    <Stack spacing={8}>
      <Heading size="lg">设置</Heading>

      <Box bg="white" p={6} rounded="md" borderWidth="1px">
        <Heading size="md" mb={4}>
          修改密码
        </Heading>
        <form onSubmit={changePassword}>
          <Stack spacing={3} maxW="sm">
            <FormControl isRequired>
              <FormLabel>当前密码</FormLabel>
              <Input
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                autoComplete="current-password"
              />
            </FormControl>
            <FormControl isRequired>
              <FormLabel>新密码</FormLabel>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
              />
            </FormControl>
            <Button type="submit" colorScheme="brand" isLoading={pwLoading}>
              修改密码
            </Button>
          </Stack>
        </form>
      </Box>

      <Box bg="white" p={6} rounded="md" borderWidth="1px">
        <Heading size="md" mb={4}>
          数据导出
        </Heading>
        <Text fontSize="sm" color="gray.600" mb={3}>
          导出当前 organization 下所有学生、批改记录、错题本、模板的 JSON 文件。
        </Text>
        <Button
          as="a"
          href="/api/me/export"
          download="teacher-score-export.json"
          variant="outline"
        >
          下载我的数据
        </Button>
      </Box>

      <Divider />

      <Box bg="white" p={6} rounded="md" borderWidth="1px" borderColor="red.200">
        <Heading size="md" mb={2} color="red.600">
          危险操作
        </Heading>
        <Text fontSize="sm" color="gray.700" mb={4}>
          注销账户将永久删除你的所有数据（学生、批改记录、错题本、模板、配额）。此操作不可恢复。
        </Text>
        <Button colorScheme="red" variant="outline" onClick={deleteAccount} isLoading={delLoading}>
          注销账户
        </Button>
      </Box>
    </Stack>
  );
}
