import { Box } from '@chakra-ui/react';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <Box minH="100vh" bg="gray.50">
      {children}
    </Box>
  );
}
