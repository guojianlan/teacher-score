'use client';

import { Box, Flex, Heading, Text } from '@chakra-ui/react';
import type { ReactNode } from 'react';

interface Props {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function PageHeader({ eyebrow, title, description, actions }: Props) {
  return (
    <Box pb={8} mb={8} borderBottom="1px solid" borderColor="border.base">
      {eyebrow && (
        <Text
          fontSize="xs"
          fontFamily="mono"
          color="text.fgSubtle"
          letterSpacing="0.08em"
          textTransform="uppercase"
          fontWeight={600}
          mb={3}
        >
          {eyebrow}
        </Text>
      )}
      <Flex align="flex-end" justify="space-between" gap={6} flexWrap="wrap">
        <Box flex="1" minW="240px">
          <Heading as="h1" size="2xl" fontFamily="heading">
            {title}
          </Heading>
          {description && (
            <Text mt={3} color="text.fgSubtle" fontSize="md" maxW="62ch" lineHeight={1.65}>
              {description}
            </Text>
          )}
        </Box>
        {actions && <Box>{actions}</Box>}
      </Flex>
    </Box>
  );
}
