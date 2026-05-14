'use client';

import { useEffect, useState } from 'react';
import {
  Badge, Box, Button, FormControl, FormLabel, Input, Select, Stack, Table, Tbody, Td, Text, Th, Thead, Tr, useToast,
} from '@chakra-ui/react';
import { apiClient } from '@/lib/api-client';
import { PageHeader } from '@/components/page-header';

interface Org { id: string; name: string; isPersonal: boolean; subscriptionTier: string; monthlyQuota: number; role: string; }
interface Member { id: string; userId: string; role: string; userName: string; userEmail: string; }

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
  useEffect(() => { refresh(); }, []);

  const onSwitch = async (id: string) => {
    const res = await apiClient.post('/api/orgs/switch', { organizationId: id });
    if (res.ok) { toast({ status: 'success', title: '已切换，刷新生效' }); window.location.reload(); }
    else toast({ status: 'error', title: '切换失败' });
  };

  const onInvite = async () => {
    if (!inviteEmail) return;
    const res = await apiClient.post('/api/orgs/invite', { email: inviteEmail, role: inviteRole });
    if (res.ok) { toast({ status: 'success', title: '邀请已创建' }); setInviteEmail(''); }
    else toast({ status: 'error', title: '邀请失败', description: res.error.message });
  };

  return (
    <Stack spacing={10}>
      <PageHeader eyebrow="多租户" title="组织" />

      <Section label="我的组织">
        <Table size="md">
          <Thead>
            <Tr>
              <Th>名称</Th>
              <Th>类型</Th>
              <Th>套餐</Th>
              <Th>角色</Th>
              <Th></Th>
            </Tr>
          </Thead>
          <Tbody>
            {orgs.map((o) => (
              <Tr key={o.id} _hover={{ bg: 'paper.100' }}>
                <Td fontWeight={500}>{o.name}</Td>
                <Td color="ink.500" fontSize="sm">{o.isPersonal ? '个人' : '机构'}</Td>
                <Td><Badge bg="paper.200" color="ink.700">{o.subscriptionTier}</Badge> <Text as="span" fontFamily="mono" fontSize="sm" color="ink.500">{o.monthlyQuota}/月</Text></Td>
                <Td color="ink.500" fontSize="sm">{o.role}</Td>
                <Td><Button size="xs" variant="ghost" onClick={() => onSwitch(o.id)}>切换 →</Button></Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </Section>

      <Section label="当前组织成员">
        <Table size="md">
          <Thead>
            <Tr><Th>姓名</Th><Th>邮箱</Th><Th>角色</Th></Tr>
          </Thead>
          <Tbody>
            {members.map((m) => (
              <Tr key={m.id} _hover={{ bg: 'paper.100' }}>
                <Td>{m.userName}</Td>
                <Td color="ink.500" fontSize="sm">{m.userEmail}</Td>
                <Td><Badge bg={m.role === 'owner' ? 'accent.50' : 'paper.200'} color={m.role === 'owner' ? 'accent.700' : 'ink.700'}>{m.role}</Badge></Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </Section>

      <Section label="邀请老师">
        <Stack direction={['column', 'row']} spacing={3} align="flex-end">
          <FormControl flex="1">
            <FormLabel fontSize="sm" color="ink.700" mb={1.5}>邮箱</FormLabel>
            <Input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="teacher@example.com" />
          </FormControl>
          <FormControl maxW="180px">
            <FormLabel fontSize="sm" color="ink.700" mb={1.5}>角色</FormLabel>
            <Select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as 'admin' | 'member')}>
              <option value="member">member</option>
              <option value="admin">admin</option>
            </Select>
          </FormControl>
          <Button onClick={onInvite}>发送邀请 →</Button>
        </Stack>
      </Section>
    </Stack>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box pb={8} borderBottom="1px solid" borderColor="ink.100">
      <Text fontFamily="mono" fontSize="xs" color="ink.500" letterSpacing="0.08em" textTransform="uppercase" mb={4}>
        {label}
      </Text>
      {children}
    </Box>
  );
}
