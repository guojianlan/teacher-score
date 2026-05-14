'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box, Button, FormControl, FormLabel, Input, Stack, Text, useToast,
} from '@chakra-ui/react';
import { authClient, signOut } from '@teacher-score/auth/client';
import { apiClient } from '@/lib/api-client';
import { PageHeader } from '@/components/page-header';

export default function SettingsPage() {
  const toast = useToast();
  const router = useRouter();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [delLoading, setDelLoading] = useState(false);

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) return toast({ status: 'warning', title: '新密码至少 8 位' });
    setPwLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await (authClient as any).changePassword({ currentPassword: oldPassword, newPassword, revokeOtherSessions: true });
      if (res?.error) throw new Error(res.error.message ?? '修改失败');
      toast({ status: 'success', title: '密码已修改' });
      setOldPassword(''); setNewPassword('');
    } catch (err) {
      toast({ status: 'error', title: '修改失败', description: (err as Error).message });
    } finally { setPwLoading(false); }
  };

  const deleteAccount = async () => {
    const c = window.prompt('请输入 DELETE 确认注销账户。注销后数据不可恢复。');
    if (c !== 'DELETE') return;
    setDelLoading(true);
    const res = await apiClient.delete('/api/me');
    setDelLoading(false);
    if (res.ok) { toast({ status: 'info', title: '账户已注销' }); await signOut(); router.replace('/'); }
    else toast({ status: 'error', title: '注销失败', description: res.error.message });
  };

  return (
    <Stack spacing={10}>
      <PageHeader eyebrow="账户" title="设置" />

      <Section label="修改密码">
        <form onSubmit={changePassword}>
          <Stack spacing={4} maxW="sm">
            <FormControl isRequired>
              <FormLabel fontSize="sm" color="fg.muted" mb={1.5}>当前密码</FormLabel>
              <Input type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} autoComplete="current-password" />
            </FormControl>
            <FormControl isRequired>
              <FormLabel fontSize="sm" color="fg.muted" mb={1.5}>新密码</FormLabel>
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
            </FormControl>
            <Box><Button type="submit" isLoading={pwLoading}>修改密码</Button></Box>
          </Stack>
        </form>
      </Section>

      <Section label="数据导出">
        <Text color="fg.subtle" fontSize="sm" mb={4} lineHeight={1.6}>
          导出当前组织下所有学生、批改记录、错题本、模板的 JSON 文件。
        </Text>
        <Button as="a" href="/api/me/export" download="teacher-score-export.json" variant="outline">
          下载我的数据
        </Button>
      </Section>

      <Section label="危险操作" danger>
        <Text color="fg.subtle" fontSize="sm" mb={4} lineHeight={1.6}>
          注销账户将永久删除你的所有数据。此操作不可恢复。
        </Text>
        <Button variant="outline" color="status.danger.fg" borderColor="status.danger.fg"
          _hover={{ bg: 'status.danger.bg', borderColor: 'status.danger.fg' }}
          onClick={deleteAccount} isLoading={delLoading}>
          注销账户
        </Button>
      </Section>
    </Stack>
  );
}

function Section({ label, danger, children }: { label: string; danger?: boolean; children: React.ReactNode }) {
  return (
    <Box pb={8} borderBottom="1px solid" borderColor="border.default">
      <Text fontFamily="mono" fontSize="xs" color={danger ? 'status.danger.fg' : 'fg.subtle'} letterSpacing="0.08em" textTransform="uppercase" mb={4}>
        {label}
      </Text>
      {children}
    </Box>
  );
}
