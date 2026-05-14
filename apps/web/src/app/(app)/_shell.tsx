'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Box,
  Button,
  Container,
  Flex,
  HStack,
  Heading,
  Progress,
  Spacer,
  Stack,
  Text,
} from '@chakra-ui/react';
import { signOut } from '@teacher-score/auth/client';

interface Me {
  user: { id: string; email: string };
  organization: { id: string; name: string; subscriptionTier: string; monthlyQuota: number } | null;
  quota: { yearMonth: string; gradingsUsed: number };
}

const NAV = [
  { href: '/dashboard', label: '工作台' },
  { href: '/students', label: '学生' },
  { href: '/grade', label: '批改' },
  { href: '/history', label: '历史' },
  { href: '/mistakes', label: '错题本' },
  { href: '/templates', label: '模板' },
  { href: '/org', label: '组织' },
  { href: '/settings', label: '设置' },
];

export function AppShell({ me, children }: { me: Me; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const onSignOut = async () => {
    await signOut();
    router.replace('/sign-in');
  };

  const used = me.quota.gradingsUsed;
  const quota = me.organization?.monthlyQuota ?? 50;
  const pct = Math.min(100, Math.round((used / quota) * 100));

  return (
    <Box minH="100vh" bg="gray.50">
      <Box bg="white" borderBottomWidth="1px">
        <Container maxW="container.lg">
          <Flex py={3} align="center">
            <Heading size="md">教师批改</Heading>
            <HStack spacing={4} ml={8}>
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  style={{
                    fontWeight: pathname?.startsWith(n.href) ? 600 : 400,
                    color: pathname?.startsWith(n.href) ? '#2563eb' : '#4a5568',
                  }}
                >
                  {n.label}
                </Link>
              ))}
            </HStack>
            <Spacer />
            <HStack spacing={3}>
              <Text fontSize="sm" color="gray.600">
                {me.user.email}
              </Text>
              <Button size="sm" variant="outline" onClick={onSignOut}>
                退出
              </Button>
            </HStack>
          </Flex>
        </Container>
      </Box>

      <Container maxW="container.lg" py={6}>
        <Stack spacing={4}>
          <Box bg="white" rounded="md" p={4} borderWidth="1px">
            <Flex align="center">
              <Box>
                <Text fontSize="sm" color="gray.500">
                  本月配额（{me.quota.yearMonth}）
                </Text>
                <Text fontWeight="semibold">
                  已用 {used} / {quota} 次
                </Text>
              </Box>
              <Spacer />
              <Box w="200px">
                <Progress value={pct} size="sm" colorScheme={pct > 85 ? 'red' : 'brand'} />
              </Box>
            </Flex>
          </Box>
          {children}
        </Stack>
      </Container>
    </Box>
  );
}
