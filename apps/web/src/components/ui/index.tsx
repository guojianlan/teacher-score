/**
 * Chakra UI v3 compat shim —— 给业务代码一个 v2-like API。
 *
 * 业务代码：`import { Button, Input, FormControl, ... } from '@/components/ui'`
 *
 * 这里把 v3 的 namespace API（Field.Root, Tooltip.Root, ...）包装回 v2 名称，
 * 这样业务代码无需 namespace 跟 trigger/positioner/content 的样板。
 */

'use client';

import {
  Field,
  NativeSelect,
  Tooltip as ChTooltip,
  Drawer as ChDrawer,
  Table as ChTable,
  Toast,
  createToaster,
  Toaster as ChToaster,
  Portal,
} from '@chakra-ui/react';
import type { ReactNode } from 'react';

// ── re-export trivial primitives ──────────────────────────────────
// 注意：Alert / Tag / Progress 是 namespace，下面用 wrapper 暴露 v2 风格 API
export {
  Box, Flex, Stack, HStack, VStack,
  Heading, Text, Button, IconButton, Spinner,
  Image, Container, Input, Textarea, Badge,
  Separator, useDisclosure,
} from '@chakra-ui/react';

// ── FormControl / FormLabel (v3: Field.Root / Field.Label) ─────────
type FormControlProps = React.ComponentProps<typeof Field.Root> & { children?: ReactNode };
export function FormControl({ children, ...props }: FormControlProps) {
  return <Field.Root {...props}>{children}</Field.Root>;
}
export const FormLabel = Field.Label;
export const FormHelperText = Field.HelperText;
export const FormErrorMessage = Field.ErrorText;

// ── Select (v3: NativeSelect.Root + NativeSelect.Field) ────────────
type SelectProps = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> & {
  size?: 'xs' | 'sm' | 'md' | 'lg';
  variant?: 'outline' | 'subtle' | 'plain';
  maxW?: string | number;
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _NativeSelectRoot = NativeSelect.Root as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _NativeSelectField = NativeSelect.Field as any;
export function Select({ children, size, variant, maxW, ...rest }: SelectProps) {
  return (
    <_NativeSelectRoot size={size} variant={variant} maxW={maxW}>
      <_NativeSelectField {...rest}>{children}</_NativeSelectField>
      <NativeSelect.Indicator />
    </_NativeSelectRoot>
  );
}

// ── Tooltip (v3: namespace) ────────────────────────────────────────
type TooltipProps = {
  label: ReactNode;
  placement?: 'top' | 'bottom' | 'left' | 'right';
  hasArrow?: boolean;
  openDelay?: number;
  children: ReactNode;
};
export function Tooltip({ label, children, openDelay = 200 }: TooltipProps) {
  return (
    <ChTooltip.Root openDelay={openDelay}>
      <ChTooltip.Trigger asChild>{children}</ChTooltip.Trigger>
      <Portal>
        <ChTooltip.Positioner>
          <ChTooltip.Content>{label}</ChTooltip.Content>
        </ChTooltip.Positioner>
      </Portal>
    </ChTooltip.Root>
  );
}

// ── Drawer (v3: namespace) ─────────────────────────────────────────
// 兼容 v2 风格：传 open + onClose，内部转成 v3 的 open + onOpenChange
interface DrawerProps {
  open: boolean;
  onClose?: () => void;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'full';
  children: ReactNode;
}
export function Drawer({ open, onClose, size, children }: DrawerProps) {
  return (
    <ChDrawer.Root
      open={open}
      onOpenChange={(e) => { if (!e.open) onClose?.(); }}
      size={size}
    >
      <Portal><ChDrawer.Backdrop /><ChDrawer.Positioner>{children}</ChDrawer.Positioner></Portal>
    </ChDrawer.Root>
  );
}
export const DrawerOverlay = ChDrawer.Backdrop;
export const DrawerContent = ChDrawer.Content;
export const DrawerHeader = ChDrawer.Header;
export const DrawerBody = ChDrawer.Body;
export const DrawerFooter = ChDrawer.Footer;
export const DrawerCloseButton = ChDrawer.CloseTrigger;

// ── Table (v3: namespace) ──────────────────────────────────────────
export const Table = ChTable.Root;
export const Thead = ChTable.Header;
export const Tbody = ChTable.Body;
export const Tr = ChTable.Row;
export const Th = ChTable.ColumnHeader;
export const Td = ChTable.Cell;

// ── Toast (v3: toaster) ────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const toaster: any = createToaster({ placement: 'top-end', overlap: false });

interface ToastOpts {
  title?: ReactNode;
  description?: ReactNode;
  status?: 'success' | 'error' | 'warning' | 'info' | 'loading';
  duration?: number;
}
/** v2-like `useToast` 兼容。返回一个函数，调用时 toast 出来。 */
export function useToast() {
  return (opts: ToastOpts) => {
    toaster.create({
      title: opts.title,
      description: opts.description,
      type: opts.status,
      duration: opts.duration ?? 4000,
    });
  };
}

// Toaster 组件放在 layout 树根附近用一次，所有 toast 都在它上面渲染
export function Toaster() {
  return (
    <ChToaster toaster={toaster}>
      {(t) => (
        <Toast.Root>
          <Toast.Title>{t.title}</Toast.Title>
          {t.description && <Toast.Description>{t.description}</Toast.Description>}
        </Toast.Root>
      )}
    </ChToaster>
  );
}

// ── Stat (v3 没有专用 Stat 组件，简单实现一个) ──────────────────────
interface StatProps {
  label: ReactNode;
  value?: ReactNode;
  children?: ReactNode;
}
export function StatGroup({ children }: { children: ReactNode }) {
  return <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>{children}</div>;
}
export function Stat({ children }: StatProps) {
  return <div>{children}</div>;
}
export function StatLabel({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.6, marginBottom: 4 }}>{children}</div>;
}
export function StatNumber({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 28, fontWeight: 600 }}>{children}</div>;
}

// Alert: v3 has Alert as namespace; expose v2-style `Alert` + `AlertIcon`
import { Alert as ChAlert } from '@chakra-ui/react';
type AlertProps = React.ComponentProps<typeof ChAlert.Root> & { status?: 'info' | 'success' | 'warning' | 'error' };
export function AlertIcon() { return <ChAlert.Indicator />; }
export function Alert({ children, status, ...props }: AlertProps) {
  return <ChAlert.Root status={status} {...props}>{children}</ChAlert.Root>;
}

// CheckboxGroup / Checkbox (used in students form)
import { CheckboxGroup as ChCheckboxGroup, Checkbox as ChCheckbox } from '@chakra-ui/react';
export const CheckboxGroup = ChCheckboxGroup;
export function Checkbox({ children, value, ...rest }: { children?: ReactNode; value?: string } & Record<string, unknown>) {
  return (
    <ChCheckbox.Root value={value} {...rest}>
      <ChCheckbox.HiddenInput />
      <ChCheckbox.Control />
      <ChCheckbox.Label>{children}</ChCheckbox.Label>
    </ChCheckbox.Root>
  );
}

// Tag (v3: namespace)
import { Tag as ChTag, Progress as ChProgress } from '@chakra-ui/react';
type TagProps = React.ComponentProps<typeof ChTag.Root> & { children?: ReactNode };
export function Tag({ children, ...props }: TagProps) {
  return (
    <ChTag.Root {...props}>
      <ChTag.Label>{children}</ChTag.Label>
    </ChTag.Root>
  );
}

// Progress (v3: namespace) —— v2-style：<Progress value={...} isIndeterminate size="xs" />
interface ProgressProps {
  value?: number;
  isIndeterminate?: boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  colorScheme?: string;
}
export function Progress({ value, isIndeterminate, size, colorScheme }: ProgressProps) {
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <ChProgress.Root {...({ value: isIndeterminate ? null : (value ?? 0), size, colorPalette: colorScheme } as any)}>
      <ChProgress.Track>
        <ChProgress.Range />
      </ChProgress.Track>
    </ChProgress.Root>
  );
}
