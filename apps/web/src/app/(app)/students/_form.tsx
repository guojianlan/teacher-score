'use client';

import { useEffect, useState } from 'react';
import {
  Button,
  Checkbox,
  CheckboxGroup,
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerOverlay,
  FormControl,
  FormLabel,
  HStack,
  Input,
  Stack,
  Textarea,
  useToast,
} from '@chakra-ui/react';
import { apiClient } from '@/lib/api-client';
import { SUBJECTS, type Subject } from '@teacher-score/types';

export interface Student {
  id: string;
  name: string;
  grade: string | null;
  subjects: string[];
  notes: string | null;
  archived: boolean;
}

const SUBJECT_LABELS: Record<string, string> = {
  math: '数学',
  english: '英语',
  chinese: '语文',
  physics: '物理',
  chemistry: '化学',
};

export function StudentFormDrawer({
  isOpen,
  onClose,
  editing,
  onSaved,
}: {
  isOpen: boolean;
  onClose: () => void;
  editing: Student | null;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [grade, setGrade] = useState('');
  const [subjects, setSubjects] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing) {
      setName(editing.name);
      setGrade(editing.grade ?? '');
      setSubjects(editing.subjects ?? []);
      setNotes(editing.notes ?? '');
    } else {
      setName('');
      setGrade('');
      setSubjects([]);
      setNotes('');
    }
  }, [editing, isOpen]);

  const submit = async () => {
    if (!name.trim()) {
      toast({ status: 'warning', title: '请填写姓名' });
      return;
    }
    setSaving(true);
    const body = {
      name: name.trim(),
      grade: grade.trim() || undefined,
      subjects: subjects as Subject[],
      notes: notes.slice(0, 5000) || undefined,
    };
    const res = editing
      ? await apiClient.patch(`/api/students/${editing.id}`, body)
      : await apiClient.post('/api/students', body);
    setSaving(false);
    if (res.ok) {
      toast({ status: 'success', title: editing ? '已更新' : '已创建' });
      onSaved();
    } else {
      toast({ status: 'error', title: '保存失败', description: res.error.message });
    }
  };

  return (
    <Drawer isOpen={isOpen} onClose={onClose} size="md">
      <DrawerOverlay />
      <DrawerContent>
        <DrawerCloseButton />
        <DrawerHeader>{editing ? '编辑学生' : '新建学生'}</DrawerHeader>
        <DrawerBody>
          <Stack spacing={4}>
            <FormControl isRequired>
              <FormLabel>姓名</FormLabel>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </FormControl>
            <FormControl>
              <FormLabel>年级</FormLabel>
              <Input placeholder="例如：初二" value={grade} onChange={(e) => setGrade(e.target.value)} />
            </FormControl>
            <FormControl>
              <FormLabel>学科</FormLabel>
              <CheckboxGroup value={subjects} onChange={(v) => setSubjects(v as string[])}>
                <HStack spacing={3} wrap="wrap">
                  {SUBJECTS.map((s) => (
                    <Checkbox key={s} value={s}>
                      {SUBJECT_LABELS[s]}
                    </Checkbox>
                  ))}
                </HStack>
              </CheckboxGroup>
            </FormControl>
            <FormControl>
              <FormLabel>备注（≤ 5000 字符）</FormLabel>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={5}
                maxLength={5000}
              />
            </FormControl>
          </Stack>
        </DrawerBody>
        <DrawerFooter>
          <Button variant="ghost" mr={3} onClick={onClose}>
            取消
          </Button>
          <Button colorScheme="brand" onClick={submit} isLoading={saving}>
            保存
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
