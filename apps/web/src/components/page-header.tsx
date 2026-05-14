'use client';

import { Box, Flex, Heading, Text } from '@chakra-ui/react';
import type { ReactNode } from 'react';

interface Props {
  eyebrow?: string;       // 上方小字，比如 "今天 · 工作台"
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function PageHeader({ eyebrow, title, description, actions }: Props) {
  return (
    <Box pb={8} mb={8} borderBottom="1px solid" borderColor="ink.100">
      {eyebrow && (
        <Text
          fontSize="xs"
          fontFamily="mono"
          color="ink.500"
          letterSpacing="0.08em"
          textTransform="uppercase"
          mb={3}
        >
          {eyebrow}
        </Text>
      )}
      <Flex align="flex-end" justify="space-between" gap={6} flexWrap="wrap">
        <Box flex="1" minW="240px">
          <Heading as="h1" size="2xl" fontStyle={title.length < 8 ? 'italic' : 'normal'}>
            {title}
          </Heading>
          {description && (
            <Text mt={3} color="ink.500" fontSize="md" maxW="60ch">
              {description}
            </Text>
          )}
        </Box>
        {actions && <Box>{actions}</Box>}
      </Flex>
    </Box>
  );
}
