import Link from 'next/link';
import { Box, Button, Container, Heading, Stack, Text } from '@chakra-ui/react';

export default function HomePage() {
  return (
    <Container maxW="container.md" py={20}>
      <Stack spacing={6}>
        <Heading size="2xl">教师批改</Heading>
        <Text fontSize="lg" color="gray.600">
          老师拍照批改试卷。多模态 LLM 自动判分、老师一键改分、错题自动归集为学情资产。
        </Text>
        <Box>
          <Button as={Link} href="/sign-in" colorScheme="brand" size="lg" mr={3}>
            登录
          </Button>
          <Button as={Link} href="/sign-up" variant="outline" size="lg">
            注册
          </Button>
        </Box>
      </Stack>
    </Container>
  );
}
