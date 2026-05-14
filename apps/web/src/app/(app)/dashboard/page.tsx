import Link from 'next/link';
import { Box, Button, Heading, SimpleGrid, Stack, Text } from '@chakra-ui/react';

export default function DashboardPage() {
  return (
    <Stack spacing={6}>
      <Box bg="white" rounded="md" borderWidth="1px" p={6}>
        <Heading size="lg" mb={2}>
          欢迎回来
        </Heading>
        <Text color="gray.600">
          先添加学生，然后上传或拍照学生答卷开始批改。每次批改都会自动归集错题。
        </Text>
      </Box>

      <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
        <Card title="添加学生" href="/students" desc="学生管理 / 学科 / 备注" />
        <Card title="开始批改" href="/grade" desc="拍照或上传，3 秒内入队" />
        <Card title="错题本" href="/mistakes" desc="自动去重，按知识点排序" />
      </SimpleGrid>
    </Stack>
  );
}

function Card({ title, href, desc }: { title: string; href: string; desc: string }) {
  return (
    <Box bg="white" rounded="md" borderWidth="1px" p={5}>
      <Heading size="md" mb={2}>
        {title}
      </Heading>
      <Text color="gray.600" mb={4}>
        {desc}
      </Text>
      <Button as={Link} href={href} colorScheme="brand" size="sm">
        进入
      </Button>
    </Box>
  );
}
