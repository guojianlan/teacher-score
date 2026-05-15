import Link from 'next/link';
import { Box, Button, Container, Flex, Heading, Stack, Text } from '@/components/ui';

export default function HomePage() {
  return (
    <Box minH="100vh" bg="bg.canvas">
      {/* Top nav */}
      <Box px={[6, 10]} py={5} borderBottom="1px solid" borderColor="border.subtle" bg="bg.surface">
        <Container maxW="6xl" px={0}>
          <Flex align="center" justify="space-between">
            <Flex align="center" gap={2}>
              <Box
                w="28px" h="28px" borderRadius="md"
                bg="interactive.primary.bg" color="white"
                display="flex" alignItems="center" justifyContent="center"
                fontFamily="serif" fontWeight={600} fontSize="sm"
              >T</Box>
              <Text fontFamily="heading" fontWeight={600} fontSize="md">教师批改</Text>
            </Flex>
            <Flex gap={3}>
              <Button asChild  variant="ghost" size="sm"><Link href="/sign-in">登录</Link></Button>
              <Button asChild  size="sm"><Link href="/sign-up">免费注册</Link></Button>
            </Flex>
          </Flex>
        </Container>
      </Box>

      {/* Hero */}
      <Container maxW="3xl" py={[16, 24]} px={[6, 10]}>
        <Stack gap={8}>
          <Text fontFamily="mono" fontSize="xs" color="interactive.primary.bg" letterSpacing="0.1em" textTransform="uppercase" fontWeight={600}>
            for 1-on-1 tutors · v0.1
          </Text>
          <Heading
            as="h1"
            fontSize={['36px', '52px']}
            lineHeight={1.15}
            letterSpacing="-0.01em"
            fontWeight={500}
            fontFamily="heading"
          >
            一张照片，批改完成。
            <br />
            <Text as="span" color="interactive.primary.bg">学生的薄弱点</Text>
            ，从此自动沉淀。
          </Heading>
          <Text fontSize="lg" color="fg.subtle" maxW="56ch" lineHeight={1.7}>
            老师拍照、上传，多模态模型识别题目并判分。每一道错题被静默归档，按知识点排序，
            形成可查可教的学情资产。
          </Text>
          <Flex gap={3} pt={2}>
            <Button asChild  size="lg"><Link href="/sign-up">开始批改 →</Link></Button>
            <Button asChild  variant="outline" size="lg"><Link href="/sign-in">已有账号</Link></Button>
          </Flex>
        </Stack>

        {/* Features */}
        <Box mt={[16, 24]} pt={10} borderTop="1px solid" borderColor="border.default">
          <Text fontFamily="mono" fontSize="xs" color="fg.subtle" letterSpacing="0.1em" mb={8} fontWeight={600}>
            FEATURES
          </Text>
          <Stack gap={0}>
            {[
              ['01', '拍照即批改', '电脑摄像头、文件上传、手机扫码三选一。EXIF 清洗、跨设备同步。'],
              ['02', '错题自动归集', '错过的题按 questionHash 去重，按知识点排序，按重复次数排序。'],
              ['03', '试卷模板复用', '第二次同卷直接对照判分，跳过题目识别，节省 LLM 调用。'],
              ['04', '学情资产', '进步曲线、知识点热力图、PDF 报告。家长 7 天签名链接可分享。'],
            ].map(([no, title, desc], i, arr) => (
              <Flex
                key={no}
                gap={6}
                align="flex-start"
                py={6}
                borderBottom={i === arr.length - 1 ? 'none' : '1px solid'}
                borderColor="border.subtle"
              >
                <Text fontFamily="mono" color="interactive.primary.bg" fontSize="sm" fontWeight={600} w="32px" flexShrink={0}>
                  {no}
                </Text>
                <Box flex="1">
                  <Text fontSize="lg" fontFamily="heading" fontWeight={600} mb={1}>{title}</Text>
                  <Text fontSize="md" color="fg.subtle" lineHeight={1.65}>{desc}</Text>
                </Box>
              </Flex>
            ))}
          </Stack>
        </Box>
      </Container>

      {/* Footer */}
      <Box py={8} px={6} borderTop="1px solid" borderColor="border.subtle" bg="bg.surface">
        <Container maxW="6xl" px={0}>
          <Flex justify="space-between" align="center" gap={4} flexWrap="wrap">
            <Text fontSize="sm" color="fg.subtle" fontFamily="mono">© 2026 教师批改</Text>
            <Text fontSize="sm" color="fg.subtle">一对一辅导老师的工具</Text>
          </Flex>
        </Container>
      </Box>
    </Box>
  );
}
