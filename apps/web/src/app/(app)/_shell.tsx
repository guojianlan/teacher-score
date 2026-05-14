'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Box, Flex, Text } from '@chakra-ui/react';
import { signOut } from '@teacher-score/auth/client';

interface Me {
  user: { id: string; email: string };
  organization: { id: string; name: string; subscriptionTier: string; monthlyQuota: number } | null;
  quota: { yearMonth: string; gradingsUsed: number };
}

const NAV: { href: string; label: string }[] = [
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
  const pathname = usePathname() ?? '';
  const router = useRouter();

  const onSignOut = async () => {
    await signOut();
    router.replace('/sign-in');
  };

  const used = me.quota.gradingsUsed;
  const quota = me.organization?.monthlyQuota ?? 50;
  const pct = Math.min(100, Math.round((used / quota) * 100));

  return (
    <Flex minH="100vh" bg="paper.50">
      <Box
        w="240px"
        flexShrink={0}
        bg="paper.100"
        borderRight="1px solid"
        borderColor="ink.100"
        display="flex"
        flexDirection="column"
        position="sticky"
        top={0}
        h="100vh"
      >
        <Box px={6} pt={7} pb={6}>
          <Link href="/dashboard">
            <Text
              fontSize="2xl"
              fontWeight={500}
              letterSpacing="-0.02em"
              color="ink.900"
              cursor="pointer"
              fontStyle="italic"
            >
              教研室
            </Text>
            <Text fontSize="xs" color="ink.500" mt={1} fontFamily="mono">
              teacher-score
            </Text>
          </Link>
        </Box>

        <Box flex="1" px={4} overflowY="auto">
          {NAV.map((n) => {
            const active = pathname === n.href || pathname.startsWith(n.href + '/');
            return (
              <Link key={n.href} href={n.href}>
                <Flex
                  align="center"
                  py="7px"
                  px={3}
                  borderRadius="6px"
                  cursor="pointer"
                  bg={active ? 'paper.300' : 'transparent'}
                  color={active ? 'ink.900' : 'ink.700'}
                  _hover={{ bg: active ? 'paper.300' : 'paper.200' }}
                  fontSize="md"
                  fontWeight={active ? 500 : 400}
                  transition="all 120ms ease"
                >
                  <Text as="span" mr={2} color={active ? 'accent.500' : 'ink.300'} fontFamily="mono" fontSize="sm">
                    {active ? '›' : ' '}
                  </Text>
                  {n.label}
                </Flex>
              </Link>
            );
          })}
        </Box>

        <Box px={6} py={4} borderTop="1px solid" borderColor="ink.100">
          <Flex justify="space-between" align="baseline" mb={2}>
            <Text fontSize="xs" color="ink.500" fontFamily="mono">
              本月 · {me.quota.yearMonth}
            </Text>
            <Text fontSize="xs" color="ink.700" fontFamily="mono">
              {used}/{quota}
            </Text>
          </Flex>
          <Box h="3px" bg="ink.100" borderRadius="full" overflow="hidden">
            <Box h="3px" w={`${pct}%`} bg={pct > 85 ? 'danger.500' : 'accent.500'} transition="width 200ms ease" />
          </Box>
        </Box>

        <Box px={6} py={4} borderTop="1px solid" borderColor="ink.100">
          <Flex align="center" justify="space-between">
            <Box overflow="hidden">
              <Text fontSize="sm" color="ink.900" fontWeight={500} noOfLines={1}>
                {me.user.email.split('@')[0]}
              </Text>
              <Text fontSize="xs" color="ink.500" noOfLines={1}>
                {me.user.email}
              </Text>
            </Box>
            <Box
              as="button"
              fontSize="xs"
              color="ink.500"
              _hover={{ color: 'ink.900' }}
              onClick={onSignOut}
              fontFamily="mono"
              letterSpacing="0.04em"
            >
              退出 ↪
            </Box>
          </Flex>
        </Box>
      </Box>

      <Box flex="1" minW={0}>
        <Box maxW="980px" mx="auto" px={[6, 10, 14]} py={[6, 10]}>
          {children}
        </Box>
      </Box>
    </Flex>
  );
}
