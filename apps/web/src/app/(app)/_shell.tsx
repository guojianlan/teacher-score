'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Box, Flex, Text } from '@/components/ui';
import { signOut } from '@teacher-score/auth/client';
import { ThemeToggle } from '@/components/theme-toggle';

interface Me {
  user: { id: string; email: string };
  organization: { id: string; name: string; subscriptionTier: string; monthlyQuota: number } | null;
  quota: { yearMonth: string; gradingsUsed: number };
}

const NAV: { href: string; label: string; icon: string }[] = [
  { href: '/dashboard', label: '工作台', icon: '⌂' },
  { href: '/students', label: '学生', icon: '◍' },
  { href: '/classes', label: '班级', icon: '⊞' },
  { href: '/grade', label: '批改', icon: '✎' },
  { href: '/history', label: '历史', icon: '◷' },
  { href: '/mistakes', label: '错题本', icon: '✕' },
  { href: '/answer-sheets', label: '答题卡', icon: '☷' },
  { href: '/org', label: '组织', icon: '⊟' },
  { href: '/settings', label: '设置', icon: '⚙' },
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
    <Flex minH="100vh" bg="bg.canvas">
      {/* Sidebar */}
      <Box
        w="248px"
        flexShrink={0}
        bg="bg.surface"
        borderRight="1px solid"
        borderColor="border.default"
        display="flex"
        flexDirection="column"
        position="sticky"
        top={0}
        h="100vh"
      >
        {/* Brand */}
        <Box px={6} pt={7} pb={6}>
          <Link href="/dashboard">
            <Flex align="center" gap={2} cursor="pointer">
              <Box
                w="32px" h="32px" borderRadius="lg"
                bg="interactive.primary.bg" color="white"
                display="flex" alignItems="center" justifyContent="center"
                fontFamily="serif" fontWeight={600} fontSize="lg"
              >
                T
              </Box>
              <Box>
                <Text fontFamily="heading" fontWeight={600} fontSize="md" color="text.fg" lineHeight={1.1}>
                  教师批改
                </Text>
                <Text fontFamily="mono" fontSize="2xs" color="fg.subtle" letterSpacing="0.04em">
                  teacher-score
                </Text>
              </Box>
            </Flex>
          </Link>
        </Box>

        {/* Nav */}
        <Box flex="1" px={3} overflowY="auto">
          {NAV.map((n) => {
            const active = pathname === n.href || pathname.startsWith(n.href + '/');
            return (
              <Link key={n.href} href={n.href}>
                <Flex
                  align="center"
                  py={2}
                  px={3}
                  borderRadius="md"
                  cursor="pointer"
                  bg={active ? 'bg.primarySubtle' : 'transparent'}
                  color={active ? 'interactive.primary.bgHover' : 'fg.muted'}
                  _hover={{ bg: active ? 'bg.primarySubtle' : 'bg.surfaceSubtle' }}
                  fontSize="sm"
                  fontWeight={active ? 600 : 500}
                  transition="all 120ms ease"
                  mb="2px"
                >
                  <Text
                    as="span"
                    mr={3}
                    color={active ? 'interactive.primary.bg' : 'fg.subtle'}
                    fontSize="md"
                    w="16px"
                    textAlign="center"
                    flexShrink={0}
                  >
                    {n.icon}
                  </Text>
                  {n.label}
                </Flex>
              </Link>
            );
          })}
        </Box>

        {/* Quota */}
        <Box mx={4} mb={3} p={4} bg="bg.surfaceSubtle" borderRadius="lg">
          <Flex justify="space-between" align="baseline" mb={2}>
            <Text fontSize="xs" color="fg.subtle" fontWeight={500}>
              本月配额
            </Text>
            <Text fontSize="xs" color="fg.muted" fontFamily="mono" fontWeight={600}>
              {used}/{quota}
            </Text>
          </Flex>
          <Box h="4px" bg="bg.muted" borderRadius="full" overflow="hidden">
            <Box
              h="100%"
              w={`${pct}%`}
              bg={pct > 85 ? 'status.danger.solid' : 'interactive.primary.bg'}
              transition="width 200ms ease"
            />
          </Box>
          <Text mt={2} fontSize="xs" color="fg.subtle" fontFamily="mono">
            {me.quota.yearMonth}
          </Text>
        </Box>

        {/* User */}
        <Box px={6} py={4} borderTop="1px solid" borderColor="border.subtle">
          <Flex align="center" justify="space-between" gap={2}>
            <Box overflow="hidden" flex="1">
              <Text fontSize="sm" color="fg.default" fontWeight={600} lineClamp={1}>
                {me.user.email.split('@')[0]}
              </Text>
              <Text fontSize="xs" color="fg.subtle" lineClamp={1}>
                {me.user.email}
              </Text>
            </Box>
            <ThemeToggle />
            <Box
              as="button"
              fontSize="xs"
              color="fg.subtle"
              _hover={{ color: 'fg.default' }}
              onClick={onSignOut}
              px={2}
              py={1}
              borderRadius="sm"
            >
              退出
            </Box>
          </Flex>
        </Box>
      </Box>

      {/* Main */}
      <Box flex="1" minW={0}>
        <Box maxW="1080px" mx="auto" px={[6, 10, 14]} py={[8, 12]}>
          {children}
        </Box>
      </Box>
    </Flex>
  );
}
