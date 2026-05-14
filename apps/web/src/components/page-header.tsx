'use client';

import { Box, Flex, Heading, Text } from '@/components/ui';
import type { ReactNode } from 'react';

interface Props {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function PageHeader({ eyebrow, title, description, actions }: Props) {
  return (
    <Box pb={8} mb={8} borderBottom="1px solid" borderColor="border.default">
      {eyebrow && (
        <Text textStyle="overline" color="fg.subtle" mb={3}>
          {eyebrow}
        </Text>
      )}
      <Flex align="flex-end" justify="space-between" gap={6} flexWrap="wrap">
        <Box flex="1" minW="240px">
          {/* 用 textStyle，不再手写 fontSize/lineHeight */}
          <Heading as="h1" textStyle="heading.xl" color="fg.default">
            {title}
          </Heading>
          {description && (
            <Text mt={3} textStyle="body.lg" color="fg.muted" maxW="62ch">
              {description}
            </Text>
          )}
        </Box>
        {actions && <Box>{actions}</Box>}
      </Flex>
    </Box>
  );
}
