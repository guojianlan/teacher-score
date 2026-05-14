import Link from 'next/link';
import { Box, Flex, Text } from '@chakra-ui/react';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <Box minH="100vh" bg="bg.surface">
      <Box px={[6, 10]} py={6} borderBottom="1px solid" borderColor="border.default">
        <Flex align="center" justify="space-between" maxW="6xl" mx="auto">
          <Link href="/">
            <Text fontSize="lg" fontWeight={500} fontStyle="italic" cursor="pointer">
              教研室
            </Text>
          </Link>
          <Text fontFamily="mono" fontSize="xs" color="fg.subtle" letterSpacing="0.1em">
            teacher-score
          </Text>
        </Flex>
      </Box>
      <Flex minH="calc(100vh - 76px)" align="center" justify="center" py={10}>
        <Box w="100%" maxW="420px" px={6}>
          {children}
        </Box>
      </Flex>
    </Box>
  );
}
