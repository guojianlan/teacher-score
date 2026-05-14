import Link from 'next/link';
import { Box, Flex, Stack, Text } from '@chakra-ui/react';
import { PageHeader } from '@/components/page-header';

export default function DashboardPage() {
  return (
    <Stack spacing={10}>
      <PageHeader
        eyebrow="今天 · 工作台"
        title="欢迎回来"
        description="先添加学生，然后上传或拍照学生答卷开始批改。每次批改都会自动归集错题。"
      />

      <Stack spacing={0} borderTop="1px solid" borderColor="border.default">
        {[
          { href: '/students', no: '01', title: '添加学生', desc: '建立学生档案。学科 / 年级 / 备注。', tag: '准备工作' },
          { href: '/grade', no: '02', title: '开始一次批改', desc: '拍照、上传、扫码任选其一。三秒内入队。', tag: '核心动作' },
          { href: '/mistakes', no: '03', title: '查看错题本', desc: '按知识点排序，按出现次数排序。', tag: '学情' },
          { href: '/history', no: '04', title: '历次成绩', desc: '按时间倒序，可按学生/学科筛选。', tag: '回顾' },
        ].map((it) => (
          <Link key={it.href} href={it.href}>
            <Flex
              py={6}
              px={2}
              borderBottom="1px solid"
              borderColor="border.default"
              align="flex-start"
              gap={6}
              cursor="pointer"
              role="group"
              transition="all 120ms ease"
              _hover={{ bg: 'bg.surfaceSubtle', px: 4 }}
            >
              <Text fontFamily="mono" color="fg.subtle" fontSize="sm" w="32px" flexShrink={0} pt={1}>
                {it.no}
              </Text>
              <Box flex="1">
                <Flex align="baseline" gap={3} mb={1}>
                  <Text fontSize="lg" fontWeight={500} color="text.fg">
                    {it.title}
                  </Text>
                  <Text fontFamily="mono" fontSize="xs" color="fg.subtle" letterSpacing="0.06em">
                    {it.tag}
                  </Text>
                </Flex>
                <Text fontSize="md" color="fg.subtle" lineHeight={1.6}>
                  {it.desc}
                </Text>
              </Box>
              <Box
                pt={2}
                color="fg.subtle"
                _groupHover={{ color: 'bg.brandSubtle0', transform: 'translateX(4px)' }}
                transition="all 120ms ease"
              >
                →
              </Box>
            </Flex>
          </Link>
        ))}
      </Stack>

      <Box pt={4}>
        <Text fontFamily="mono" fontSize="xs" color="fg.subtle" letterSpacing="0.08em" textTransform="uppercase" mb={4}>
          提示
        </Text>
        <Stack spacing={2} fontSize="sm" color="fg.subtle" lineHeight={1.7}>
          <Text>· 字迹不清的题会被标记 confidence=low，可手动改分。</Text>
          <Text>· 同卷第二次可"保存为模板"，下次自动套用、跳过识别。</Text>
          <Text>· 免费层 50 次/月。即将耗尽时左下角配额条会变红。</Text>
        </Stack>
      </Box>
    </Stack>
  );
}
