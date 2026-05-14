'use client';

import { useEffect, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  FormControl,
  FormLabel,
  Heading,
  Input,
  Select,
  Stack,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  useToast,
} from '@chakra-ui/react';
import { apiClient } from '@/lib/api-client';

interface Org {
  id: string;
  name: string;
  isPersonal: boolean;
  subscriptionTier: string;
  monthlyQuota: number;
  role: string;
}

interface Member {
  id: string;
  userId: string;
  role: string;
  userName: string;
  userEmail: string;
}

export default function OrgPage() {
  const toast = useToast();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member');

  const refresh = async () => {
    const [o, m] = await Promise.all([
      apiClient.get<{ organizations: Org[] }>('/api/orgs/mine'),
      apiClient.get<{ members: Member[] }>('/api/orgs/members'),
    ]);
    if (o.ok) setOrgs(o.data.organizations);
    if (m.ok) setMembers(m.data.members);
  };

  useEffect(() => {
    refresh();
  }, []);

  const onSwitch = async (id: string) => {
    const res = await apiClient.post('/api/orgs/switch', { organizationId: id });
    if (res.ok) {
      toast({ status: 'success', title: '已切换组织，刷新页面以生效' });
      window.location.reload();
    } else toast({ status: 'error', title: '切换失败' });
  };

  const onInvite = async () => {
    if (!inviteEmail) return;
    const res = await apiClient.post('/api/orgs/invite', { email: inviteEmail, role: inviteRole });
    if (res.ok) {
      toast({ status: 'success', title: '邀请已创建' });
      setInviteEmail('');
    } else toast({ status: 'error', title: '邀请失败', description: res.error.message });
  };

  return (
    <Stack spacing={6}>
      <Heading size="lg">组织</Heading>

      <Box bg="white" p={5} rounded="md" borderWidth="1px">
        <Heading size="md" mb={3}>
          我所在的组织
        </Heading>
        <Table size="sm">
          <Thead>
            <Tr>
              <Th>名称</Th>
              <Th>类型</Th>
              <Th>套餐</Th>
              <Th>角色</Th>
              <Th>操作</Th>
            </Tr>
          </Thead>
          <Tbody>
            {orgs.map((o) => (
              <Tr key={o.id}>
                <Td>{o.name}</Td>
                <Td>{o.isPersonal ? '个人' : '机构'}</Td>
                <Td>
                  <Badge>{o.subscriptionTier}</Badge> {o.monthlyQuota}/月
                </Td>
                <Td>{o.role}</Td>
                <Td>
                  <Button size="xs" onClick={() => onSwitch(o.id)}>
                    切换为活跃
                  </Button>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </Box>

      <Box bg="white" p={5} rounded="md" borderWidth="1px">
        <Heading size="md" mb={3}>
          当前组织成员
        </Heading>
        <Table size="sm">
          <Thead>
            <Tr>
              <Th>姓名</Th>
              <Th>邮箱</Th>
              <Th>角色</Th>
            </Tr>
          </Thead>
          <Tbody>
            {members.map((m) => (
              <Tr key={m.id}>
                <Td>{m.userName}</Td>
                <Td>{m.userEmail}</Td>
                <Td>
                  <Badge colorScheme={m.role === 'owner' ? 'purple' : 'gray'}>{m.role}</Badge>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </Box>

      <Box bg="white" p={5} rounded="md" borderWidth="1px">
        <Heading size="md" mb={3}>
          邀请老师
        </Heading>
        <Stack direction={{ base: 'column', md: 'row' }} spacing={3}>
          <FormControl>
            <FormLabel fontSize="sm">邮箱</FormLabel>
            <Input
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="teacher@example.com"
            />
          </FormControl>
          <FormControl maxW="160px">
            <FormLabel fontSize="sm">角色</FormLabel>
            <Select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as 'admin' | 'member')}>
              <option value="member">member</option>
              <option value="admin">admin</option>
            </Select>
          </FormControl>
          <Box pt={6}>
            <Button colorScheme="brand" onClick={onInvite}>
              发送邀请
            </Button>
          </Box>
        </Stack>
      </Box>
    </Stack>
  );
}
