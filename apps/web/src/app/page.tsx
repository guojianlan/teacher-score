import Link from 'next/link';
import { Box, Button, Container, Flex, Heading, Stack, Text } from '@chakra-ui/react';

export default function HomePage() {
  return (
    <Box minH="100vh" bg="paper.50" position="relative">
      {/* 极简顶部 */}
      <Box px={[6, 10]} py={6} borderBottom="1px solid" borderColor="ink.100">
        <Container maxW="6xl" px={0}>
          <Flex align="center" justify="space-between">
            <Text fontSize="lg" fontWeight={500} fontStyle="italic">教研室</Text>
            <Box display="flex" gap={4}>
              <Button as={Link} href="/sign-in" variant="ghost" size="sm">
                登录
              </Button>
              <Button as={Link} href="/sign-up" variant="solid" size="sm">
                注册
              </Button>
            </Box>
          </Flex>
        </Container>
      </Box>

      {/* Hero */}
      <Container maxW="3xl" py={[16, 28]} px={[6, 10]}>
        <Stack spacing={10}>
          <Text fontFamily="mono" fontSize="xs" color="ink.500" letterSpacing="0.12em" textTransform="uppercase">
            for 1-on-1 tutors · v0.1
          </Text>
          <Heading as="h1" fontSize={['44px', '64px']} lineHeight={1.05} letterSpacing="-0.02em" fontWeight={400}>
            一张照片，
            <Text as="span" fontStyle="italic" color="accent.500">批改完成。</Text>
            <br />
            学生的薄弱点，从此<Text as="span" fontStyle="italic">自动沉淀</Text>。
          </Heading>
          <Text fontSize="lg" color="ink.500" maxW="56ch" lineHeight={1.65}>
            老师拍照、上传，多模态模型识别题目并判分。每一道错题被静默归档，按知识点排序，
            形成可查可教的学情资产。
          </Text>
          <Box pt={4}>
            <Button as={Link} href="/sign-up" size="lg" mr={4}>
              开始批改 →
            </Button>
            <Button as={Link} href="/sign-in" variant="ghost" size="lg">
              已有账号
            </Button>
          </Box>
        </Stack>

        <Box mt={[20, 28]} pt={10} borderTop="1px solid" borderColor="ink.100">
          <Text fontFamily="mono" fontSize="xs" color="ink.500" letterSpacing="0.1em" mb={6}>
            FEATURES
          </Text>
          <Stack spacing={6}>
            {[
              ['01', '拍照即批改', '电脑摄像头、文件上传、手机扫码三选一。系统自动 EXIF 清洗、跨设备同步。'],
              ['02', '错题自动归集', '错过的题按 questionHash 去重，按知识点排序，按重复次数排序。'],
              ['03', '试卷模板复用', '第二次同卷直接对照判分，跳过题目识别，节省 LLM 调用。'],
              ['04', '学情资产', '进步曲线、知识点热力图、PDF 报告。家长 7 天签名链接可分享。'],
            ].map(([no, title, desc]) => (
              <Flex key={no} gap={6} align="flex-start">
                <Text fontFamily="mono" color="ink.300" fontSize="sm" w="32px" flexShrink={0}>
                  {no}
                </Text>
                <Box>
                  <Text fontSize="lg" fontWeight={500} mb={1}>{title}</Text>
                  <Text fontSize="md" color="ink.500" lineHeight={1.65}>{desc}</Text>
                </Box>
              </Flex>
            ))}
          </Stack>
        </Box>
      </Container>

      <Box py={10} px={6} borderTop="1px solid" borderColor="ink.100">
        <Container maxW="6xl" px={0}>
          <Flex justify="space-between" align="center" gap={4} flexWrap="wrap">
            <Text fontSize="sm" color="ink.500" fontFamily="mono">
              © 2026 教研室
            </Text>
            <Text fontSize="sm" color="ink.500">
              一对一辅导老师的工具
            </Text>
          </Flex>
        </Container>
      </Box>
    </Box>
  );
}
