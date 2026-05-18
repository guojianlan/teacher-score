/**
 * Fixture · 2025 一月八省联考考前猜想卷 · 生物（D5 复刻样本）
 *
 * 数据源：tmp/cankao/ 三份原始文件
 *   - 考试版 A4.docx
 *   - 参考答案及评分标准.docx
 *   - 答题卡.pdf
 *
 * 复刻精度：
 *   - 选择题 15 道，答案 D A D B C B A C C D D D A B C → 100% 还原
 *   - 非选择题 5 道 (Q16-20)，标答按"评分标准"段录入
 *   - 子问编号 (1)(2)(3)(4) 按原卷
 *   - 关键空 maxScore 按"除标注外每空 1 分"规则 + 显式标注的 2/3/4 分
 *
 * 用途：
 *   - D5 测设计器 + PDF（不需要人工再录一遍）
 *   - D9/D14 e2e 测试的真实样本输入
 *   - 合成器（D6）的模板源
 */
import type { SheetQuestion, SheetLayoutSpec } from '../answer-sheet';

const MCQ_ANSWERS = 'DADBCBACCDDDABC'.split(''); // Q1-Q15

const mcq: SheetQuestion[] = MCQ_ANSWERS.map((ans, i) => ({
  no: String(i + 1),
  type: 'mcq',
  maxScore: 3,
  options: ['A', 'B', 'C', 'D'],
  correctOption: ans,
  knowledgeTags: [],
}));

const structured: SheetQuestion[] = [
  {
    no: '16',
    type: 'structured',
    maxScore: 11,
    prompt: '光合作用 · 光合产物 · 干旱条件下气孔与光呼吸',
    knowledgeTags: ['光合作用', '光反应', '暗反应'],
    subQuestions: [
      {
        no: '(1)',
        blanks: [
          { no: '1', expected: 'PGA', maxScore: 1, scoringMode: 'exact',
            alternateAcceptable: ['3-磷酸甘油酸', '3PGA'] },
          { no: '2', expected: '作为还原剂还原PGA；为PGA的还原提供能量', maxScore: 1,
            scoringMode: 'keyword',
            keywords: ['还原', 'PGA', '能量'] },
        ],
      },
      {
        no: '(2)',
        blanks: [
          { no: '1', expected: '蔗糖', maxScore: 1, scoringMode: 'exact' },
          { no: '2', expected: '等质量情况下蔗糖对渗透压的影响较小；蔗糖为非还原糖，性质（或结构）较稳定',
            maxScore: 2, scoringMode: 'keyword',
            keywords: ['渗透压', '非还原糖', '稳定'] },
        ],
      },
      {
        no: '(3)',
        blanks: [
          { no: '1', expected: '叶绿体、线粒体', maxScore: 1, scoringMode: 'exact',
            alternateAcceptable: ['线粒体、叶绿体', '叶绿体和线粒体', '线粒体和叶绿体'] },
          { no: '2',
            expected: '在干旱条件下，植物部分气孔关闭，导致CO2供应不足；强光照导致光反应中水的光解加快。产生的O2增多，O2浓度增大',
            maxScore: 2, scoringMode: 'keyword',
            keywords: ['气孔关闭', 'CO2', '光解', 'O2'] },
        ],
      },
      {
        no: '(4)',
        blanks: [
          { no: '1',
            expected: '改造Rubisco的相关基因，使Rubisco只能特异性结合CO2，避免光呼吸的发生',
            maxScore: 3, scoringMode: 'concept',
            keywords: ['Rubisco', 'CO2', '光呼吸'] },
        ],
      },
    ],
  },
  {
    no: '17',
    type: 'structured',
    maxScore: 12,
    prompt: '神经递质 5-HT · 抑郁症模型',
    knowledgeTags: ['神经递质', '突触传导'],
    subQuestions: [
      {
        no: '(1)',
        blanks: [
          { no: '1',
            expected: '5-HT与受体结合会引起钠离子大量内流，致使突触后膜的膜电位发生逆转，进而形成局部电流',
            maxScore: 2, scoringMode: 'keyword',
            keywords: ['钠离子', '内流', '膜电位', '逆转'] },
          { no: '2', expected: '化学信号→电信号', maxScore: 1, scoringMode: 'exact',
            alternateAcceptable: ['化学信号转化为电信号', '化学信号变电信号'] },
        ],
      },
      {
        no: '(2)',
        blanks: [
          { no: '1',
            expected: 'Flu抑制5-HT转运体的作用，减少突触前膜对5-HT的回收，使突触间隙中的5-HT维持在一定水平',
            maxScore: 3, scoringMode: 'keyword',
            keywords: ['转运体', '回收', '突触间隙', '5-HT'] },
        ],
      },
      {
        no: '(3)',
        blanks: [
          { no: '1', expected: '减少、增加', maxScore: 2, scoringMode: 'exact',
            alternateAcceptable: ['减少和增加', '减少；增加'] },
          { no: '2',
            expected: '与模型组相比，YSJ2模型组和Flu模型组在强迫游泳实验中小鼠不动时间均减少，但在旷场实验中，与模型组相比，YSJ2模型组小鼠运动总距离显著增加，而Flu模型组小鼠运动总距离增加不明显',
            maxScore: 3, scoringMode: 'concept',
            keywords: ['模型组', '不动时间', '运动总距离', 'YSJ2'] },
        ],
      },
      {
        no: '(4)',
        blanks: [
          { no: '1', expected: '向朋友倾诉、适当运动、调节压力、向专业人士咨询', maxScore: 1,
            scoringMode: 'concept', keywords: ['倾诉', '运动', '咨询'] },
        ],
      },
    ],
  },
  {
    no: '18',
    type: 'structured',
    maxScore: 10,
    prompt: '草地生态系统 · 群落演替 · 沙化治理',
    knowledgeTags: ['群落', '生态修复'],
    subQuestions: [
      {
        no: '(1)',
        blanks: [
          { no: '1', expected: '自我调节', maxScore: 1, scoringMode: 'exact' },
          { no: '2', expected: '次生', maxScore: 1, scoringMode: 'exact' },
          { no: '3', expected: '改变食物种类，形成不同食性；划分分布区域和活动范围；错开活动时间等',
            maxScore: 1, scoringMode: 'keyword',
            keywords: ['食物', '分布', '活动时间'] },
        ],
      },
      {
        no: '(2)',
        blanks: [
          { no: '1', expected: '灌木树冠低矮，具有防风固沙的功能；根系发达，能从土壤中吸收较多的水分，从而适应沙化环境',
            maxScore: 1, scoringMode: 'keyword',
            keywords: ['防风固沙', '根系', '水分'] },
        ],
      },
      {
        no: '(3)',
        blanks: [
          { no: '1', expected: '随机', maxScore: 1, scoringMode: 'exact' },
          { no: '2', expected: '烘干', maxScore: 1, scoringMode: 'exact',
            alternateAcceptable: ['干燥'] },
          { no: '3', expected: '土壤有机质的含量、提高植被盖度和地上生物量', maxScore: 1,
            scoringMode: 'keyword', keywords: ['有机质', '植被盖度', '生物量'] },
          { no: '4', expected: '酸化', maxScore: 1, scoringMode: 'exact',
            alternateAcceptable: ['pH下降', 'pH 下降'] },
          { no: '5', expected: '研究无机肥、有机肥的种类或配比对沙化草地生态修复的作用', maxScore: 2,
            scoringMode: 'keyword', keywords: ['无机肥', '有机肥', '配比', '修复'] },
        ],
      },
    ],
  },
  {
    no: '19',
    type: 'structured',
    maxScore: 11,
    prompt: 'PCR · 限制酶 · 转基因水稻',
    knowledgeTags: ['基因工程', 'PCR', '限制酶'],
    subQuestions: [
      {
        no: '(1)',
        blanks: [
          { no: '1', expected: '2、3', maxScore: 1, scoringMode: 'exact',
            alternateAcceptable: ['2和3', '2,3'] },
          { no: '2', expected: 'Taq DNA聚合酶在引物的3\'端添加脱氧核苷酸，从而延伸子链', maxScore: 1,
            scoringMode: 'keyword', keywords: ['Taq', '聚合酶', '3\'端', '延伸'] },
          { no: '3', expected: '14/16', maxScore: 1, scoringMode: 'exact',
            alternateAcceptable: ['7/8', '0.875'] },
        ],
      },
      {
        no: '(2)',
        blanks: [
          { no: '1', expected: 'BclⅠ、SmaⅠ', maxScore: 1, scoringMode: 'exact',
            alternateAcceptable: ['BclI、SmaI', 'BclⅠ和SmaⅠ'] },
          { no: '2', expected: 'GGATCC', maxScore: 1, scoringMode: 'exact' },
          { no: '3', expected: 'CCCGGG', maxScore: 1, scoringMode: 'exact' },
        ],
      },
      {
        no: '(3)',
        blanks: [
          { no: '1', expected: '以上都可以', maxScore: 1, scoringMode: 'keyword',
            keywords: ['都可以', '都可', '都能'] },
          { no: '2', expected: '植物的体细胞和受精卵都具有全能性', maxScore: 1,
            scoringMode: 'keyword', keywords: ['全能性'] },
          { no: '3', expected: '植物组织培养技术', maxScore: 1, scoringMode: 'exact',
            alternateAcceptable: ['组织培养'] },
        ],
      },
      {
        no: '(4)',
        blanks: [
          { no: '1', expected: '应该在盐胁迫条件下种植普通水稻和转基因水稻', maxScore: 1,
            scoringMode: 'keyword', keywords: ['盐胁迫', '普通水稻', '转基因水稻'] },
          { no: '2', expected: '株高、单株粒重、单株粒数、单株荚数、籽粒大小', maxScore: 1,
            scoringMode: 'keyword', keywords: ['株高', '粒重', '粒数'] },
        ],
      },
    ],
  },
  {
    no: '20',
    type: 'structured',
    maxScore: 11,
    prompt: '遗传病系谱 · 伴X染色体显性遗传',
    knowledgeTags: ['遗传规律', '伴性遗传'],
    subQuestions: [
      {
        no: '(1)',
        blanks: [
          { no: '1', expected: '常染色体隐性遗传', maxScore: 1, scoringMode: 'exact' },
          { no: '2', expected: '基因突变', maxScore: 1, scoringMode: 'exact' },
        ],
      },
      {
        no: '(2)',
        blanks: [
          { no: '1', expected: '伴X染色体显性遗传', maxScore: 1, scoringMode: 'exact' },
          { no: '2',
            expected: 'Ⅱ-4和Ⅱ-5均患乙病，生出不患乙病的儿子Ⅲ-4，可判断出乙病为显性遗传病；据题图分析，父亲Ⅱ-4对应图2中的a，只含乙病的突变基因，不含正常基因，可排除常染色体显性遗传',
            maxScore: 4, scoringMode: 'concept',
            keywords: ['显性', 'Ⅱ-4', 'Ⅱ-5', 'Ⅲ-4', '常染色体'] },
        ],
      },
      {
        no: '(3)',
        blanks: [
          { no: '1', expected: '1/183', maxScore: 2, scoringMode: 'exact',
            alternateAcceptable: ['1∶183', '1:183'] },
        ],
      },
      {
        no: '(4)',
        blanks: [
          { no: '1', expected: '可能', maxScore: 1, scoringMode: 'exact' },
          { no: '2', expected: '一定不', maxScore: 1, scoringMode: 'exact',
            alternateAcceptable: ['一定不会'] },
        ],
      },
    ],
  },
];

export const BIO_2025_MOCK_QUESTIONS: SheetQuestion[] = [...mcq, ...structured];

export const BIO_2025_MOCK_LAYOUT: SheetLayoutSpec = {
  mcqColumns: 3,
  pageSize: 'A4',
  headerFields: ['name', 'examId'],
};

export const BIO_2025_MOCK_META = {
  name: '2025 八省联考考前猜想卷 · 生物',
  subject: 'biology' as const,
  grade: '高三',
  totalScore: 100,
};
