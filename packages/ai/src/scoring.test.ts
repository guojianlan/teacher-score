import { describe, expect, it } from 'vitest';
import type { SheetBlank } from '@teacher-score/types';
import { scoreBlank, scoreMcq } from './scoring';

const CTX = { questionNo: '16', subQuestionNo: '(1)' };

describe('scoreBlank · exact 模式', () => {
  const blank: SheetBlank = { no: '1', expected: 'PGA', maxScore: 1, scoringMode: 'exact' };

  it('完全一致', () => {
    const r = scoreBlank(blank, 'PGA', CTX);
    expect(r.isCorrect).toBe(true);
    expect(r.scoreAwarded).toBe(1);
  });

  it('大小写/空白差异不影响', () => {
    expect(scoreBlank(blank, 'pga', CTX).isCorrect).toBe(true);
    expect(scoreBlank(blank, ' PGA ', CTX).isCorrect).toBe(true);
  });

  it('alternateAcceptable 也算对', () => {
    const b: SheetBlank = { ...blank, alternateAcceptable: ['3-磷酸甘油酸', '3PGA'] };
    expect(scoreBlank(b, '3-磷酸甘油酸', CTX).isCorrect).toBe(true);
    expect(scoreBlank(b, '3PGA', CTX).isCorrect).toBe(true);
  });

  it('集合等价：顺序不敏感（"叶绿体、线粒体" ⇔ "线粒体、叶绿体"）', () => {
    const b: SheetBlank = { no: '1', expected: '叶绿体、线粒体', maxScore: 1, scoringMode: 'exact' };
    expect(scoreBlank(b, '线粒体、叶绿体', CTX).isCorrect).toBe(true);
    expect(scoreBlank(b, '叶绿体,线粒体', CTX).isCorrect).toBe(true); // 逗号分隔
  });

  it('字面不匹配', () => {
    expect(scoreBlank(blank, 'ATP', CTX).isCorrect).toBe(false);
    expect(scoreBlank(blank, 'ATP', CTX).scoreAwarded).toBe(0);
  });

  it('未答', () => {
    expect(scoreBlank(blank, '', CTX).reason).toContain('未答');
    expect(scoreBlank(blank, '   ', CTX).scoreAwarded).toBe(0);
  });
});

describe('scoreBlank · keyword 模式', () => {
  const blank: SheetBlank = {
    no: '1',
    expected: '在干旱条件下，植物部分气孔关闭，导致CO2供应不足；强光照导致光反应中水的光解加快',
    maxScore: 2,
    scoringMode: 'keyword',
    keywords: ['气孔关闭', 'CO2', '光解'],
  };

  it('全命中给满分', () => {
    const r = scoreBlank(blank, '气孔关闭后CO2不足，光解加快', CTX);
    expect(r.scoreAwarded).toBe(2);
    expect(r.matchedKeywords).toEqual(['气孔关闭', 'CO2', '光解']);
  });

  it('部分命中按比例（向下取整到 0.5）', () => {
    const r = scoreBlank(blank, '气孔关闭后CO2', CTX);
    // 2/3 ≈ 0.667；2 × 0.667 = 1.333 → floor(2.67/1)/2 → 1.0
    expect(r.scoreAwarded).toBe(1);
    expect(r.matchedKeywords).toEqual(['气孔关闭', 'CO2']);
  });

  it('低于 80% 命中视为错（仍给部分分）', () => {
    const r = scoreBlank(blank, '气孔关闭后CO2', CTX); // 2/3 ≈ 67%
    expect(r.isCorrect).toBe(false);
    expect(r.scoreAwarded).toBeGreaterThan(0);  // 给了部分分
  });

  it('80% 以上命中视为对', () => {
    const b = { ...blank, keywords: ['a', 'b', 'c', 'd', 'e'] };
    const r = scoreBlank(b, 'abcd everywhere', CTX); // 4/5 = 80%
    expect(r.isCorrect).toBe(true);
  });

  it('不到 60% 命中视为错', () => {
    const r = scoreBlank(blank, '只有光解', CTX);
    expect(r.isCorrect).toBe(false);
  });
});

describe('scoreMcq', () => {
  it('正确选项', () => {
    const r = scoreMcq('1', 'D', 'D', 3);
    expect(r.isCorrect).toBe(true);
    expect(r.scoreAwarded).toBe(3);
  });

  it('错误选项', () => {
    const r = scoreMcq('1', 'D', 'A', 3);
    expect(r.isCorrect).toBe(false);
    expect(r.scoreAwarded).toBe(0);
  });

  it('大小写不敏感', () => {
    expect(scoreMcq('1', 'D', 'd', 3).isCorrect).toBe(true);
  });
});
